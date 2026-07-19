export interface AuthUserDto {
  id: string;
  email: string;
  username: string | null;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  role: 'owner' | 'contributor' | 'admin';
  status: 'pending' | 'active' | 'suspended' | 'deactivated';
  preferredLanguage: 'ar' | 'en';
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

export interface AuthTokensDto {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  refreshExpiresAt: Date;
}

export interface AuthSessionDto {
  user: AuthUserDto;
  tokens: AuthTokensDto;
}

// Refresh credentials travel only in the httpOnly cookie (ADR-005); responses
// expose the access token alone and it must stay in frontend memory.
export interface PublicAuthTokensDto {
  accessToken: string;
  expiresAt: Date;
}

export interface PublicAuthSessionDto {
  user: AuthUserDto;
  tokens: PublicAuthTokensDto;
}

export function toPublicAuthTokens(tokens: AuthTokensDto): PublicAuthTokensDto {
  return {
    accessToken: tokens.accessToken,
    expiresAt: tokens.expiresAt,
  };
}

export function toPublicAuthSession(session: AuthSessionDto): PublicAuthSessionDto {
  return {
    user: session.user,
    tokens: toPublicAuthTokens(session.tokens),
  };
}
