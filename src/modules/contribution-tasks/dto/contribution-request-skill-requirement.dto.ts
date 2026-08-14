import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import {
  ContributionRequestRequirementKind,
  ContributionRequestSkillRequirementConfidence,
  ContributionRequestSkillRequirementSource,
  SkillProfileProficiencyLevel,
} from '@prisma/client';

/**
 * The same cap the inference agent is held to (`P0-A01`). A Request that claims
 * to need more than fifteen distinct skills at stated levels is describing a
 * project, not a task, and the resulting block would be unexplainable.
 */
export const MAX_SKILL_REQUIREMENTS = 15;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class ContributionRequestSkillRequirementInputDto {
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  skillName!: string;

  @IsEnum(SkillProfileProficiencyLevel)
  requiredLevel!: SkillProfileProficiencyLevel;

  @IsEnum(ContributionRequestRequirementKind)
  kind!: ContributionRequestRequirementKind;
}

/**
 * Replaces the whole set. A partial patch would make "delete the last required
 * skill" unexpressible, and the owner is editing a short list they can see in
 * full — so the honest contract is send-what-you-want-to-exist.
 *
 * There is deliberately no `source` or `confidence` field: an owner writing
 * through this endpoint is by definition an override, and a human stating a bar
 * is not expressing a confidence level.
 */
export class ReplaceContributionRequestSkillRequirementsDto {
  @IsArray()
  @ArrayMaxSize(MAX_SKILL_REQUIREMENTS)
  @ValidateNested({ each: true })
  @Type(() => ContributionRequestSkillRequirementInputDto)
  skillRequirements!: ContributionRequestSkillRequirementInputDto[];
}

/**
 * The owner's view. Carries `source` and `confidence` because the owner needs
 * to know which rows a model proposed and how sure it was before deciding
 * whether to correct them.
 */
export interface ContributionRequestSkillRequirementDto {
  id: string;
  skillName: string;
  requiredLevel: SkillProfileProficiencyLevel;
  kind: ContributionRequestRequirementKind;
  source: ContributionRequestSkillRequirementSource;
  confidence: ContributionRequestSkillRequirementConfidence | null;
  position: number;
}

/**
 * The contributor's view. `source` and `confidence` are absent by construction
 * rather than by filtering: an applicant judging whether they qualify is not
 * helped by knowing a model was unsure, and exposing it invites arguing with
 * the model instead of adding evidence.
 */
export interface PublicContributionRequestSkillRequirementDto {
  skillName: string;
  requiredLevel: SkillProfileProficiencyLevel;
  kind: ContributionRequestRequirementKind;
}
