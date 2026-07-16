import { IsString } from 'class-validator';

export class RefreshSessionRequest {
  @IsString()
  refreshToken: string;
}
