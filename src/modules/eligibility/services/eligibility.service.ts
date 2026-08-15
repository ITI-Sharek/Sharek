import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { EligibilityOutcome, Prisma } from '@prisma/client';

import { DatabaseService } from '../../../shared/database/database.service';
import {
  ForbiddenApplicationError,
  NotFoundApplicationError,
} from '../../../shared/errors/application.error';
import { ContributionTasksService } from '../../contribution-tasks/services/contribution-tasks.service';
import { SkillProfileSummaryService } from '../../skill-profiles/services/skill-profile-summary.service';
import {
  ApprovedSkillLevelDto,
  BlockingSkillDto,
  EligibilityPreviewDto,
  EligibilityVerdictDto,
  RequiredSkillLevelDto,
} from '../dto/eligibility.dto';
import { findBlockingSkills, indexApprovedSkills, meetsLevel } from './skill-level-comparison';

/** The version of the comparison contract that produces these rows. */
const COMPARISON_CONTRACT_VERSION = 1;

/**
 * The gate (DEC-078, ADR 0015).
 *
 * Owns `EligibilityEvaluation` and nothing else. The bar comes from
 * `contribution-tasks` and the approved skills from `skill-profiles`, both
 * through their exported services — this module never reads another module's
 * tables.
 *
 * It answers exactly one question: may this person submit? It does not rank,
 * score, or influence who the owner picks; that is Advisory Fit's separate job,
 * and it stays decision-neutral.
 */
@Injectable()
export class EligibilityService {
  constructor(
    private readonly database: DatabaseService,
    @Inject(forwardRef(() => ContributionTasksService))
    private readonly contributionTasks: ContributionTasksService,
    private readonly skillProfiles: SkillProfileSummaryService,
  ) {}

  /**
   * The authoritative evaluation, run **inside the caller's transaction**.
   *
   * Takes a transaction client rather than opening one, because the verdict has
   * to be computed against the same locked rows the submission will use. A
   * verdict computed before the transaction — including one the read endpoint
   * returned a second earlier — can be stale by the time the Application is
   * written, which is the TOCTOU the whole gate would otherwise have.
   *
   * Both outcomes end up recorded — logging only refusals would make the table
   * a list of accusations with no denominator, and leave "was this person
   * evaluated at all?" unanswerable in a dispute — but by different routes; see
   * the comment on the write below.
   */
  async evaluateForRequest(input: {
    contributorId: string;
    contributionRequestId: string;
    requiredSkills: RequiredSkillLevelDto[];
    transaction: Prisma.TransactionClient;
  }): Promise<EligibilityVerdictDto> {
    const approvedSkills = await this.readApprovedSkills(
      input.contributorId,
      input.transaction,
    );
    const blockingSkills = findBlockingSkills(
      input.requiredSkills,
      approvedSkills,
    );
    const outcome =
      blockingSkills.length === 0
        ? EligibilityOutcome.eligible
        : EligibilityOutcome.blocked;

    // An `eligible` verdict is recorded here, inside the caller's transaction,
    // because it belongs with the Application it permitted: if the submission
    // rolls back for some later reason, the record of having been let through
    // should roll back with it.
    //
    // A `blocked` verdict is deliberately NOT written here. The caller throws
    // to refuse the submission, which rolls this transaction back — so a row
    // written now would vanish, and the refusal would leave no trace. The
    // caller records it through `recordBlocked` on a fresh connection instead.
    if (outcome === EligibilityOutcome.eligible) {
      await this.writeEvaluation(input.transaction, {
        contributorId: input.contributorId,
        contributionRequestId: input.contributionRequestId,
        outcome,
        blockingSkills,
      });
    }

    return { outcome, blockingSkills };
  }

  /**
   * The comparison alone, with nothing persisted.
   *
   * The Proposal path needs this split because the thing an evaluation would
   * point at does not exist yet: a proposal must be refused *before* its row is
   * created, so the verdict has to be computable before there is anything to
   * attach it to. The Application path keeps its combined
   * `evaluateForRequest`, where the target is the Request and already exists.
   */
  async computeVerdict(input: {
    contributorId: string;
    requiredSkills: RequiredSkillLevelDto[];
    transaction: Prisma.TransactionClient;
  }): Promise<EligibilityVerdictDto> {
    const approvedSkills = await this.readApprovedSkills(
      input.contributorId,
      input.transaction,
    );
    const blockingSkills = findBlockingSkills(
      input.requiredSkills,
      approvedSkills,
    );
    return {
      outcome:
        blockingSkills.length === 0
          ? EligibilityOutcome.eligible
          : EligibilityOutcome.blocked,
      blockingSkills,
    };
  }

  /**
   * Record a Proposal-scoped evaluation on the caller's transaction.
   *
   * Called after the Proposal (or its new version) exists, because the CHECK
   * permits exactly one target and a row pointing at nothing is not storable —
   * deliberately, since a refusal nobody can attribute is not reproducible.
   */
  async recordProposalEvaluation(input: {
    contributorId: string;
    contributionProposalId: string;
    verdict: EligibilityVerdictDto;
    transaction: Prisma.TransactionClient;
  }): Promise<void> {
    await this.writeEvaluation(input.transaction, {
      contributorId: input.contributorId,
      contributionProposalId: input.contributionProposalId,
      outcome: input.verdict.outcome,
      blockingSkills: input.verdict.blockingSkills,
    });
  }

