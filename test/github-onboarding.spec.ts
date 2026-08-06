import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { AppModule } from '../src/app.module';
import { EmailVerificationSender } from '../src/modules/identity/integrations/email-verification.sender';
import { DatabaseService } from '../src/shared/database/database.service';
import { HttpExceptionFilter } from '../src/shared/errors/http-exception.filter';
describe('GitHub onboarding flow', () => {
  let app: INestApplication;
  let database: InMemoryDatabase;
  let emailVerificationOtps: Map<string, string>;
  const originalFetch = global.fetch;

  beforeAll(async () => {
    // GitHub OAuth settings come from test/setup-env.ts. Assigning them here
    // had no effect: ConfigModule.forRoot() is evaluated when AppModule is
    // imported at the top of this file, which happens before beforeAll runs.
    database = new InMemoryDatabase();
    emailVerificationOtps = new Map<string, string>();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(database)
      .overrideProvider(EmailVerificationSender)
      .useValue({
        sendOtp: jest.fn(({ to, code }: { to: string; code: string }) => {
          emailVerificationOtps.set(to, code);
          return Promise.resolve();
        }),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    emailVerificationOtps.clear();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers an owner, connects GitHub, lists repositories, and imports a project', async () => {
    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'owner@example.com',
        password: 'Password123!',
        username: 'sharek-owner',
        firstName: 'Sharek',
        lastName: 'Owner',
        role: 'owner',
        preferredLanguage: 'en',
      })
      .expect(201);
    expect(registerResponse.body).toMatchObject({
      emailVerificationRequired: true,
      user: {
        email: 'owner@example.com',
        status: 'pending',
      },
    });
    const verifyResponse = await request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({
        email: 'owner@example.com',
        code: emailVerificationOtps.get('owner@example.com'),
      })
      .expect(201);
    const accessToken = verifyResponse.body.tokens.accessToken as string;

    const startResponse = await request(app.getHttpServer())
      .get('/github/oauth/start')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(startResponse.body.authorizationUrl).toContain(
      'https://github.com/login/oauth/authorize',
    );
    expect(startResponse.body.authorizationUrl).toContain('client_id=');
    expect(startResponse.body.authorizationUrl).toContain('state=');
    expect(
      new URL(startResponse.body.authorizationUrl).searchParams.get('scope'),
    ).toBe('read:user user:email');
    expect(
      new URL(startResponse.body.authorizationUrl).searchParams.get('prompt'),
    ).toBe('select_account');
    expect(startResponse.body.state).toEqual(expect.any(String));

    mockFetchJson({
      access_token: 'github-access-token',
      refresh_token: 'github-refresh-token',
      expires_in: 3600,
    });
    mockFetchJson({
      id: 42,
      login: 'sharek-dev',
      avatar_url: 'https://avatars.githubusercontent.com/u/42',
      html_url: 'https://github.com/sharek-dev',
    });

    await request(app.getHttpServer())
      .post('/github/oauth/callback')
      .send({
        code: 'github-oauth-code',
        state: startResponse.body.state,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          githubId: '42',
          username: 'sharek-dev',
          profileUrl: 'https://github.com/sharek-dev',
        });
      });

    await request(app.getHttpServer())
      .get('/github/account')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          githubId: '42',
          username: 'sharek-dev',
        });
      });

    mockFetchJson([getRepositoryPayload()]);
    mockFetchJson({
      TypeScript: 1000,
    });

    await request(app.getHttpServer())
      .get('/github/repositories?page=1&perPage=12')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          page: 1,
          perPage: 12,
          hasNextPage: false,
        });
        expect(body.items).toHaveLength(1);
        expect(body.items[0]).toMatchObject({
          fullName: 'ITI-Sharek/sharek-api',
          primaryLanguage: 'TypeScript',
          languages: {
            TypeScript: 1000,
          },
        });
      });

    mockFetchJson(getRepositoryPayload());
    mockFetchJson({
      TypeScript: 1000,
    });
    mockFetchText('# Share-k API');
    mockFetchJson([getContributorStatsPayload()]);
    mockFetchJson([
      {
        week: 1783296000,
        total: 3,
      },
    ]);
    mockFetchJson([getCommitPayload()]);

    await request(app.getHttpServer())
      .post('/projects/import/github')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fullName: 'ITI-Sharek/sharek-api',
      })
      .expect(410)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          code: 'PROJECT_IMPORT_ROUTE_RETIRED',
          statusCode: 410,
        });
      });

    await request(app.getHttpServer())
      .get('/projects/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          projects: [],
          quota: {
            used: 0,
            monthlyLimit: 10,
          },
        });
      });
  });

  it('redirects repository OAuth browser callbacks to the frontend callback route', async () => {
    await request(app.getHttpServer())
      .get('/auth/github/callback/repository?code=github-oauth-code&state=github-oauth-state')
      .expect(302)
      .expect(
        'Location',
        'http://localhost:3001/auth/callback?provider=github&code=github-oauth-code&state=github-oauth-state',
      );
  });

  it('does not request broad repository OAuth scope for contributors', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'contributor-scope@example.com',
        password: 'Password123!',
        username: 'contributor-scope',
        firstName: 'Sharek',
        lastName: 'Contributor',
        role: 'contributor',
        preferredLanguage: 'en',
      })
      .expect(201);
    const verifyResponse = await request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({
        email: 'contributor-scope@example.com',
        code: emailVerificationOtps.get('contributor-scope@example.com'),
      })
      .expect(201);

    const startResponse = await request(app.getHttpServer())
      .get('/github/oauth/start')
      .set('Authorization', `Bearer ${verifyResponse.body.tokens.accessToken}`)
      .expect(200);

    expect(
      new URL(startResponse.body.authorizationUrl).searchParams.get('scope'),
    ).toBe('read:user user:email');
  });

  it('uses minimal GitHub scope for social signup before repository consent', async () => {
    const startResponse = await request(app.getHttpServer())
      .get('/auth/github/start?role=contributor')
      .expect(200);

    const scope = new URL(
      startResponse.body.authorizationUrl,
    ).searchParams.get('scope');

    expect(scope).toBe('read:user user:email');
    expect(scope).not.toContain('repo');
    expect(
      new URL(startResponse.body.authorizationUrl).searchParams.get('prompt'),
    ).toBe('select_account');
  });
});

