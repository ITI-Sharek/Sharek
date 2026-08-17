import { IsOptional, Matches } from 'class-validator';

export class UpdatePhoneRequest {
  @IsOptional()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phoneNumber?: string | null;
}
