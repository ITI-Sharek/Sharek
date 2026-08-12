export interface SkillGapGuidanceRequirementSnapshot {
  id: string;
  kind: 'required' | 'preferred';
  position: number;
  text: string;
}

export interface SkillGapGuidanceApprovedSkillSnapshot {
  evidenceId: string;
  name: string;
  proficiency: 'beginner' | 'intermediate' | 'advanced';
  evidenceSummary?: string | null;
}

export interface SkillGapGuidanceEvidenceCapsule {
  evidenceId: string;
  type:
    | 'approved_skill'
    | 'contribution_requirement'
    | 'curated_learning_resource';
  label: string;
  summary?: string | null;
}

export interface SkillGapGuidanceInput {
  guidanceRequestId: string;
  requirements: SkillGapGuidanceRequirementSnapshot[];
  approvedSkills: SkillGapGuidanceApprovedSkillSnapshot[];
  evidence: SkillGapGuidanceEvidenceCapsule[];
  allowedEvidenceIds: string[];
  requestedAt: string;
  contractVersion: 'skill-gap-guidance-v1';
}

export interface SkillGapGuidanceMissingSkill {
  requirementId: string;
  skillName: string;
  gap: 'not_evidenced' | 'below_target_proficiency';
  explanation: string;
  evidenceIds: string[];
  uncertainty: string[];
}

export interface SkillGapGuidanceRecommendedTechnology {
  name: string;
  rationale: string;
  evidenceIds: string[];
}

export interface SkillGapGuidanceLearningResource {
  title: string;
  resourceType: 'documentation' | 'course' | 'tutorial' | 'book' | 'reference';
  url: string;
  rationale: string;
  evidenceIds: string[];
}

export interface SkillGapGuidancePracticeProject {
  title: string;
  description: string;
  technologies: string[];
  evidenceIds: string[];
}

export interface SkillGapGuidanceImprovementStep {
  step: string;
  focus: string;
  estimatedDuration: string | null;
  evidenceIds: string[];
}

export interface SkillGapGuidanceSource {
  evidenceId: string;
  label: string;
  type:
    | 'approved_skill'
    | 'contribution_requirement'
    | 'curated_learning_resource';
}

export interface SkillGapGuidanceMetadata {
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  serviceVersion: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export type SkillGapGuidanceResult =
  | { kind: 'no_assessable_evidence' }
  | { kind: 'system_limit' }
  | {
      kind: 'completed';
      missingSkills: SkillGapGuidanceMissingSkill[];
      recommendedTechnologies: SkillGapGuidanceRecommendedTechnology[];
      learningResources: SkillGapGuidanceLearningResource[];
      practiceProjects: SkillGapGuidancePracticeProject[];
      improvementPath: SkillGapGuidanceImprovementStep[];
      sources: SkillGapGuidanceSource[];
      metadata: SkillGapGuidanceMetadata;
    };
