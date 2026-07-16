import { IsEmail } from 'class-validator';

export class ResendEmailVerificationRequest {
  @IsEmail()
  email: string;
}
