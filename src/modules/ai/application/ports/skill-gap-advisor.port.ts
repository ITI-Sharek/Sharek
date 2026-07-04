export interface SkillGapInput {
  contributorId: string;
  taskId: string;
  missingSkills: string[];
}

export interface SkillGapResult {
  recommendations: string[];
  provider: string;
  model: string;
  promptVersion: string;
}

export abstract class SkillGapAdvisor {
  abstract generate(input: SkillGapInput): Promise<SkillGapResult>;
}

