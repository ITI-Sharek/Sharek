import { IsIn } from 'class-validator';

export class SocialAuthStartRequest {
  @IsIn(['owner', 'contributor'])
  role: 'owner' | 'contributor';
}
