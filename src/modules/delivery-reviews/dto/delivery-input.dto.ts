import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const GITHUB_PULL_REQUEST_URL =
  /^https:\/\/github\.com\/[A-Za-z0-9.-]+\/[A-Za-z0-9_.-]+\/pull\/[1-9]\d*\/?$/;

export const DELIVERY_REVIEW_OUTCOMES = [
  'APPROVED',
  'CHANGES_REQUESTED',
  'REJECTED',
] as const;

export type DeliveryReviewOutcomeInput =
  (typeof DELIVERY_REVIEW_OUTCOMES)[number];

export class SubmitDeliveryDto {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @Matches(GITHUB_PULL_REQUEST_URL, {
    message: 'pullRequestUrl must be a valid GitHub pull request URL',
  })
  @MaxLength(500)
  pullRequestUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  contributorNotes?: string;
}

export class ReviewDeliveryDto {
  @IsIn(DELIVERY_REVIEW_OUTCOMES)
  outcome!: DeliveryReviewOutcomeInput;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  feedback?: string;
}
