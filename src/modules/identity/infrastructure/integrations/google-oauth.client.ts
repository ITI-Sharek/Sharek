import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { ApplicationError } from '../../../../shared/errors/application.error';

@Injectable()
export class GoogleOAuthClient {
  private readonly oauth2Client: OAuth2Client;
  private readonly logger = new Logger(GoogleOAuthClient.name);

  constructor(private readonly config: ConfigService) {
    this.oauth2Client = new OAuth2Client(
      this.config.get<string>('GOOGLE_CLIENT_ID'),
      this.config.get<string>('GOOGLE_CLIENT_SECRET'),
      this.config.get<string>('GOOGLE_OAUTH_CALLBACK_URL'),
    );
  }

  getAuthorizationUrl(state: string): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['email', 'profile'],
      state,
    });
  }

  async exchangeCodeForIdentity(code: string) {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      if (!tokens.id_token) {
        throw new Error('No id_token in Google response');
      }

      const ticket = await this.oauth2Client.verifyIdToken({
        idToken: tokens.id_token,
        audience: this.config.get<string>('GOOGLE_CLIENT_ID'),
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        throw new Error('Invalid Google ID token payload');
      }

      return {
        providerUserId: payload.sub,
        email: payload.email,
        emailVerified: payload.email_verified || false,
        firstName: payload.given_name,
        lastName: payload.family_name,
        displayName: payload.name,
        avatarUrl: payload.picture,
        rawProfileData: payload as any,
      };
    } catch (error) {
      this.logger.error('Failed to exchange Google OAuth code', error instanceof Error ? error.stack : String(error));
      throw new ApplicationError(
        'Failed to authenticate with Google',
        'SOCIAL_AUTH_PROVIDER_ERROR',
        502,
      );
    }
  }
}
