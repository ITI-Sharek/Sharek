import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AdvisoryFitAssessmentInput } from '../dto/advisory-fit-assessment.dto';
import { AdvisoryFitClient } from './advisory-fit.client';

const fixtureRoot = join(
  __dirname,
  '../../../../test/fixtures/sprint4-core',
);
const input = JSON.parse(
  readFileSync(join(fixtureRoot, 'advisory-fit-request.json'), 'utf8'),
) as AdvisoryFitAssessmentInput;
const completedFixture = JSON.parse(
  readFileSync(join(fixtureRoot, 'advisory-fit-response.json'), 'utf8'),
) as unknown;

describe('AdvisoryFitClient', () => {
  const originalFetch = global.fetch;
  const config = {
    get: jest.fn((key: string, fallback: unknown) => {
      if (key === 'AI_SERVICE_URL') return 'http://ai-service';
      if (key === 'AI_ADVISORY_FIT_PATH') return '/advisory-fit/assess';
      if (key === 'AI_ADVISORY_FIT_TIMEOUT_MS') return 1000;
      if (key === 'AI_SERVICE_AUTH_TOKEN') return 'internal-test-token';
      return fallback;
    }),
  };
  const client = new AdvisoryFitClient(config as unknown as ConfigService);

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('sends fixed snapshots to the authenticated FastAPI advisory endpoint', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce(
      responseWith(completedFixture),
    );

    const result = await client.assess(input);
    expect(result.kind).toBe('completed');
    if (result.kind === 'completed') {
      // Exact shape, not arrayContaining: mapping every field of the provider
      // response is the client's entire job, so the count, the order, and the
      // requirementKind/confidence/citations/uncertainty/explanation mapping
      // all have to be pinned. A partial match would pass while silently
      // dropping the second finding.
      expect(result.findings).toEqual(
        (completedFixture as { findings: unknown[] }).findings,
      );
    }
    const [url, options] = jest.mocked(global.fetch).mock.calls[0];
    expect(url).toBe('http://ai-service/advisory-fit/assess');
    expect(options?.headers).toMatchObject({
      authorization: 'Bearer internal-test-token',
    });
    expect(JSON.parse(String(options?.body))).toEqual(input);
  });

  it('preserves retryable system-limit results without treating them as fit findings', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce(
      responseWith({ status: 'NOT_STARTED_SYSTEM_LIMIT' }),
    );

    await expect(client.assess(input)).resolves.toEqual({ kind: 'system_limit' });
  });

  it('rejects a provider finding with unsupported or unsafe shape', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce(
      responseWith({
        status: 'COMPLETED',
        findings: [
          {
            requirementId: 'requirement-1',
            requirementKind: 'required',
            finding: 'ELIGIBLE',
            confidence: 'HIGH',
            citations: ['github:evidence-1'],
            uncertainty: [],
            explanation: 'Unsafe output.',
          },
        ],
        provider: 'deterministic-fake',
        model: 'fixture-v1',
        promptVersion: 'advisory-fit-v1',
        schemaVersion: '1',
        serviceVersion: 'test',
      }),
    );

    await expect(client.assess(input)).rejects.toMatchObject({
      code: 'AI_ADVISORY_FIT_RESPONSE_INVALID',
    });
  });

  it.each(['missing', 'duplicate', 'unknown'])(
    'rejects %s Requirement IDs at the HTTP boundary',
    async (mode) => {
      const payload = structuredClone(completedFixture) as {
        findings: Array<Record<string, unknown>>;
      };
      if (mode === 'missing') payload.findings.pop();
      if (mode === 'duplicate') {
        payload.findings[1].requirementId = payload.findings[0].requirementId;
      }
      if (mode === 'unknown') payload.findings[1].requirementId = 'unknown';
      jest.mocked(global.fetch).mockResolvedValueOnce(responseWith(payload));

      await expect(client.assess(input)).rejects.toMatchObject({
        code: 'AI_ADVISORY_FIT_RESPONSE_INVALID',
      });
    },
  );
});

function responseWith(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(payload),
  } as Response;
}
