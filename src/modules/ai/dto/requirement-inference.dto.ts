import {
  ContributionRequestDifficulty,
  ContributionRequestRequirementKind,
  ContributionRequestSkillRequirementConfidence,
  SkillProfileProficiencyLevel,
} from '@prisma/client';

/**
 * What the agent is allowed to see: the work, and nothing else.
 *
 * There is deliberately no contributor field here. The FastAPI contract forbids
 * extras and would reject one, but the absence is worth preserving on this side
 * too — the agent is asked what the *work* demands, and a client that could
 * express a contributor would eventually be handed one.
 */
export interface RequirementInferenceInput {
  /**
   * The correlation id the wire contract names `contributionRequestId`.
   *
   * On the Proposal path (`P0-B04`) it carries a Contribution Proposal id
   * instead. The field is opaque to the agent — it is never compared against
   * anything and never resolved — so reusing it is honest enough, and the
   * alternative was a second FastAPI contract that differs by one field name.
   */
  contributionRequestId: string;
  title: string;
  description: string;
  requirementTexts: string[];
  technologyTags: string[];
  difficulty: ContributionRequestDifficulty | null;
  contractVersion: 'requirement-inference-v1';
}

export interface InferredSkillRequirement {
  skillName: string;
  requiredLevel: SkillProfileProficiencyLevel;
  kind: ContributionRequestRequirementKind;
  confidence: ContributionRequestSkillRequirementConfidence;
}

export interface RequirementInferenceResult {
  skills: InferredSkillRequirement[];
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  serviceVersion: string;
  latencyMs?: number;
}