type UserRecord = {
  id: string;
  email: string;
  username: string | null;
  password_hash: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  role: 'owner' | 'contributor' | 'admin';
  status: 'pending' | 'active' | 'suspended' | 'deactivated';
  preferred_language: 'ar' | 'en';
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
};

type AuthSessionRecord = {
  id: string;
  user_id: string;
  access_token_hash: string;
  refresh_token_hash: string;
  user_agent?: string;
  ip_address?: string;
  expires_at: Date;
  refresh_expires_at: Date;
  revoked_at: Date | null;
};

type EmailVerificationOtpRecord = {
  id: string;
  user_id: string;
  code_hash: string;
  expires_at: Date;
  consumed_at: Date | null;
  attempts: number;
  created_at: Date;
};

type GitHubOAuthStateRecord = {
  id: string;
  user_id: string;
  state_hash: string;
  expires_at: Date;
  consumed_at: Date | null;
};

type AuthOAuthStateRecord = {
  id: string;
  provider: 'google' | 'github';
  state_hash: string;
  requested_role: 'owner' | 'contributor';
  expires_at: Date;
  consumed_at: Date | null;
};

type GitHubAccountRecord = {
  id: string;
  user_id: string;
  github_id: string;
  username: string;
  access_token: string;
  refresh_token: string | null;
  avatar_url: string | null;
  profile_url: string | null;
  raw_profile_data: Record<string, unknown>;
  token_expires_at: Date | null;
  ingestion_status: 'pending' | 'in_progress' | 'completed' | 'failed';
  connected_at: Date;
  last_synced_at: Date | null;
};

type ProjectRecord = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  github_repo_url: string;
  github_repo_id: string | null;
  languages: unknown;
  tags: unknown;
  technologies: unknown;
  repo_statistics: unknown;
  status: 'draft' | 'published' | 'archived';
  readme_content: string | null;
  category: 'web' | 'mobile' | 'ai_ml' | 'devops' | 'tools_utilities' | null;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | null;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

class InMemoryDatabase {
  private users: UserRecord[] = [];
  private authSessions: AuthSessionRecord[] = [];
  private emailVerificationOtps: EmailVerificationOtpRecord[] = [];
  private authOAuthStates: AuthOAuthStateRecord[] = [];
  private gitHubOAuthStates: GitHubOAuthStateRecord[] = [];
  private gitHubAccounts: GitHubAccountRecord[] = [];
  private projects: ProjectRecord[] = [];

