import { ConfigService } from '@nestjs/config';

import { AdvisoryFitAssessmentInput } from '../dto/advisory-fit-assessment.dto';
import { AdvisoryFitClient } from './advisory-fit.client';

const input: AdvisoryFitAssessmentInput = {
  assessmentRequestId: 'assessment-1',
  requirements: [{ id: 'requirement-1', kind: 'required', text: 'NestJS' }],
  evidence: [{ evidenceId: 'github:evidence-1', summary: 'NestJS API work' }],
  allowedEvidenceIds: ['github:evidence-1'],
  requestedAt: '2026-08-02T12:00:00.000Z',
  contractVersion: 'advisory-fit-v1',
};

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
      responseWith({
        status: 'COMPLETED',
        findings: [
          {
            requirementId: 'requirement-1',
            requirementKind: 'required',
            finding: 'SUPPORTED',
            confidence: 'HIGH',
            citations: ['github:evidence-1'],
            uncertainty: [],
            explanation: 'The supplied evidence supports the Requirement.',
          },
        ],
        metadata: {
          provider: 'deterministic-fake',
          model: 'fixture-v1',
          promptVersion: 'advisory-fit-v1',
          schemaVersion: '1',
          serviceVersion: 'test',
        },
      }),
    );

    await expect(client.assess(input)).resolves.toMatchObject({
      kind: 'completed',
      findings: [{ requirementId: 'requirement-1', finding: 'SUPPORTED' }],
    });
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
});

function responseWith(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(payload),
  } as Response;
}
