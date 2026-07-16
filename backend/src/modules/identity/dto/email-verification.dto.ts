import { AuthUserDto } from './auth-session.dto';

export interface EmailVerificationRequiredDto {
  user: AuthUserDto;
  emailVerificationRequired: true;
  verificationExpiresAt: Date;
}
