import { IsIn, IsString, IsUUID, Length } from 'class-validator';

/** Mirrors MaterialVisibility; the wire form is uppercase like every other DTO. */
export const MATERIAL_VISIBILITY_INPUTS = [
  'PUBLIC',
  'RESTRICTED_PROJECT',
  'ASSIGNMENT',
] as const;

export class CreateMaterialDto {
  @IsString()
  @Length(3, 255)
  title!: string;

  @IsIn(MATERIAL_VISIBILITY_INPUTS)
  visibility!: (typeof MATERIAL_VISIBILITY_INPUTS)[number];

  @IsUUID('4')
  idempotencyKey!: string;
}

export class AddMaterialVersionDto {
  @IsUUID('4')
  idempotencyKey!: string;
}
