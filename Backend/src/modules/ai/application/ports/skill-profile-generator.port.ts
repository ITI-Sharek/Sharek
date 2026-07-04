export interface SkillProfileInput {
  contributorId: string;
  evidenceIds: string[];
}

export interface GeneratedSkillCandidate {
  name: string;
  proficiency: 'beginner' | 'intermediate' | 'advanced';
  confidence: number;
  evidenceIds: string[];
}

export interface SkillProfileResult {
  skills: GeneratedSkillCandidate[];
  provider: string;
  model: string;
  promptVersion: string;
}

export abstract class SkillProfileGenerator {
  abstract generate(input: SkillProfileInput): Promise<SkillProfileResult>;
}

