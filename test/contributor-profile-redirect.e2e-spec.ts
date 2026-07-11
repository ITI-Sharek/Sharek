import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { User } from '@prisma/client';
import * as request from 'supertest';

import { ContributorProfileRepository } from '../src/modules/contributor-profiles/application/ports/contributor-profile.repository';
import {
  GitHubProfileStatusReader,
  ReputationSummaryReader,
  SkillProfileSummaryReader,
} from '../src/modules/contributor-profiles/application/ports/profile-readers.port';
import { EnsureContributorProfileUseCase } from '../src/modules/contributor-profiles/application/use-cases/ensure-contributor-profile.use-case';
import { GetContributorProfileUseCase } from '../src/modules/contributor-profiles/application/use-cases/get-contributor-profile.use-case';
import { PrismaContributorProfileRepository } from '../src/modules/contributor-profiles/infrastructure/persistence/prisma-contributor-profile.repository';
import { ContributorProfilesController } from '../src/modules/contributor-profiles/presentation/http/controllers/contributor-profiles.controller';
import { AccessTokenGuard } from '../src/shared/auth/guards/access-token.guard';
import { DatabaseService } from '../src/shared/database/database.service';
import { IdentityUsernameService } from '../src/modules/identity/application/use-cases/identity-username.service';
import { IdentityService } from '../src/modules/identity/application/use-cases/identity.service';
import { PasswordHasher } from '../src/modules/identity/infrastructure/security/password-hasher.service';
import { SessionTokenService } from '../src/modules/identity/infrastructure/security/session-token.service';
import { IdentityController } from '../src/modules/identity/presentation/http/controllers/identity.controller';

describe('Contributor profile redirect HTTP flow', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const contributor = createContributor();
    const authSessions: Array<Record<string, unknown>> = [];
    let contributorProfile: Record<string, unknown> | null = null;

    const database = {
      user: {
        findUnique: jest.fn(({ where }: { where: { id?: string; email?: string } }) => {
          if (where.id === contributor.id || where.email === contributor.email) {
            return Promise.resolve({ ...contributor });
          }

          return Promise.resolve(null);
        }),
        update: jest.fn(
          ({
            where,
            data,
          }: {
            where: { id: string };
            data: Partial<User>;
          }) => {
            if (where.id !== contributor.id) {
              return Promise.resolve(null);
            }

            Object.assign(contributor, data, {
              updated_at: new Date(),
            });

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
            user: contributor,
          };
          authSessions.push(session);
          return Promise.resolve(session);
        }),
        findFirst: jest.fn(({ where }: { where: { access_token_hash?: string } }) => {
          const session = authSessions.find(
            (candidate) =>
              candidate.access_token_hash === where.access_token_hash &&
              candidate.revoked_at === null,
          );

          return Promise.resolve(
            session
              ? {
                  ...session,
                  user: { ...contributor },
                }
              : null,
          );
        }),
      },
      contributorProfile: {
        findUnique: jest.fn(({ where }: { where: { user_id: string } }) => {
          if (contributorProfile?.user_id !== where.user_id) {
            return Promise.resolve(null);
          }

          return Promise.resolve({
            ...contributorProfile,
            user: { ...contributor },
          });
        }),
        findFirst: jest.fn(
          ({ where }: { where: { user: { username: string } } }) => {
            if (
              contributorProfile === null ||
              contributor.username !== where.user.username
            ) {
              return Promise.resolve(null);
            }

            return Promise.resolve({
              ...contributorProfile,
              user: { ...contributor },
            });
          },
        ),
        create: jest.fn(({ data }: { data: { user_id: string } }) => {
          contributorProfile = {
            id: 'profile-1',
            user_id: data.user_id,
            bio: null,
            availability: null,
            created_at: new Date(),
            updated_at: new Date(),
          };

          return Promise.resolve({
            ...contributorProfile,
            user: { ...contributor },
          });
        }),
      },
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [IdentityController, ContributorProfilesController],
      providers: [
        AccessTokenGuard,
        IdentityService,
        IdentityUsernameService,
        SessionTokenService,
        EnsureContributorProfileUseCase,
        GetContributorProfileUseCase,
        PrismaContributorProfileRepository,
        {
          provide: DatabaseService,
          useValue: database,
        },
        {
          provide: PasswordHasher,
          useValue: {
            verify: jest.fn().mockResolvedValue(true),
            hash: jest.fn().mockResolvedValue('hash'),
          },
        },
        {
          provide: ContributorProfileRepository,
          useExisting: PrismaContributorProfileRepository,
        },
        {
          provide: GitHubProfileStatusReader,
          useValue: {
            getStatusForUser: jest.fn().mockResolvedValue({
              connected: false,
              username: null,
            }),
          },
        },
        {
          provide: SkillProfileSummaryReader,
          useValue: {
            listSkillsForProfile: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: ReputationSummaryReader,
          useValue: {
            getSummaryForUser: jest.fn().mockResolvedValue({
              rating: null,
              reviewsCount: 0,
            }),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('logs in, ensures, then loads the owner profile by returned username', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'contributor@example.com',
        password: 'Password123!',
      })
      .expect(201);

    const accessToken = loginResponse.body.tokens.accessToken;
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