  /**
   * Persist a refusal on its own connection, so it survives the rollback that
   * the refusal itself causes.
   *
   * This is the artefact a dispute is argued from and the handle `P0-B05` hangs
   * skill-gap guidance on, so losing it would leave a contributor told only
   * "you are blocked" with nothing to act on. It returns the row id for that
   * reason.
   */
  async recordBlocked(input: {
    contributorId: string;
    contributionRequestId?: string;
    contributionProposalId?: string;
    blockingSkills: BlockingSkillDto[];
  }): Promise<string> {
    const created = await this.writeEvaluation(this.database, {
      contributorId: input.contributorId,
      contributionRequestId: input.contributionRequestId,
      contributionProposalId: input.contributionProposalId,
      outcome: EligibilityOutcome.blocked,
      blockingSkills: input.blockingSkills,
    });
    return created.id;
  }

  private writeEvaluation(
    client: Prisma.TransactionClient | DatabaseService,
    input: {
      contributorId: string;
      contributionRequestId?: string;
      contributionProposalId?: string;
      outcome: EligibilityOutcome;
      blockingSkills: BlockingSkillDto[];
    },
  ): Promise<{ id: string }> {
    return client.eligibilityEvaluation.create({
      data: {
        contributor_id: input.contributorId,
        contribution_request_id: input.contributionRequestId ?? null,
        contribution_proposal_id: input.contributionProposalId ?? null,
        outcome: input.outcome,
        blocking_skills:
          input.blockingSkills as unknown as Prisma.InputJsonValue,
        requirement_snapshot_version: COMPARISON_CONTRACT_VERSION,
      },
      select: { id: true },
    });
  }

  /**
   * The refusal a caller raises when the verdict is `blocked`.
   *
   * Built here so both contribution paths return one payload shape — the
   * Application block and the Proposal block are the same situation with two
   * triggers, and a contributor who hits both should not have to learn two
   * error formats.
   */
  blockedError(
    code: 'APPLICATION_BLOCKED_SKILL_GAP' | 'PROPOSAL_BLOCKED_SKILL_GAP',
    blockingSkills: BlockingSkillDto[],
    /**
     * The recorded evaluation, when the caller has one. Guidance is scoped to
     * it, so without it a client can name the gap but never ask for the
     * narrative. Absent on a blocked Proposal *create*, where the CHECK permits
     * no evaluation because the Proposal was never written.
     */
    eligibilityEvaluationId?: string,
  ): ForbiddenApplicationError {
    const error = new ForbiddenApplicationError(
      'Your approved skills do not yet meet the level this work requires',
      code,
    );
    // Everything the UI needs to explain the refusal without a second call:
    // each skill, the level demanded, and the level held (null when none).
    (error as { metadata?: Record<string, unknown> }).metadata = {
      blockingSkills,
      ...(eligibilityEvaluationId ? { eligibilityEvaluationId } : {}),
    };
    return error;
  }

  /**
   * The read-only pre-flight, so the UI can show the state before a contributor
   * commits to filling in a form.
   *
   * Advisory to the client by construction: it writes no evaluation row and its
   * answer is never trusted at submit time. Naming that here matters, because
   * the tempting optimisation — "we already checked, skip it in the
   * transaction" — is exactly the bug.
   */
  async previewForRequest(
    contributorId: string,
    contributionRequestId: string,
  ): Promise<EligibilityPreviewDto> {
    const context =
      await this.contributionTasks.getApplicationSubmissionContext(
        contributionRequestId,
      );
    // Same audience-safe not-found the public detail route returns, so this
    // endpoint cannot be used to discover unpublished Request IDs.
    if (!context) {
      throw new NotFoundApplicationError(
        'Contribution Request was not found',
        'CONTRIBUTION_REQUEST_NOT_FOUND',
      );
    }

    const approvedSkills = await this.readApprovedSkills(
      contributorId,
      this.database as unknown as Prisma.TransactionClient,
    );
    const held = indexApprovedSkills(approvedSkills);
    const requiredSkills = context.skillRequirements.filter(
      (skill) => skill.kind === 'required',
    );

    const rows = requiredSkills.map((skill) => {
      const contributorLevel = held.get(skill.skillNameNormalized) ?? null;
      return {
        skillName: skill.skillName,
        requiredLevel: skill.requiredLevel,
        contributorLevel,
        met:
          contributorLevel !== null &&
          meetsLevel(contributorLevel, skill.requiredLevel),
      };
    });

    const blockingSkills = rows
      .filter((row) => !row.met)
      .map((row) => ({
        skillName: row.skillName,
        requiredLevel: row.requiredLevel,
        contributorLevel: row.contributorLevel,
      }));

    return {
      contributionRequestId,
      outcome:
        blockingSkills.length === 0
          ? EligibilityOutcome.eligible
          : EligibilityOutcome.blocked,
      blockingSkills,
      requiredSkills: rows,
    };
  }

  /**
   * Approved skills only, through the module that owns what "approved" means.
   *
   * The same capability the Application evidence snapshot uses, deliberately:
   * a contributor must never be measured against a set of skills different from
   * the one recorded on their Application. Pending, rejected, disputed, and
   * unauthorized-generation skills are excluded there, so they are excluded
   * here without this module restating the rule.
   */
  private async readApprovedSkills(
    contributorId: string,
    transaction: Prisma.TransactionClient,
  ): Promise<ApprovedSkillLevelDto[]> {
    const skills =
      await this.skillProfiles.listAuthorizedSkillsForApplicationSnapshot(
        contributorId,
        transaction,
      );
    return skills.map((skill) => ({
      name: skill.name,
      proficiencyLevel: skill.proficiencyLevel,
    }));
  }
}
