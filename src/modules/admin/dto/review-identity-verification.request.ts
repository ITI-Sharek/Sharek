import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ReviewIdentityVerificationRequest {
  @IsIn(['verified', 'rejected'])
  decision: 'verified' | 'rejected';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ListIdentityVerificationsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsIn(['all', 'pending', 'verified', 'rejected', 'unverified'])
  status?: string = 'pending';
}

export interface AdminIdentityVerificationItemDto {
  id: string;
  email: string;
  username: string | null;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  role: string;
  identityVerificationStatus: string;
  identityDocumentMimeType: string | null;
  identityDocumentUpdatedAt: Date | null;
  identityVerifiedAt: Date | null;
  identityVerificationRejectedReason: string | null;
  identityVerifiedBy: string | null;
  createdAt: Date;
}

export interface AdminIdentityVerificationPageDto {
  items: AdminIdentityVerificationItemDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
