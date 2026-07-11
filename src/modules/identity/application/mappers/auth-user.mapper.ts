import { User } from '@prisma/client';

import { AuthUserDto } from '../dto/auth-session.dto';

export function toAuthUserDto(user: User): AuthUserDto {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    firstName: user.first_name,
    lastName: user.last_name,
    avatarUrl: user.avatar_url,
    role: user.role,
    status: user.status,
    preferredLanguage: user.preferred_language,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
    lastLoginAt: user.last_login_at,
  };
}
