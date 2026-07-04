export type EligibilityRecommendation =
  | 'eligible'
  | 'rejected'
  | 'manual_review';

export interface EligibilityInput {
  contributorId: string;
  taskId: string;
  approvedSkillIds: string[];
  evidenceIds: string[];
}

export interface EligibilityResult {
  recommendation: EligibilityRecommendation;
  confidence: number;
  matchedSkillIds: string[];
  missingSkills: string[];
  evidenceIds: string[];
  provider: string;
  model: string;
  promptVersion: string;
  reasonSummary: string;
}

export abstract class EligibilityAnalyzer {
  abstract analyze(input: EligibilityInput): Promise<EligibilityResult>;
}

