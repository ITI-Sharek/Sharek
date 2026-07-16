import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthProvider, Prisma } from '@prisma/client';

import { ApplicationError } from '../../../shared/errors/application.error';

const GOOGLE_AUTH_PROVIDER = 'google' as AuthProvider;

export interface GoogleSocialIdentity {
  provider: AuthProvider;
  providerUserId: string;
  email: string;
  emailVerified: boolean;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  profileUrl?: string;
  rawProfileData: Prisma.InputJsonObject;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
}

@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);

  constructor(private readonly config: ConfigService) {}

  getSocialAuthorizationUrl(state: string): string {
    const clientId = this.getRequiredConfig('GOOGLE_CLIENT_ID');
    const callbackUrl = this.getRequiredConfig('GOOGLE_OAUTH_CALLBACK_URL');
    
    const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authorizationUrl.searchParams.set('client_id', clientId);
    authorizationUrl.searchParams.set('redirect_uri', callbackUrl);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('scope', 'openid email profile');
    authorizationUrl.searchParams.set('state', state);

    return authorizationUrl.toString();
  }

  async exchangeCodeForSocialIdentity(code: string): Promise<GoogleSocialIdentity> {
    const clientId = this.getRequiredConfig('GOOGLE_CLIENT_ID');
    const clientSecret = this.getRequiredConfig('GOOGLE_CLIENT_SECRET');
    const callbackUrl = this.getRequiredConfig('GOOGLE_OAUTH_CALLBACK_URL');

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: callbackUrl,
      }),
    });

    const tokenPayload = (await tokenResponse.json()) as Record<string, unknown>;

    if (!tokenResponse.ok || typeof tokenPayload.access_token !== 'string') {
      this.logger.error('Google token exchange failed', tokenPayload);
      throw new ApplicationError('Google token exchange failed', 'GOOGLE_TOKEN_EXCHANGE_FAILED', 502);
    }

    const accessToken = tokenPayload.access_token;
    
    // Fetch profile
    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const profile = (await profileResponse.json()) as Record<string, unknown>;

    if (!profileResponse.ok || typeof profile.sub !== 'string' || typeof profile.email !== 'string') {
      this.logger.error('Google profile fetch failed', profile);
      throw new ApplicationError('Google profile fetch failed', 'GOOGLE_PROFILE_FETCH_FAILED', 502);
    }

    const emailVerified = profile.email_verified === true || profile.email_verified === 'true';
    if (!emailVerified) {
      throw new ApplicationError('Google email must be verified before sign in', 'GOOGLE_EMAIL_NOT_VERIFIED', 403);
    }

    const email = profile.email.trim().toLowerCase();
    const username = email.split('@')[0];

    return {
      provider: GOOGLE_AUTH_PROVIDER,
      providerUserId: profile.sub,
      email,
      emailVerified: true,
      username,
      displayName: typeof profile.name === 'string' ? profile.name : undefined,
      avatarUrl: typeof profile.picture === 'string' ? profile.picture : undefined,
      rawProfileData: profile as Prisma.InputJsonObject,
      accessToken,
      refreshToken: typeof tokenPayload.refresh_token === 'string' ? tokenPayload.refresh_token : undefined,
      tokenExpiresAt: typeof tokenPayload.expires_in === 'number' 
        ? new Date(Date.now() + tokenPayload.expires_in * 1000) 
        : undefined,
    };
  }

  private getRequiredConfig(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) {
      throw new ApplicationError(`${key} is not configured`, 'GOOGLE_OAUTH_NOT_CONFIGURED', 500);
    }
    return value;
  }
}
