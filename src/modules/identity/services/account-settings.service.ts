import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { DatabaseService } from '../../../shared/database/database.service';
import { ApplicationError, BadRequestApplicationError } from '../../../shared/errors/application.error';
import { AuthUserDto } from '../dto/auth-session.dto';
import { ChangePasswordRequest } from '../dto/change-password.request';
import { UpdatePersonalDetailsRequest } from '../dto/update-personal-details.request';
import { UpdatePhoneRequest } from '../dto/update-phone.request';
import { UpdatePrivacyRequest } from '../dto/update-privacy.request';
import { UpdateUsernameRequest } from '../dto/update-username.request';
import { toAuthUserDto } from '../auth-user.mapper';
import { PasswordHasher } from '../security/password-hasher.service';
import { IdentityUsernameService } from './identity-username.service';

@Injectable()
export class AccountSettingsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly passwordHasher: PasswordHasher,
    private readonly identityUsernameService: IdentityUsernameService,
  ) {}

  async changePassword(
    userId: string,
    currentSessionId: string,
    input: ChangePasswordRequest,
  ): Promise<{ message: string }> {
    const user = await this.requireUser(userId);
    if (!user.password_hash || !(await this.passwordHasher.verify(input.currentPassword, user.password_hash))) {
      throw new ApplicationError('Current password is incorrect', 'CURRENT_PASSWORD_INVALID', 400);
    }

    const passwordHash = await this.passwordHasher.hash(input.newPassword);
    await this.database.$transaction([
      this.database.user.update({ where: { id: userId }, data: { password_hash: passwordHash } }),
      this.database.authSession.updateMany({
        where: { user_id: userId, id: { not: currentSessionId }, revoked_at: null },
        data: { revoked_at: new Date() },
      }),
    ]);
    return { message: 'Password has been changed successfully' };
  }

  async updateUsername(userId: string, input: UpdateUsernameRequest): Promise<AuthUserDto> {
    const user = await this.requireUser(userId);
    const username = input.username.trim();
    if (username === user.username) return toAuthUserDto(user);
    await this.identityUsernameService.assertAvailable(username);
    try {
      return toAuthUserDto(await this.database.user.update({ where: { id: userId }, data: { username } }));
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ApplicationError('Username is already taken', 'USERNAME_TAKEN', 409);
      }
      throw error;
    }
  }

  async updatePersonalDetails(userId: string, input: UpdatePersonalDetailsRequest): Promise<AuthUserDto> {
    const updated = await this.database.user.update({
      where: { id: userId },
      data: {
        first_name: input.firstName.trim(), last_name: input.lastName.trim(),
        country: input.country?.trim() || null, region: input.region?.trim() || null,
        city: input.city?.trim() || null, gender: input.gender ?? null,
        date_of_birth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
      },
    });
    return toAuthUserDto(updated);
  }

  async updatePhone(userId: string, input: UpdatePhoneRequest): Promise<AuthUserDto> {
    const updated = await this.database.user.update({
      where: { id: userId },
      data: { phone_number: input.phoneNumber ?? null, phone_verified_at: null },
    });
    return toAuthUserDto(updated);
  }

  async updatePrivacy(userId: string, input: UpdatePrivacyRequest): Promise<AuthUserDto> {
    const updated = await this.database.user.update({
      where: { id: userId },
      data: {
        profile_visibility: input.profileVisibility, show_email: input.showEmail,
        show_phone: input.showPhone, show_activity: input.showActivity,
        allow_indexing: input.allowIndexing,
      },
    });
    return toAuthUserDto(updated);
  }

  async uploadIdentityDocument(
    userId: string,
    file: { buffer: Buffer; mimetype: string; size: number },
  ): Promise<AuthUserDto> {
    if (!['application/pdf', 'image/png', 'image/jpeg'].includes(file.mimetype)) {
      throw new BadRequestApplicationError('Identity document must be a PDF, PNG, or JPEG', 'IDENTITY_DOCUMENT_INVALID_TYPE');
    }
    const updated = await this.database.user.update({
      where: { id: userId },
      data: {
        identity_document_data: Uint8Array.from(file.buffer),
        identity_document_mime_type: file.mimetype,
        identity_document_updated_at: new Date(),
        identity_verification_status: 'pending',
        identity_verification_rejected_reason: null,
        identity_verified_at: null,
        identity_verified_by: null,
      },
    });
    return toAuthUserDto(updated);
  }

  async exportAccountData(userId: string) {
    const user = await this.requireUser(userId);
    return {
      exportedAt: new Date(),
      account: toAuthUserDto(user),
      privacy: {
        profileVisibility: user.profile_visibility, showEmail: user.show_email,
        showPhone: user.show_phone, showActivity: user.show_activity, allowIndexing: user.allow_indexing,
      },
    };
  }

  private async requireUser(userId: string) {
    const user = await this.database.user.findUnique({ where: { id: userId } });
    if (!user) throw new ApplicationError('User was not found', 'USER_NOT_FOUND', 404);
    return user;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
