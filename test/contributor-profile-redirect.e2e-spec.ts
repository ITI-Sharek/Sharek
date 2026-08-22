import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { User } from '@prisma/client';
import * as request from 'supertest';

import { BadgesService } from '../src/modules/badges/badges.service';
import { ContributorProfilesController } from '../src/modules/contributor-profiles/contributor-profiles.controller';
import { ContributorProfilesService } from '../src/modules/contributor-profiles/contributor-profiles.service';
import { GitHubAccountService } from '../src/modules/github/services/github-account.service';
import { ManualAuthController } from '../src/modules/identity/controllers/manual-auth.controller';
import { EmailVerificationSender } from '../src/modules/identity/services/email-verification-sender.service';
import { PasswordHasher } from '../src/modules/identity/security/password-hasher.service';
import { SessionTokenService } from '../src/modules/identity/security/session-token.service';
import { AuthService } from '../src/modules/identity/services/auth.service';
import { IdentityUsernameService } from '../src/modules/identity/services/identity-username.service';
import { PasswordResetService } from '../src/modules/identity/services/password-reset.service';
import { SessionService } from '../src/modules/identity/services/session.service';
import { UsernameSuggestionService } from '../src/modules/identity/services/username-suggestion.service';
import { ReputationService } from '../src/modules/reputation/reputation.service';
import { SkillProfileSummaryService } from '../src/modules/skill-profiles/services/skill-profile-summary.service';
import { AccessTokenGuard } from '../src/shared/auth/guards/access-token.guard';
import { DatabaseService } from '../src/shared/database/database.service';

describe('Contributor profile redirect HTTP flow', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const contributor = createContributor();
    const authSessions: Array<Record<string, unknown>> = [];
    let contributorProfile: Record<string, unknown> | null = null;

    const database = {
      user: {
        findUnique: jest.fn(
          ({ where }: { where: { id?: string; email?: string; username?: string } }) => {
            if (
              where.id === contributor.id ||
              where.email === contributor.email ||
              (where.username && where.username === contributor.username)
            ) {
              return Promise.resolve({ ...contributor });
            }
            return Promise.resolve(null);
          },
        ),
        update: jest.fn(
          ({ where, data }: { where: { id: string }; data: Partial<User> }) => {
            if (where.id !== contributor.id) return Promise.resolve(null);
            Object.assign(contributor, data, { updated_at: new Date() });
            return Promise.resolve({ ...contributor });
          },
        ),
      },
      authSession: {
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          const session = {
            id: 'session-1',
            ...data,
            revoked_at: null,
            user: { ...contributor },
          };
          authSessions.push(session);
          return Promise.resolve(session);
        }),
        findFirst: jest.fn(
          ({ where }: { where: { access_token_hash?: string } }) => {
            const session = authSessions.find(
              (candidate) =>
                candidate.access_token_hash === where.access_token_hash &&
                candidate.revoked_at === null,
            );
            return Promise.resolve(
              session ? { ...session, user: { ...contributor } } : null,
            );
          },
        ),
      },
      contributorProfile: {
        findUnique: jest.fn(({ where }: { where: { user_id: string } }) =>
          Promise.resolve(
            contributorProfile?.user_id === where.user_id
              ? {
                  ...contributorProfile,
                  user: { ...contributor },
                  experience_level: null,
                  fields: [],
                }
              : null,
          ),
        ),
        findFirst: jest.fn(() =>
          Promise.resolve(
            contributorProfile
              ? {
                  ...contributorProfile,
                  user: { ...contributor },
                  experience_level: null,
                  fields: [],
                }
              : null,
          ),
        ),
        create: jest.fn(({ data }: { data: { user_id: string } }) => {
          contributorProfile = {
            id: 'profile-1',
            user_id: data.user_id,
            bio: null,
            availability: null,
            experience_level_id: null,
            declared_skills: [],
            avatar_data: null,
            avatar_mime_type: null,
            created_at: new Date(),
            updated_at: new Date(),
          };
          return Promise.resolve({
            ...contributorProfile,
            user: { ...contributor },
            experience_level: null,
            fields: [],
          });
        }),
      },
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [ManualAuthController, ContributorProfilesController],
      providers: [
        Reflector,
        AccessTokenGuard,
        AuthService,
        SessionService,
        IdentityUsernameService,
        {
          provide: UsernameSuggestionService,
          useValue: {
            generateSuggestions: jest.fn().mockResolvedValue([]),
          },
        },
        SessionTokenService,
        ContributorProfilesService,
        { provide: DatabaseService, useValue: database },
        {
          provide: PasswordHasher,
          useValue: {
            verify: jest.fn().mockResolvedValue(true),
            hash: jest.fn().mockResolvedValue('hash'),
          },
        },
        { provide: PasswordResetService, useValue: {} },
        { provide: EmailVerificationSender, useValue: { sendOtp: jest.fn() } },
        {
          provide: GitHubAccountService,
          useValue: {
            getStatusForUser: jest.fn().mockResolvedValue({
              connected: false,
              username: null,
            }),
          },
        },
        {
          provide: SkillProfileSummaryService,
          useValue: { listSkillsForProfile: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: ReputationService,
          useValue: {
            getSummaryForUser: jest.fn().mockResolvedValue({
              rating: null,
              reviewsCount: 0,
              completedContributions: 0,
              totalAssignedTasks: 0,
              successRate: 0,
              topVerifiedSkills: [],
            }),
          },
        },
        {
          provide: BadgesService,
          useValue: { listForUser: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('logs in, ensures, then loads the owner profile by returned username', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'contributor@example.com',
        password: 'Password123!',
      })
      .expect(201);

    const accessToken = loginResponse.body.tokens.accessToken as string;
    expect(loginResponse.body.user).toMatchObject({
      username: 'contributor-one',
      role: 'contributor',
    });

    const ensureResponse = await request(app.getHttpServer())
      .post('/contributors/profiles/me/ensure')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(ensureResponse.body).toMatchObject({
      username: 'contributor-one',
      viewerRelationship: 'owner',
    });

    await request(app.getHttpServer())
      .get('/contributors/profiles/contributor-one')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.viewerRelationship).toBe('owner');
        expect(body.username).toBe('contributor-one');
        expect(body.reputationSummary).toEqual({
          rating: null,
          reviewsCount: 0,
          completedContributions: 0,
          totalAssignedTasks: 0,
          successRate: 0,
          topVerifiedSkills: [],
        });
      });
  });
});

function createContributor(): User {
  return {
    id: 'user-1',
    email: 'contributor@example.com',
    username: null,
    password_hash: 'hash',
    first_name: 'Contributor',
    last_name: 'One',
    avatar_url: null,
    role: 'contributor',
    status: 'active',
    preferred_language: 'en',
    created_at: new Date(),
    updated_at: new Date(),
    last_login_at: null,
  } as User;
}
