import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

export type AllowedRole = 'owner' | 'contributor' | 'admin';

export const Roles = (...roles: AllowedRole[]) => SetMetadata(ROLES_KEY, roles);