  user = {
    findUnique: jest.fn(
      ({ where }: { where: { email?: string; id?: string; username?: string } }) =>
      Promise.resolve(
        this.users.find(
          (user) =>
            user.email === where.email ||
            user.id === where.id ||
            user.username === where.username,
        ) ?? null,
      ),
    ),
    create: jest.fn(({ data }: { data: Partial<UserRecord> }) => {
      const now = new Date();
      const user: UserRecord = {
        id: `user-${this.users.length + 1}`,
        email: data.email ?? '',
        username: data.username ?? null,
        password_hash: data.password_hash ?? '',
        first_name: data.first_name ?? '',
        last_name: data.last_name ?? '',
        avatar_url: null,
        role: data.role ?? 'contributor',
        status: data.status ?? 'active',
        preferred_language: data.preferred_language ?? 'en',
        created_at: now,
        updated_at: now,
        last_login_at: null,
      };

      this.users.push(user);
      return Promise.resolve(user);
    }),
    update: jest.fn(
      ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<UserRecord>;
      }) => {
        const user = this.users.find((item) => item.id === where.id);

        if (!user) {
          throw new Error('User not found in test database');
        }

        Object.assign(user, data, { updated_at: new Date() });
        return Promise.resolve(user);
      },
    ),
  };

  authSession = {
    create: jest.fn(({ data }: { data: Partial<AuthSessionRecord> }) => {
      const session: AuthSessionRecord = {
        id: `session-${this.authSessions.length + 1}`,
        user_id: data.user_id ?? '',
        access_token_hash: data.access_token_hash ?? '',
        refresh_token_hash: data.refresh_token_hash ?? '',
        user_agent: data.user_agent,
        ip_address: data.ip_address,
        expires_at: data.expires_at ?? new Date(Date.now() + 60_000),
        refresh_expires_at:
          data.refresh_expires_at ?? new Date(Date.now() + 60_000),
        revoked_at: null,
      };

      this.authSessions.push(session);
      return Promise.resolve(session);
    }),
    findFirst: jest.fn(
      ({
        where,
      }: {
        where: {
          access_token_hash?: string;
          refresh_token_hash?: string;
        };
      }) => {
        const session = this.authSessions.find(
          (item) =>
            (!where.access_token_hash ||
              item.access_token_hash === where.access_token_hash) &&
            (!where.refresh_token_hash ||
              item.refresh_token_hash === where.refresh_token_hash) &&
            !item.revoked_at,
        );

        if (!session) {
          return Promise.resolve(null);
        }

        const user = this.users.find((item) => item.id === session.user_id);
        return Promise.resolve(user ? { ...session, user } : null);
      },
    ),
    update: jest.fn(
      ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<AuthSessionRecord>;
      }) => {
        const session = this.authSessions.find((item) => item.id === where.id);

        if (!session) {
          throw new Error('Session not found in test database');
        }

        Object.assign(session, data);
        return Promise.resolve(session);
      },
    ),
  };

  emailVerificationOtp = {
    updateMany: jest.fn(
      ({
        where,
        data,
      }: {
        where: { user_id: string; consumed_at?: null };
        data: Partial<EmailVerificationOtpRecord>;
      }) => {
        let count = 0;

        this.emailVerificationOtps.forEach((item) => {
          if (
            item.user_id === where.user_id &&
            (!('consumed_at' in where) || item.consumed_at === where.consumed_at)
          ) {
            Object.assign(item, data);
            count += 1;
          }
        });

        return Promise.resolve({ count });
      },
    ),
    create: jest.fn(({ data }: { data: Partial<EmailVerificationOtpRecord> }) => {
      const record: EmailVerificationOtpRecord = {
        id: `email-otp-${this.emailVerificationOtps.length + 1}`,
        user_id: data.user_id ?? '',
        code_hash: data.code_hash ?? '',
        expires_at: data.expires_at ?? new Date(Date.now() + 60_000),
        consumed_at: null,
        attempts: data.attempts ?? 0,
        created_at: new Date(),
      };

      this.emailVerificationOtps.push(record);
      return Promise.resolve(record);
    }),
    findFirst: jest.fn(
      ({
        where,
      }: {
        where: {
          user_id: string;
          consumed_at?: null;
          expires_at?: { gt: Date };
        };
      }) => {
        const records = this.emailVerificationOtps
          .filter(
            (item) =>
              item.user_id === where.user_id &&
              (!('consumed_at' in where) ||
                item.consumed_at === where.consumed_at) &&
              (!where.expires_at || item.expires_at > where.expires_at.gt),
          )
          .sort((left, right) => right.created_at.getTime() - left.created_at.getTime());

        return Promise.resolve(records[0] ?? null);
      },
    ),
    update: jest.fn(
      ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<EmailVerificationOtpRecord>;
      }) => {
        const record = this.emailVerificationOtps.find(
          (item) => item.id === where.id,
        );

        if (!record) {
          throw new Error('Email verification OTP not found in test database');
        }

        Object.assign(record, data);
        return Promise.resolve(record);
      },
    ),
  };

  authOAuthState = {
    create: jest.fn(({ data }: { data: Partial<AuthOAuthStateRecord> }) => {
      const state: AuthOAuthStateRecord = {
        id: `auth-oauth-state-${this.authOAuthStates.length + 1}`,
        provider: data.provider ?? 'github',
        state_hash: data.state_hash ?? '',
        requested_role: data.requested_role ?? 'contributor',
        expires_at: data.expires_at ?? new Date(Date.now() + 60_000),
        consumed_at: null,
      };

      this.authOAuthStates.push(state);
      return Promise.resolve(state);
    }),
  };

  gitHubOAuthState = {
    create: jest.fn(({ data }: { data: Partial<GitHubOAuthStateRecord> }) => {
      const state: GitHubOAuthStateRecord = {
        id: `github-state-${this.gitHubOAuthStates.length + 1}`,
        user_id: data.user_id ?? '',
        state_hash: data.state_hash ?? '',
        expires_at: data.expires_at ?? new Date(Date.now() + 60_000),
        consumed_at: null,
      };

      this.gitHubOAuthStates.push(state);
      return Promise.resolve(state);
    }),
    findFirst: jest.fn(
      ({
        where,
      }: {
        where: { state_hash: string; consumed_at?: null };
      }) => {
        const state = this.gitHubOAuthStates.find(
          (item) =>
            item.state_hash === where.state_hash &&
            (!('consumed_at' in where) || item.consumed_at === null) &&
            item.expires_at > new Date(),
        );

        return Promise.resolve(state ?? null);
      },
    ),
    update: jest.fn(
      ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<GitHubOAuthStateRecord>;
      }) => {
        const state = this.gitHubOAuthStates.find((item) => item.id === where.id);

        if (!state) {
          throw new Error('GitHub OAuth state not found in test database');
        }

        Object.assign(state, data);
        return Promise.resolve(state);
      },
    ),
  };

  gitHubAccount = {
    findUnique: jest.fn(
      ({
        where,
      }: {
        where: { user_id?: string; github_id?: string };
      }) =>
        Promise.resolve(
          this.gitHubAccounts.find(
            (account) =>
              account.user_id === where.user_id ||
              account.github_id === where.github_id,
          ) ?? null,
        ),
    ),
    upsert: jest.fn(
      ({
        where,
        create,
        update,
      }: {
        where: { user_id: string };
        create: Partial<GitHubAccountRecord>;
        update: Partial<GitHubAccountRecord>;
      }) => {
        const existingAccount = this.gitHubAccounts.find(
          (account) => account.user_id === where.user_id,
        );

        if (existingAccount) {
          Object.assign(existingAccount, update);
          return Promise.resolve(existingAccount);
        }

        const account: GitHubAccountRecord = {
          id: `github-account-${this.gitHubAccounts.length + 1}`,
          user_id: create.user_id ?? '',
          github_id: create.github_id ?? '',
          username: create.username ?? '',
          access_token: create.access_token ?? '',
          refresh_token: create.refresh_token ?? null,
          avatar_url: create.avatar_url ?? null,
          profile_url: create.profile_url ?? null,
          raw_profile_data: create.raw_profile_data ?? {},
          token_expires_at: create.token_expires_at ?? null,
          ingestion_status: 'pending',
          connected_at: create.connected_at ?? new Date(),
          last_synced_at: create.last_synced_at ?? null,
        };

        this.gitHubAccounts.push(account);
        return Promise.resolve(account);
      },
    ),
    update: jest.fn(
      ({
        where,
        data,
      }: {
        where: { user_id: string };
        data: Partial<GitHubAccountRecord>;
      }) => {
        const account = this.gitHubAccounts.find(
          (item) => item.user_id === where.user_id,
        );

        if (!account) {
          throw new Error('GitHub account not found in test database');
        }

        Object.assign(account, data);
        return Promise.resolve(account);
      },
    ),
    deleteMany: jest.fn(({ where }: { where: { user_id: string } }) => {
      const initialLength = this.gitHubAccounts.length;
      this.gitHubAccounts = this.gitHubAccounts.filter(
        (account) => account.user_id !== where.user_id,
      );

      return Promise.resolve({
        count: initialLength - this.gitHubAccounts.length,
      });
    }),
  };

  project = {
    findMany: jest.fn(({ where }: { where: { owner_id: string } }) =>
      Promise.resolve(
        this.projects
          .filter((project) => project.owner_id === where.owner_id)
          .map((project) => ({
            ...project,
            contributionRequests: [],
          })),
      ),
    ),
    findUnique: jest.fn(({ where }: { where: { github_repo_url: string } }) =>
      Promise.resolve(
        this.projects.find(
          (project) => project.github_repo_url === where.github_repo_url,
        ) ?? null,
      ),
    ),
    create: jest.fn(({ data }: { data: Partial<ProjectRecord> }) => {
      const now = new Date();
      const project: ProjectRecord = {
        id: `project-${this.projects.length + 1}`,
        owner_id: data.owner_id ?? '',
        title: data.title ?? '',
        description: data.description ?? null,
        github_repo_url: data.github_repo_url ?? '',
        github_repo_id: data.github_repo_id ?? null,
        languages: data.languages ?? {},
        tags: data.tags ?? [],
        technologies: data.technologies ?? [],
        repo_statistics: data.repo_statistics ?? {},
        status: data.status ?? 'draft',
        readme_content: data.readme_content ?? null,
        category: data.category ?? null,
        difficulty: data.difficulty ?? null,
        published_at: data.published_at ?? null,
        created_at: now,
        updated_at: now,
      };

      this.projects.push(project);
      return Promise.resolve(project);
    }),
    update: jest.fn(
      ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<ProjectRecord>;
      }) => {
        const project = this.projects.find((item) => item.id === where.id);

        if (!project) {
          throw new Error('Project not found in test database');
        }

        Object.assign(project, data, { updated_at: new Date() });
        return Promise.resolve(project);
      },
    ),
  };

  contributionRequest = {
    count: jest.fn(() => Promise.resolve(0)),
  };

  subscription = {
    findFirst: jest.fn(() => Promise.resolve(null)),
  };
}

