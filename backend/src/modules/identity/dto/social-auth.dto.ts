import { AuthProvider, UserRole } from '@prisma/client';

export type SocialAuthRole = Extract<UserRole, 'owner' | 'contributor'>;

export interface SocialAuthStartDto {
  provider: AuthProvider;
  role: SocialAuthRole;
  authorizationUrl: string;
  state: string;
  expiresAt: Date;
}

export interface SocialAuthCallbackInput {
  provider: AuthProvider;
  code: string;
  state: string;
  context: {
    userAgent?: string;
    ipAddress?: string;
  };
}
