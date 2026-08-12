import { IsUUID } from 'class-validator';

export class SkillGapGuidanceRequest {
  @IsUUID('4')
  contributionRequestId!: string;
}
