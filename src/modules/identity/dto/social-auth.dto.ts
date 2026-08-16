import { AuthProvider, SocialAuthIntent as PrismaSocialAuthIntent, UserRole } from '@prisma/client';

export type SocialAuthRole = Extract<UserRole, 'owner' | 'contributor'>;
export type SocialAuthIntent = PrismaSocialAuthIntent;

export interface SocialAuthStartDto {
  provider: AuthProvider;
  intent: SocialAuthIntent;
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
