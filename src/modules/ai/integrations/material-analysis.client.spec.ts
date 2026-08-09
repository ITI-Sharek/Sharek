import { ConfigService } from '@nestjs/config';

import { MaterialAnalysisInput } from '../dto/material-analysis.dto';
import { MaterialAnalysisClient } from './material-analysis.client';

const input: MaterialAnalysisInput = {
  analysisRunId: '00000000-0000-4000-8000-000000000001',
  analysisSetId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
  purpose: 'PROJECT_MATERIAL_DRAFTING',
  materials: [
    {
      materialId: '00000000-0000-4000-8000-000000000004',
      version: 1,
      filename: 'brief.md',
      mimeType: 'text/markdown',
      contentBase64: Buffer.from('# Project').toString('base64'),
    },
  ],
  maxExtractedCharacters: 250_000,
  contractVersion: 'material-draft-v1',
};

describe('MaterialAnalysisClient', () => {
  const originalFetch = global.fetch;
  const config = {
    get: jest.fn((key: string, fallback: unknown) => {
      if (key === 'AI_SERVICE_URL') return 'http://ai-service';
      if (key === 'AI_MATERIAL_ANALYSIS_PATH') return '/material-analysis/analyze';
      if (key === 'AI_MATERIAL_ANALYSIS_TIMEOUT_MS') return 1000;
      if (key === 'AI_SERVICE_AUTH_TOKEN') return 'internal-test-token';
      return fallback;
    }),
  };
  const client = new MaterialAnalysisClient(config as unknown as ConfigService);

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('sends exact owner-selected versions through the authenticated AI boundary', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce(
      responseWith({
        status: 'COMPLETED',
        projectSuggestions: [
          {
            targetField: 'technologies',
            value: ['TypeScript'],
            rationale: 'The brief names TypeScript.',
            sourceVersions: [{ materialId: input.materials[0].materialId, version: 1 }],
          },
        ],
        contributionRequestSuggestions: [],
        metadata: {
          provider: 'deterministic-fake',
          model: 'fixture-v1',
          promptVersion: 'material-draft-v1',
          schemaVersion: 'material-draft-v1',
          serviceVersion: 'test',
          latencyMs: 1,
          documentCount: 1,
          extractedCharacters: 9,
        },
      }),
    );

    const result = await client.analyze(input);
    expect(result.projectSuggestions[0].targetField).toBe('technologies');
    const [url, options] = jest.mocked(global.fetch).mock.calls[0];
    expect(url).toBe('http://ai-service/material-analysis/analyze');
    expect(options?.headers).toMatchObject({
      authorization: 'Bearer internal-test-token',
    });
    expect(JSON.parse(String(options?.body))).toEqual(input);
  });

  it('rejects provider provenance outside the selected versions', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce(
      responseWith({
        status: 'COMPLETED',
        projectSuggestions: [
          {
            targetField: 'title',
            value: 'Unsafe',
            rationale: 'Unsafe.',
            sourceVersions: [
              { materialId: '00000000-0000-4000-8000-000000000099', version: 1 },
            ],
          },
        ],
        contributionRequestSuggestions: [],
        metadata: {
          provider: 'fixture',
          model: 'fixture',
          promptVersion: 'material-draft-v1',
          schemaVersion: 'material-draft-v1',
          serviceVersion: 'test',
          latencyMs: 1,
          documentCount: 1,
          extractedCharacters: 9,
        },
      }),
    );

    await expect(client.analyze(input)).rejects.toMatchObject({
      code: 'AI_MATERIAL_ANALYSIS_RESPONSE_INVALID',
    });
  });

  it('rejects Contribution Request drafts without a required requirement', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce(
      responseWith({
        status: 'COMPLETED',
        projectSuggestions: [],
        contributionRequestSuggestions: [
          {
            title: 'Add API tests',
            description: 'Create focused tests for the API boundary.',
            requirements: [
              { kind: 'preferred', text: 'Know TypeScript' },
            ],
            technologyTags: ['TypeScript'],
            difficulty: 'intermediate',
            rationale: 'The brief identifies an API surface without test coverage.',
            sourceVersions: [
              { materialId: input.materials[0].materialId, version: 1 },
            ],
          },
        ],
        metadata: {
          provider: 'fixture',
          model: 'fixture',
          promptVersion: 'material-draft-v1',
          schemaVersion: 'material-draft-v1',
          serviceVersion: 'test',
          latencyMs: 1,
          documentCount: 1,
          extractedCharacters: 9,
        },
      }),
    );

    await expect(client.analyze(input)).rejects.toMatchObject({
      code: 'AI_MATERIAL_ANALYSIS_RESPONSE_INVALID',
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
