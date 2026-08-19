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
    phoneNumber: user.phone_number,
    phoneVerifiedAt: user.phone_verified_at,
    country: user.country,
    region: user.region,
    city: user.city,
    gender: user.gender,
    dateOfBirth: user.date_of_birth,
    profileVisibility: user.profile_visibility as AuthUserDto['profileVisibility'],
    showEmail: user.show_email,
    showPhone: user.show_phone,
    showActivity: user.show_activity,
    allowIndexing: user.allow_indexing,
    identityVerificationStatus:
      user.identity_verification_status as AuthUserDto['identityVerificationStatus'],
    identityVerifiedAt: user.identity_verified_at,
    identityVerificationRejectedReason: user.identity_verification_rejected_reason,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
    lastLoginAt: user.last_login_at,
  };
}
