import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import {
  SubscriptionPlanType,
  SubscriptionUserRoleContext,
} from '@prisma/client';

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateSubscriptionCheckoutDto {
  @IsEnum(SubscriptionPlanType)
  planType!: SubscriptionPlanType;

  @IsEnum(SubscriptionUserRoleContext)
  roleContext!: SubscriptionUserRoleContext;

  /** Existing clients may send this in the body; the controller also accepts the standard header. */
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Length(8, 128)
  idempotencyKey?: string;
}