function mockFetchJson(payload: unknown): void {
  jest.mocked(global.fetch).mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: () => Promise.resolve(payload),
  } as Response);
}

function mockFetchText(payload: string): void {
  jest.mocked(global.fetch).mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: () => Promise.resolve(payload),
  } as Response);
}

function getRepositoryPayload() {
  return {
    id: 123,
    name: 'sharek-api',
    full_name: 'ITI-Sharek/sharek-api',
    owner: {
      login: 'ITI-Sharek',
    },
    description: 'Backend',
    html_url: 'https://github.com/ITI-Sharek/sharek-api',
    private: false,
    fork: false,
    archived: false,
    default_branch: 'main',
    language: 'TypeScript',
    stargazers_count: 5,
    forks_count: 1,
    open_issues_count: 2,
    watchers_count: 5,
    topics: ['nestjs'],
    pushed_at: '2026-07-05T00:00:00Z',
    updated_at: '2026-07-05T01:00:00Z',
  };
}

function getContributorStatsPayload() {
  return {
    author: {
      login: 'sharek-dev',
      html_url: 'https://github.com/sharek-dev',
    },
    total: 3,
    weeks: [
      {
        w: 1783296000,
        a: 120,
        d: 30,
        c: 3,
      },
    ],
  };
}

function getCommitPayload() {
  return {
    sha: 'abc123',
    html_url: 'https://github.com/ITI-Sharek/sharek-api/commit/abc123',
    commit: {
      message: 'Add GitHub evidence snapshot\n\nDetailed body',
      author: {
        name: 'Sharek Dev',
        date: '2026-07-05T02:00:00Z',
      },
    },
    author: {
      login: 'sharek-dev',
    },
  };
}
