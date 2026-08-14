import { SkillProfileProficiencyLevel } from '@prisma/client';

import { ApplicationError } from '../../../shared/errors/application.error';
import { EligibilityGuidanceService } from './eligibility-guidance.service';

const CONTRIBUTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EVALUATION_ID = 'e1111111-1111-4111-8111-111111111111';
const GUIDANCE_ID = 'dd111111-1111-4111-8111-111111111111';
const { advanced, beginner } = SkillProfileProficiencyLevel;

const contributor = {
  id: CONTRIBUTOR_ID,
  email: 'contributor@example.com',
  role: 'contributor' as const,
  status: 'active' as const,
};

const blockingSkills = [
  { skillName: 'react', requiredLevel: advanced, contributorLevel: beginner },
];

describe('EligibilityGuidanceService', () => {
  const database = {
    eligibilityEvaluation: { findFirst: jest.fn() },
    eligibilityGuidance: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const queue = { enqueueGeneration: jest.fn() };
  const service = new EligibilityGuidanceService(
    database as never,
    queue as never,
  );

  const guidanceRow = (overrides: Record<string, unknown> = {}) => ({
    id: GUIDANCE_ID,
    eligibility_evaluation_id: EVALUATION_ID,
    contributor_id: CONTRIBUTOR_ID,
    status: 'pending',
    blocking_skills: blockingSkills,
    narrative: null,
    recommendations: null,
    created_at: new Date('2026-08-14T12:00:00.000Z'),
    updated_at: new Date('2026-08-14T12:00:00.000Z'),
    ...overrides,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    database.eligibilityEvaluation.findFirst.mockResolvedValue({
      id: EVALUATION_ID,
      outcome: 'blocked',
      blocking_skills: blockingSkills,
    });
    database.eligibilityGuidance.findFirst.mockResolvedValue(null);
    database.eligibilityGuidance.create.mockResolvedValue(guidanceRow());
  });

  const expectError = async (
    promise: Promise<unknown>,
    code: string,
    statusCode: number,
  ): Promise<void> => {
    const error = await promise.then(
      () => null,
      (thrown: unknown) => thrown as ApplicationError,
    );
    expect(error).toBeInstanceOf(ApplicationError);
    expect(error!.code).toBe(code);
    expect(error!.statusCode).toBe(statusCode);
  };

  describe('requesting guidance for a block', () => {
    it('returns the deterministic reason without waiting for the provider', async () => {
      // The contributor already knows why they were refused. Making them wait
      // on a model to be told again would be the opposite of helpful.
      const result = await service.request(contributor, EVALUATION_ID);

      expect(result.status).toBe('pending');
      expect(result.blockingSkills).toEqual(blockingSkills);
      expect(result.narrative).toBeNull();
    });

    it('copies the blocking skills onto the row rather than joining later', async () => {
      await service.request(contributor, EVALUATION_ID);

      const { data } = database.eligibilityGuidance.create.mock.calls[0][0];
      expect(data.blocking_skills).toEqual(blockingSkills);
    });

    it('enqueues generation only after the row exists', async () => {
      // A queue outage then leaves a pending row the contributor can see and
      // retry, rather than losing the request entirely.
      const order: string[] = [];
      database.eligibilityGuidance.create.mockImplementation(() => {
        order.push('create');
        return Promise.resolve(guidanceRow());
      });
      queue.enqueueGeneration.mockImplementation(() => {
        order.push('enqueue');
        return Promise.resolve();
      });

      await service.request(contributor, EVALUATION_ID);

      expect(order).toEqual(['create', 'enqueue']);
    });

    it('reuses a pending request instead of queuing the provider twice', async () => {
      database.eligibilityGuidance.findFirst.mockResolvedValue(guidanceRow());

      const result = await service.request(contributor, EVALUATION_ID);

      expect(result.id).toBe(GUIDANCE_ID);
      expect(database.eligibilityGuidance.create).not.toHaveBeenCalled();
      expect(queue.enqueueGeneration).not.toHaveBeenCalled();
    });

    it('allows a fresh attempt after a failure', async () => {
      // Only `pending` and `ready` are reused. Retrying after a provider
      // failure is exactly what a contributor should be able to do.
      await service.request(contributor, EVALUATION_ID);

      const { where } = database.eligibilityGuidance.findFirst.mock.calls[0][0];
      expect(where.status.in).toEqual(['pending', 'ready']);
    });

    it('refuses guidance for an evaluation that was not a block', async () => {
      // Guidance for a gap that does not exist would be a model inventing
      // shortcomings for someone who was let through.
      database.eligibilityEvaluation.findFirst.mockResolvedValue({
        id: EVALUATION_ID,
        outcome: 'eligible',
        blocking_skills: [],
      });

      await expectError(
        service.request(contributor, EVALUATION_ID),
        'ELIGIBILITY_GUIDANCE_NOT_BLOCKED',
        400,
      );
    });
  });

  describe('authorization — three caller shapes, one error', () => {
    it("gives another contributor's evaluation the same not-found as an unknown id", async () => {
      // Scoped by contributor in the query itself, so the two are
      // indistinguishable and the endpoint is not an existence oracle.
      database.eligibilityEvaluation.findFirst.mockResolvedValue(null);

      await expectError(
        service.request(contributor, EVALUATION_ID),
        'ELIGIBILITY_GUIDANCE_NOT_FOUND',
        404,
      );
      const { where } =
        database.eligibilityEvaluation.findFirst.mock.calls[0][0];
      expect(where.contributor_id).toBe(CONTRIBUTOR_ID);
    });

    it("gives another contributor's guidance the same not-found on read", async () => {
      database.eligibilityGuidance.findFirst.mockResolvedValue(null);

      await expectError(
        service.getForActor(contributor, GUIDANCE_ID),
        'ELIGIBILITY_GUIDANCE_NOT_FOUND',
        404,
      );
      const { where } = database.eligibilityGuidance.findFirst.mock.calls[0][0];
      expect(where.contributor_id).toBe(CONTRIBUTOR_ID);
    });

    it('refuses an owner', async () => {
      await expectError(
        service.getForActor({ ...contributor, role: 'owner' }, GUIDANCE_ID),
        'SKILL_GAP_GUIDANCE_FORBIDDEN',
        403,
      );
    });

    it('refuses a suspended contributor', async () => {
      await expectError(
        service.request({ ...contributor, status: 'suspended' }, EVALUATION_ID),
        'SKILL_GAP_GUIDANCE_FORBIDDEN',
        403,
      );
    });

    it('never checks a plan, because guidance is not tier-gated', async () => {
      // DEC-076. A block is the moment a paywall would be least defensible:
      // the platform has just refused them.
      await service.request(contributor, EVALUATION_ID);

      const calls = JSON.stringify(
        database.eligibilityGuidance.create.mock.calls,
      );
      expect(calls).not.toContain('plan');
      expect(calls).not.toContain('subscription');
    });
  });

  describe('failure keeps the reason', () => {
    it('records failure without touching the blocking skills', async () => {
      await service.recordFailure(GUIDANCE_ID);

      const { data, where } =
        database.eligibilityGuidance.updateMany.mock.calls[0][0];
      expect(data).toEqual({ status: 'failed' });
      expect(data).not.toHaveProperty('blocking_skills');
      // Only a still-pending row moves, so a late failure cannot overwrite a
      // result that already arrived.
      expect(where.status).toBe('pending');
    });

    it('still returns the blocking skills on a failed row', async () => {
      database.eligibilityGuidance.findFirst.mockResolvedValue(
        guidanceRow({ status: 'failed' }),
      );

      const result = await service.getForActor(contributor, GUIDANCE_ID);

      expect(result.status).toBe('failed');
      expect(result.blockingSkills).toEqual(blockingSkills);
    });
  });

  describe('history pagination', () => {
    const rows = (count: number) =>
      Array.from({ length: count }, (_unused, index) =>
        guidanceRow({
          id: `dd${index}11111-1111-4111-8111-111111111111`,
          created_at: new Date(Date.UTC(2026, 7, 14, 12, count - index)),
        }),
      );

    it('asks for one more row than requested to know if there is a next page', async () => {
      database.eligibilityGuidance.findMany.mockResolvedValue(rows(3));

      await service.listForActor(contributor, { limit: 2 });

      const { take, orderBy } =
        database.eligibilityGuidance.findMany.mock.calls[0][0];
      expect(take).toBe(3);
      expect(orderBy).toEqual([{ created_at: 'desc' }, { id: 'desc' }]);
    });

    it('returns a next cursor only when a further page exists', async () => {
      database.eligibilityGuidance.findMany.mockResolvedValue(rows(3));
      const page = await service.listForActor(contributor, { limit: 2 });
      expect(page.items).toHaveLength(2);
      expect(page.pageInfo.hasNextPage).toBe(true);
      expect(page.pageInfo.nextCursor).toEqual(expect.any(String));

      database.eligibilityGuidance.findMany.mockResolvedValue(rows(2));
      const last = await service.listForActor(contributor, { limit: 2 });
      expect(last.pageInfo.hasNextPage).toBe(false);
      expect(last.pageInfo.nextCursor).toBeNull();
    });

    it('round-trips its own cursor into a keyset predicate', async () => {
      database.eligibilityGuidance.findMany.mockResolvedValue(rows(3));
      const first = await service.listForActor(contributor, { limit: 2 });

      database.eligibilityGuidance.findMany.mockResolvedValue([]);
      await service.listForActor(contributor, {
        limit: 2,
        cursor: first.pageInfo.nextCursor!,
      });

      const { where } = database.eligibilityGuidance.findMany.mock.calls[1][0];
      // Keyset, not offset: a page is an index range that does not get slower
      // the further back it reads, and a row inserted meanwhile cannot shift it.
      expect(where.OR).toEqual([
        { created_at: { lt: expect.any(Date) } },
        { created_at: expect.any(Date), id: { lt: expect.any(String) } },
      ]);
    });

    it.each([
      ['not base64', '!!!!'],
      ['missing the separator', Buffer.from('nope').toString('base64url')],
      [
        'a bad timestamp',
        Buffer.from(
          'not-a-date|dd111111-1111-4111-8111-111111111111',
        ).toString('base64url'),
      ],
      [
        'a bad id',
        Buffer.from('2026-08-14T12:00:00.000Z|nope').toString('base64url'),
      ],
    ])('rejects a cursor that is %s', async (_case, cursor) => {
      // A 400, never a silent first page — that would make a paginating client
      // loop forever without ever being told anything was wrong.
      await expectError(
        service.listForActor(contributor, { cursor }),
        'ELIGIBILITY_GUIDANCE_CURSOR_INVALID',
        400,
      );
    });

    it('scopes the history to the caller', async () => {
      database.eligibilityGuidance.findMany.mockResolvedValue([]);

      await service.listForActor(contributor, {});

      const { where } = database.eligibilityGuidance.findMany.mock.calls[0][0];
      expect(where.contributor_id).toBe(CONTRIBUTOR_ID);
    });
  });

  describe('recording a result', () => {
    it('only moves a row that is still pending', async () => {
      await service.recordResult({
        guidanceId: GUIDANCE_ID,
        narrative: 'Add two React repositories and request re-analysis.',
        recommendations: { missingSkills: [] },
        modelUsed: 'openai/gpt-oss-120b',
      });

      const { where, data } =
        database.eligibilityGuidance.updateMany.mock.calls[0][0];
      expect(where).toEqual({ id: GUIDANCE_ID, status: 'pending' });
      expect(data.status).toBe('ready');
      expect(data.narrative).toContain('React');
    });

    it('truncates an over-long model name rather than failing the write', async () => {
      await service.recordResult({
        guidanceId: GUIDANCE_ID,
        narrative: null,
        recommendations: null,
        modelUsed: 'x'.repeat(120),
      });

      const { data } = database.eligibilityGuidance.updateMany.mock.calls[0][0];
      expect(data.model_used).toHaveLength(50);
    });
  });
});
