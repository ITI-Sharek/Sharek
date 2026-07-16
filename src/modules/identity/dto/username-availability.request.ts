import { IsString } from 'class-validator';

export class UsernameAvailabilityRequest {
  @IsString()
  username: string;
}
