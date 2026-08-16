import { IsIn } from 'class-validator';

export class SocialAuthStartRequest {
  @IsIn(['owner', 'contributor'])
  role: 'owner' | 'contributor';

  @IsIn(['login', 'register'])
  intent: 'login' | 'register';
}
