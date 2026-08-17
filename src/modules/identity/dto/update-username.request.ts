import { IsString } from 'class-validator';

export class UpdateUsernameRequest {
  @IsString()
  username!: string;
}
