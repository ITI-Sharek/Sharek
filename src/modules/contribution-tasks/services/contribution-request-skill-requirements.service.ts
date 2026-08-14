import { forwardRef, Inject, Injectable } from '@nestjs/common';
import {
  ContributionRequestRequirementKind,
  ContributionRequestSkillRequirementSource,
  ContributionRequestStatus,
  Prisma,
} from '@prisma/client';

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { DatabaseService } from '../../../shared/database/database.service';
import {
  ConflictApplicationError,
  ForbiddenApplicationError,
  NotFoundApplicationError,
  UnprocessableApplicationError,
} from '../../../shared/errors/application.error';
import { normalizeSkillName } from '../../../shared/skills/skill-name';
import { ProjectsService } from '../../projects/projects.service';
import {
  ContributionRequestSkillRequirementDto,
  ContributionRequestSkillRequirementInputDto,
  MAX_SKILL_REQUIREMENTS,
} from '../dto/contribution-request-skill-requirement.dto';

/**
 * The level bar a Contribution Request sets.
 *
 * Kept apart from `ContributionTasksService` because the two answer different
 * questions about the same aggregate and change for different reasons: that
 * service owns the owner-authored draft contract, this one owns the
 * machine-comparable skill levels that an Eligibility Evaluation reads. The
 * draft service is already 1,300 lines and the AI write path (`P0-B02`) lands
 * here next.
 *
 * This issue is persistence and the owner write path only — no inference, no
 * evaluation, no blocking.
 */
@Injectable()
export class ContributionRequestSkillRequirementsService {
  constructor(
    private readonly database: DatabaseService,
    @Inject(forwardRef(() => ProjectsService))
    private readonly projectsService: ProjectsService,
  ) {}

  /**
   * Replace the owner-authored set for a draft Request.
   *
   * Every check that matters runs **inside** the transaction and behind a row
   * lock, because the thing being defended against is a concurrent publish: a
   * status read before the transaction could be stale by the time the rows are
   * written, and the whole point of the freeze is that no row changes after
   * publication. The `FOR UPDATE` here overlaps the lock
   * `ContributionRequestPublicationService` takes over the owner's Requests, so
   * a publish and an edit serialize rather than interleave.
   */
  async replaceOwnerSkillRequirements(input: {
    user: AuthenticatedUser;
    requestId: string;
    skillRequirements: ContributionRequestSkillRequirementInputDto[];
  }): Promise<ContributionRequestSkillRequirementDto[]> {
    this.assertActiveOwner(input.user);
    const rows = this.normalizeInput(input.skillRequirements);

    return this.database.$transaction(async (transaction) => {
      const locked = await this.lockOwnedRequest(
        transaction,
        input.user.id,
        input.requestId,
      );
      await this.projectsService.lockContributionRequestProjectAccess(
        locked.project_id,
        input.user.id,
        transaction,
      );
      this.assertNotFrozen(locked.status);

      await transaction.contributionRequestSkillRequirement.deleteMany({
        where: { contribution_request_id: locked.id },
      });
      if (rows.length > 0) {
        await transaction.contributionRequestSkillRequirement.createMany({
          data: rows.map((row, position) => ({
            contribution_request_id: locked.id,
            skill_name: row.skillName,
            skill_name_normalized: row.skillNameNormalized,
            required_level: row.requiredLevel,
            kind: row.kind,
            // An owner writing through this endpoint is by definition the
            // human override, and `P0-B02` must not overwrite these rows on a
            // later inference run.
            source: ContributionRequestSkillRequirementSource.owner_override,
            confidence: null,
            position,
          })),
        });
      }

      return this.readSet(transaction, locked.id);
    });
  }

  /** The owner's view of the current set, including drafts. */
  async listForOwner(
    user: AuthenticatedUser,
    requestId: string,
  ): Promise<ContributionRequestSkillRequirementDto[]> {
    this.assertActiveOwner(user);
    const request = await this.database.contributionRequest.findFirst({
      where: { id: requestId, owner_id: user.id },
      select: { id: true },
    });
    if (!request) throw this.requestNotFound();
    return this.readSet(this.database, request.id);
  }

  /**
   * The set as it must be frozen onto an Application, read inside the caller's
   * transaction. `applications` calls this while holding its own locks, so it
   * takes a transaction client rather than opening one.
   *
   * Both `required` and `preferred` rows are returned: the snapshot records
   * what the Request asked for, and it is the *evaluation* that ignores
   * `preferred`. Filtering here would make the snapshot a lossy record of the
   * bar and leave a later dispute unable to reconstruct it.
   */
  async readSnapshotRows(
    requestId: string,
    transaction: Prisma.TransactionClient,
  ): Promise<ContributionRequestSkillRequirementDto[]> {
    return this.readSet(transaction, requestId);
  }

