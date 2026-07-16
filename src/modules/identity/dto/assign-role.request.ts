import { UserRole } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class AssignRoleRequest {
  @IsEnum(UserRole)
  role: UserRole;
}
