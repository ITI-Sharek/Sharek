import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { DatabaseService } from '../../../shared/database/database.service';
import {
  BadRequestApplicationError,
  ForbiddenApplicationError,
  NotFoundApplicationError,
} from '../../../shared/errors/application.error';
import { EmailVerificationSender } from '../../identity/services/email-verification-sender.service';
import { toAuthUserDto } from '../../identity/auth-user.mapper';
import {
  AdminIdentityVerificationItemDto,
  AdminIdentityVerificationPageDto,
  ListIdentityVerificationsQuery,
  ReviewIdentityVerificationRequest,
} from '../dto/review-identity-verification.request';

@Injectable()
export class AdminIdentityVerificationService {
  private readonly logger = new Logger(AdminIdentityVerificationService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly emailVerificationSender: EmailVerificationSender,
  ) {}

  async listVerifications(
    query: ListIdentityVerificationsQuery,
  ): Promise<AdminIdentityVerificationPageDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const status = query.status ?? 'pending';

    const where: Prisma.UserWhereInput =
      status === 'all'
        ? {
            OR: [
              { identity_document_updated_at: { not: null } },
              { identity_verification_status: { in: ['pending', 'verified', 'rejected'] } },
            ],
          }
        : {
            identity_verification_status: status,
          };

    const [total, users] = await Promise.all([
      this.database.user.count({ where }),
      this.database.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          username: true,
          first_name: true,
          last_name: true,
          avatar_url: true,
          role: true,
          identity_verification_status: true,
          identity_document_mime_type: true,
          identity_document_updated_at: true,
          identity_verified_at: true,
          identity_verification_rejected_reason: true,
          identity_verified_by: true,
          created_at: true,
        },
        orderBy: [
          { identity_document_updated_at: 'desc' },
          { updated_at: 'desc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const items: AdminIdentityVerificationItemDto[] = users.map((u) => ({
      id: u.id,
      email: u.email,
      username: u.username,
      firstName: u.first_name,
      lastName: u.last_name,
      avatarUrl: u.avatar_url,
      role: u.role,
      identityVerificationStatus: u.identity_verification_status,
      identityDocumentMimeType: u.identity_document_mime_type,
      identityDocumentUpdatedAt: u.identity_document_updated_at,
      identityVerifiedAt: u.identity_verified_at,
      identityVerificationRejectedReason: u.identity_verification_rejected_reason,
      identityVerifiedBy: u.identity_verified_by,
      createdAt: u.created_at,
    }));

    return {
      items,
      total,
      page,
      limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  }

  async getDocument(userId: string): Promise<{
    data: Buffer;
    mimeType: string;
    filename: string;
  }> {
    const user = await this.database.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        identity_document_data: true,
        identity_document_mime_type: true,
        first_name: true,
        last_name: true,
      },
    });

    if (!user || !user.identity_document_data) {
      throw new NotFoundApplicationError(
        'Identity document was not found for this user',
        'IDENTITY_DOCUMENT_NOT_FOUND',
      );
    }

    const mimeType = user.identity_document_mime_type || 'application/octet-stream';
    const extension = mimeType.includes('pdf')
      ? 'pdf'
      : mimeType.includes('png')
        ? 'png'
        : 'jpg';
    const filename = `id-${user.id}.${extension}`;

    return {
      data: Buffer.from(user.identity_document_data),
      mimeType,
      filename,
    };
  }

  async reviewVerification(
    admin: AuthenticatedUser,
    userId: string,
    input: ReviewIdentityVerificationRequest,
  ) {
    this.assertActiveAdmin(admin);

    const user = await this.database.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundApplicationError('User was not found', 'USER_NOT_FOUND');
    }

    if (input.decision === 'verified') {
      const updated = await this.database.user.update({
        where: { id: userId },
        data: {
          identity_verification_status: 'verified',
          identity_verified_at: new Date(),
          identity_verification_rejected_reason: null,
          identity_verified_by: admin.id,
        },
      });

      try {
        await this.emailVerificationSender.sendIdentityVerificationApproved({
          to: user.email,
          firstName: user.first_name,
          language: user.preferred_language,
        });
      } catch (error) {
        this.logger.warn(
          `Failed to send verification approval email to user ${user.id}: ${error}`,
        );
      }

      return {
        message: 'Identity verification approved successfully',
        user: toAuthUserDto(updated),
      };
    } else if (input.decision === 'rejected') {
      const reason = input.reason?.trim() || null;
      const updated = await this.database.user.update({
        where: { id: userId },
        data: {
          identity_verification_status: 'rejected',
          identity_verified_at: null,
          identity_verification_rejected_reason: reason,
          identity_verified_by: admin.id,
        },
      });

      try {
        await this.emailVerificationSender.sendIdentityVerificationRejected({
          to: user.email,
          firstName: user.first_name,
          reason: reason || undefined,
          language: user.preferred_language,
        });
      } catch (error) {
        this.logger.warn(
          `Failed to send verification rejection email to user ${user.id}: ${error}`,
        );
      }

      return {
        message: 'Identity verification rejected',
        user: toAuthUserDto(updated),
      };
    }

    throw new BadRequestApplicationError(
      'Invalid review decision',
      'INVALID_DECISION',
    );
  }

  private assertActiveAdmin(admin: AuthenticatedUser): void {
    if (admin.role !== 'admin' || admin.status !== 'active') {
      throw new ForbiddenApplicationError(
        'Active admin access is required',
        'ADMIN_ACCESS_REQUIRED',
      );
    }
  }
}
