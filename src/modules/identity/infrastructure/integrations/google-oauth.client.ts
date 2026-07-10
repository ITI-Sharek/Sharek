import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthProvider, Prisma } from '@prisma/client';
import { OAuth2Client, TokenPayload } from 'google-auth-library';

import { ApplicationError } from '../../../../shared/errors/application.error';

const GOOGLE_OAUTH_SCOPES = ['openid', 'email', 'profile'];

export interface GoogleSocialIdentity {
  provider: AuthProvider;
  providerUserId: string;
  email: string;
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  avatarUrl?: string;
  rawProfileData: Prisma.InputJsonObject;
}

@Injectable()
export class GoogleOAuthClient {
  constructor(private readonly config: ConfigService) {}

  getAuthorizationUrl(state: string): string {
    return this.createClient().generateAuthUrl({
      access_type: 'offline',
      prompt: 'select_account',
      scope: GOOGLE_OAUTH_SCOPES,
      state,
    });
  }

  async exchangeCodeForIdentity(code: string): Promise<GoogleSocialIdentity> {
    const client = this.createClient();

    try {
      const { tokens } = await client.getToken(code);

      if (!tokens.id_token) {
        throw new ApplicationError(
          'Google did not return an ID token',
          'GOOGLE_ID_TOKEN_MISSING',
          502,
        );
      }

      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: this.getRequiredConfig('GOOGLE_CLIENT_ID'),
      });
      const payload = ticket.getPayload();

      if (!payload?.sub || !payload.email) {
        throw new ApplicationError(
          'Google profile response was invalid',
          'GOOGLE_PROFILE_INVALID_RESPONSE',
          502,
        );
      }

      if (!this.isEmailVerified(payload)) {
        throw new ApplicationError(
          'Google email must be verified before sign in',
          'GOOGLE_EMAIL_NOT_VERIFIED',
          403,
        );
      }

      return {
        provider: AuthProvider.google,
        providerUserId: payload.sub,
        email: payload.email.trim().toLowerCase(),
        emailVerified: true,
        firstName: this.optionalString(payload.given_name),
        lastName: this.optionalString(payload.family_name),
        displayName: this.optionalString(payload.name),
        avatarUrl: this.optionalString(payload.picture),
        rawProfileData: this.toRawProfileData(payload),
      };
    } catch (error) {
      if (error instanceof ApplicationError) {
        throw error;
      }

      throw new ApplicationError(
        'Google OAuth exchange failed',
        'GOOGLE_OAUTH_EXCHANGE_FAILED',
        502,
      );
    }
  }

  private createClient(): OAuth2Client {
    return new OAuth2Client(
      this.getRequiredConfig('GOOGLE_CLIENT_ID'),
      this.getRequiredConfig('GOOGLE_CLIENT_SECRET'),
      this.getRequiredConfig('GOOGLE_OAUTH_CALLBACK_URL'),
    );
  }

  private getRequiredConfig(key: string): string {
    const value = this.config.get<string>(key);

    if (!value) {
      throw new ApplicationError(`${key} is not configured`, 'GOOGLE_OAUTH_NOT_CONFIGURED', 500);
    }

    return value;
  }

  private isEmailVerified(payload: TokenPayload): boolean {
    return payload.email_verified === true;
  }

  private optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }

  private toRawProfileData(payload: TokenPayload): Prisma.InputJsonObject {
    return {
      sub: payload.sub ?? null,
      email: payload.email ?? null,
      email_verified: this.isEmailVerified(payload),
      name: payload.name ?? null,
      given_name: payload.given_name ?? null,
      family_name: payload.family_name ?? null,
      picture: payload.picture ?? null,
      locale: payload.locale ?? null,
    };
  }
}
