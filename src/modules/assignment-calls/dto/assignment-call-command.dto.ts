import { IsUUID } from 'class-validator';

/** Shared shape for every idempotent Assignment Call command. */
export class AssignmentCallCommandDto {
  @IsUUID('4')
  idempotencyKey!: string;
}
