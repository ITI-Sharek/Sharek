import {
  ContributionRequestRequirementKind,
  ContributionRequestStatus,
  SkillProfileProficiencyLevel,
} from '@prisma/client';

export interface ApplicationRequestRequirementContextDto {
  id: string;
  kind: ContributionRequestRequirementKind;
  position: number;
  text: string;
}

/**
 * The level bar as the submission path sees it. Carries no `confidence` or
 * `source`: the Application snapshot records what was demanded, and how
 * confident a model was in proposing it is not part of that record.
 */
export interface ApplicationRequestSkillRequirementContextDto {
  id: string;
  skillName: string;
  skillNameNormalized: string;
  requiredLevel: SkillProfileProficiencyLevel;
  kind: ContributionRequestRequirementKind;
  position: number;
}

export interface ApplicationRequestContextDto {
  id: string;
  ownerId: string;
  status: ContributionRequestStatus;
  applicationsCloseAt: Date | null;
  updatedAt: Date;
  requirements: ApplicationRequestRequirementContextDto[];
  /**
   * Frozen at publication. Read under the same lock as the rest of the context
   * so that what gets snapshotted onto the Application is what the evaluation
   * in `P0-B03` will compare against — not a set that changed in between.
   */
  skillRequirements: ApplicationRequestSkillRequirementContextDto[];
}
