import { IsEmail, IsIn, IsOptional, IsString, Length, MinLength } from 'class-validator';

export class RegisterRequest {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @Length(1, 100)
  firstName: string;

  @IsString()
  @Length(1, 100)
  lastName: string;

  @IsIn(['owner', 'contributor'])
  role: 'owner' | 'contributor';

  @IsOptional()
  @IsIn(['ar', 'en'])
  preferredLanguage?: 'ar' | 'en';
}
