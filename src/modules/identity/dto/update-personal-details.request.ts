import { IsDateString, IsIn, IsOptional, IsString, Length } from 'class-validator';

export class UpdatePersonalDetailsRequest {
  @IsString()
  @Length(1, 100)
  firstName!: string;

  @IsString()
  @Length(1, 100)
  lastName!: string;

  @IsOptional() @IsString() @Length(1, 100) country?: string;
  @IsOptional() @IsString() @Length(1, 100) region?: string;
  @IsOptional() @IsString() @Length(1, 100) city?: string;
  @IsOptional() @IsIn(['male', 'female', 'prefer_not_to_say']) gender?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
}
