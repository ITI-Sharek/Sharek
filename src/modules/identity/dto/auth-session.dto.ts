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
  phoneNumber: string | null;
  phoneVerifiedAt: Date | null;
  country: string | null;
  region: string | null;
  city: string | null;
  gender: string | null;
  dateOfBirth: Date | null;
  profileVisibility: 'public' | 'members' | 'private';
  showEmail: boolean;
  showPhone: boolean;
  showActivity: boolean;
  allowIndexing: boolean;
  identityVerificationStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
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