  private async readSet(
    client: Prisma.TransactionClient | DatabaseService,
    requestId: string,
  ): Promise<ContributionRequestSkillRequirementDto[]> {
    const rows = await client.contributionRequestSkillRequirement.findMany({
      where: { contribution_request_id: requestId },
      orderBy: [{ kind: 'asc' }, { position: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      skillName: row.skill_name,
      requiredLevel: row.required_level,
      kind: row.kind,
      source: row.source,
      confidence: row.confidence,
      position: row.position,
    }));
  }

  private async lockOwnedRequest(
    transaction: Prisma.TransactionClient,
    ownerId: string,
    requestId: string,
  ): Promise<{ id: string; project_id: string; status: ContributionRequestStatus }> {
    const rows = await transaction.$queryRaw<
      Array<{ id: string; project_id: string; status: ContributionRequestStatus }>
    >(Prisma.sql`
      SELECT "id", "project_id", "status"
      FROM "ContributionRequest"
      WHERE "id" = ${requestId}::uuid AND "owner_id" = ${ownerId}::uuid
      FOR UPDATE
    `);
    const request = rows[0];
    if (!request) throw this.requestNotFound();
    return request;
  }

  /**
   * Trim, normalize, and reject a set that cannot be stored coherently.
   *
   * Duplicate detection uses the *normalized* name, matching the unique index
   * exactly. Rejecting here turns what would otherwise surface as a `P2002`
   * into an error naming the skill the owner typed twice.
   */
  private normalizeInput(
    inputs: ContributionRequestSkillRequirementInputDto[],
  ): Array<{
    skillName: string;
    skillNameNormalized: string;
    requiredLevel: ContributionRequestSkillRequirementInputDto['requiredLevel'];
    kind: ContributionRequestRequirementKind;
  }> {
    if (inputs.length > MAX_SKILL_REQUIREMENTS) {
      throw new UnprocessableApplicationError(
        `At most ${MAX_SKILL_REQUIREMENTS} skill requirements are allowed`,
        'REQUEST_SKILL_REQUIREMENTS_TOO_MANY',
        { limit: MAX_SKILL_REQUIREMENTS, received: inputs.length },
      );
    }

    const seen = new Map<string, string>();
    return inputs.map((input) => {
      const skillName = input.skillName.trim();
      const skillNameNormalized = normalizeSkillName(skillName);
      // A name of only punctuation normalizes to the empty string. Storing two
      // of those would violate the unique index, and neither could ever match a
      // contributor's skill, so it is refused rather than silently dropped.
      if (skillNameNormalized.length === 0) {
        throw new UnprocessableApplicationError(
          'A skill name must contain at least one letter or digit',
          'REQUEST_SKILL_REQUIREMENT_NAME_INVALID',
          { skillName },
        );
      }
      const previous = seen.get(skillNameNormalized);
      if (previous !== undefined) {
        throw new UnprocessableApplicationError(
          'A skill can be required only once per Contribution Request',
          'REQUEST_SKILL_REQUIREMENT_DUPLICATE',
          { skillName, conflictsWith: previous },
        );
      }
      seen.set(skillNameNormalized, skillName);
      return {
        skillName,
        skillNameNormalized,
        requiredLevel: input.requiredLevel,
        kind: input.kind,
      };
    });
  }

  /**
   * The freeze (ADR 0015). Anything other than a draft refuses the write —
   * including `cancelled` and `completed`, because the set is the historical
   * basis of every Application already submitted against the Request.
   */
  private assertNotFrozen(status: ContributionRequestStatus): void {
    if (status !== ContributionRequestStatus.draft) {
      throw new ConflictApplicationError(
        'Skill requirements freeze when a Contribution Request is published',
        'REQUEST_SKILL_REQUIREMENTS_FROZEN',
        { status },
      );
    }
  }

  private assertActiveOwner(user: AuthenticatedUser): void {
    if (user.status !== 'active' || user.role !== 'owner') {
      throw new ForbiddenApplicationError(
        'An active owner account is required to manage Contribution Requests',
        'CONTRIBUTION_REQUEST_OWNER_ACCESS_REQUIRED',
      );
    }
  }

  private requestNotFound(): NotFoundApplicationError {
    return new NotFoundApplicationError(
      'Contribution Request was not found',
      'CONTRIBUTION_REQUEST_NOT_FOUND',
    );
  }
}
