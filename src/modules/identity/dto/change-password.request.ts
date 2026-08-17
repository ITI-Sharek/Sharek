import { IsString, MinLength } from 'class-validator';

export class ChangePasswordRequest {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
