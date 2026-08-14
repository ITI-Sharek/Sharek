import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import { ApplicationError } from '../../../shared/errors/application.error';
import { normalizeSkillName } from '../../../shared/skills/skill-name';
import { AiService } from '../../ai/ai.service';
import {
  BlockingSkillDto,
  EligibilityVerdictDto,
  RequiredSkillLevelDto,
} from '../../eligibility/dto/eligibility.dto';
import { EligibilityService } from '../../eligibility/services/eligibility.service';

/** The proposal content a bar can be inferred from. */
export interface ProposalContent {
  title: string;
  problemOrOpportunity: string;
  proposedOutcome: string;
  projectBenefit: string;
}

/**
 * The gate on the second contribution path (DEC-078, `P0-B04`).
 *
 * A proposer has no owner-authored Request to be measured against — they wrote
 * the work themselves. Without this, the gate on Applications would be trivially
 * avoidable: describe the same work as a Proposal instead of applying for it.
 *
 * So the bar is inferred from the **proposal content**, and compared against the
 * proposer's approved skills by the same `EligibilityService` the Application
 * path uses. One comparison, one payload shape, two triggers.
 */
@Injectable()
export class ProposalEligibilityService {
  private readonly logger = new Logger(ProposalEligibilityService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly ai: AiService,
    private readonly eligibility: EligibilityService,
  ) {}

  /**
   * Off in tests, on everywhere else — the `*_ENABLED` convention the queues
   * already follow.
   *
   * It exists because this path needs a **live provider on the request thread**,
   * unlike the draft path which queues. With no AI service reachable, every
   * proposal submission would fail open with a retriable error, which would make
   * local development and the existing proposal suite depend on infrastructure
   * that has nothing to do with what they are testing. The gate's own tests turn
   * it on explicitly.
   */
  isEnabled(): boolean {
    return this.config.get<boolean>(
      'PROPOSAL_ELIGIBILITY_GATE_ENABLED',
      this.config.get<string>('NODE_ENV', 'development') !== 'test',
    );
  }

  /**
   * Infer the bar this proposal's own work implies.
   *
   * Runs **outside** the caller's transaction, deliberately: it is an HTTP call
   * to a provider, and holding a database connection open across one would tie
   * up the pool for as long as the model takes. There is no staleness risk in
   * doing so — the bar is derived from content the proposer submitted in this
   * same request, so nothing can change it in between.
   *
   * **Fails open.** A provider failure raises a retriable error, never a
   * verdict. This is the one deliberate asymmetry with the Application path,
   * where the bar is already frozen on the Request and a provider is not
   * involved at submit time: here the provider is on the critical path, and an
   * outage presented as "your skills are insufficient" would be a false
   * statement about a person that they cannot act on or appeal.
   */
  async inferRequiredSkills(
    subjectId: string,
    content: ProposalContent,
  ): Promise<RequiredSkillLevelDto[]> {
    try {
      const result = await this.ai.inferRequirementSkills({
        // The wire contract names this `contributionRequestId`; it is an opaque
        // correlation id and carries the Proposal id here.
        contributionRequestId: subjectId,
        title: content.title,
        description: content.proposedOutcome,
        // The proposer's own framing of the problem and the benefit. Sent as
        // requirement texts because that is what they are on this path: the
        // statement of what the work involves.
        requirementTexts: [
          content.problemOrOpportunity,
          content.projectBenefit,
        ].filter((text) => text.trim().length > 0),
        technologyTags: [],
        difficulty: null,
        contractVersion: 'requirement-inference-v1',
      });

      return result.skills
        .map((skill) => ({
          skillName: skill.skillName,
          skillNameNormalized: normalizeSkillName(skill.skillName),
          requiredLevel: skill.requiredLevel,
          kind: skill.kind,
        }))
        .filter((skill) => skill.skillNameNormalized.length > 0);
    } catch (error) {
      this.logger.warn(
        `Requirement inference unavailable for proposal ${subjectId}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw this.unavailable();
    }
  }

  /**
   * The verdict, computed inside the caller's transaction so the proposer's
   * approved skills are read under the same locks the write will use.
   */
  async evaluate(input: {
    contributorId: string;
    requiredSkills: RequiredSkillLevelDto[];
    transaction: Prisma.TransactionClient;
  }): Promise<EligibilityVerdictDto> {
    return this.eligibility.computeVerdict(input);
  }

  /** Record a verdict against a Proposal that now exists. */
  async recordEvaluation(input: {
    contributorId: string;
    contributionProposalId: string;
    verdict: EligibilityVerdictDto;
    transaction: Prisma.TransactionClient;
  }): Promise<void> {
    await this.eligibility.recordProposalEvaluation(input);
  }

  /** Record a refusal after the transaction carrying it has rolled back. */
  async recordBlocked(input: {
    contributorId: string;
    contributionProposalId: string;
    blockingSkills: BlockingSkillDto[];
  }): Promise<void> {
    await this.eligibility.recordBlocked(input);
  }

  /**
   * The same payload shape the Application block returns — one shape, two
   * triggers. A contributor who hits both should not have to learn two formats.
   */
  blockedError(blockingSkills: BlockingSkillDto[]): ApplicationError {
    return this.eligibility.blockedError(
      'PROPOSAL_BLOCKED_SKILL_GAP',
      blockingSkills,
    );
  }

  /**
   * 503, not 403, and a distinct code.
   *
   * `P0-B04` requires a provider outage to be distinguishable from a skill
   * block — by status and by code, so a client cannot conflate them even by
   * accident. A retriable error tells the proposer to try again; a block tells
   * them something about themselves that is not true here.
   */
  private unavailable(): ApplicationError {
    return new ApplicationError(
      'Eligibility could not be evaluated right now. Please try again.',
      'PROPOSAL_ELIGIBILITY_UNAVAILABLE',
      503,
      { retriable: true },
    );
  }
}
