import {
  ContributionRequestDifficulty,
  ContributionRequestRequirementKind,
  ContributionRequestSkillRequirementConfidence,
  SkillProfileProficiencyLevel,
} from '@prisma/client';

/**
 * What the agent is allowed to see: the Contribution Request, and nothing else.
 *
 * There is deliberately no contributor field here. The FastAPI contract forbids
 * extras and would reject one, but the absence is worth preserving on this side
 * too — the agent is asked what the *work* demands, and a client that could
 * express a contributor would eventually be handed one.
 */
export interface RequirementInferenceInput {
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
