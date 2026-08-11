import { ConfigService } from '@nestjs/config';

import { ContributorMatchingInput } from '../dto/contributor-matching.dto';
import { ContributorMatchingClient } from './contributor-matching.client';

describe('ContributorMatchingClient', () => {
  const originalFetch = global.fetch;
  const input: ContributorMatchingInput = {
    matchingRequestId: 'matching:request-1',
    contributionRequestId: 'request-1',
    title: 'Add JWT Authentication',
    description: 'Implement secure JWT authentication for the API.',
    requirements: [
      { id: 'requirement-1', kind: 'required', position: 0, text: 'Node.js and JWT' },
    ],
    candidates: [
      {
        contributorId: 'contributor-1',
        displayName: 'Sara Ahmed',
        username: 'sara-dev',
        approvedSkills: [
          {
            skillProfileId: 'skill-1',
            name: 'Node.js',
            proficiency: 'advanced',
            confidence: 0.94,
            evidenceIds: ['github:sara/api'],
            evidenceSummary: 'Approved Node.js evidence',
          },
        ],
        reputation: {
          rating: 4.7,
          completedContributions: 13,
          successRate: 93,
          topVerifiedSkills: ['Node.js'],
        },
      },
    ],
    evidence: [
      {
        evidenceId: 'requirement:requirement-1',
        type: 'contribution_requirement',
        label: 'Required Requirement',
        summary: 'Node.js and JWT',
      },
      {
        evidenceId: 'github:sara/api',
        type: 'approved_skill',
        label: 'Sara: Node.js',
        summary: 'Approved Node.js evidence',
        contributorId: 'contributor-1',
      },
    ],
    allowedEvidenceIds: ['requirement:requirement-1', 'github:sara/api'],
    requestedAt: '2026-08-11T12:00:00.000Z',
    contractVersion: 'contributor-matching-v1',
  };
  const config = {
    get: jest.fn((key: string, fallback: unknown) => {
      if (key === 'AI_SERVICE_URL') return 'http://ai-service';
      if (key === 'AI_CONTRIBUTOR_MATCHING_PATH') return '/contributor-matching/generate';
      if (key === 'AI_CONTRIBUTOR_MATCHING_TIMEOUT_MS') return 1000;
      if (key === 'AI_SERVICE_AUTH_TOKEN') return 'internal-test-token';
      return fallback;
    }),
  };

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('sends the fixed candidate snapshot to the authenticated AI endpoint', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce(
      responseWith({
        status: 'COMPLETED',
        matches: [
          {
            contributorId: 'contributor-1',
            matchScore: 0.94,
            confidence: 'HIGH',
            justification: 'Strong approved Node.js evidence.',
            matchedSkills: [
              {
                name: 'Node.js',
                proficiency: 'advanced',
                evidenceIds: ['github:sara/api'],
              },
            ],
            evidenceIds: ['requirement:requirement-1', 'github:sara/api'],
          },
        ],
        metadata: {
          provider: 'fixture',
          model: 'fixture',
          promptVersion: 'contributor-matching-v1',
          schemaVersion: 'contributor-matching-v1',
          serviceVersion: 'test',
        },
      }),
    );

    const result = await new ContributorMatchingClient(
      config as unknown as ConfigService,
    ).generate(input);

    expect(result).toMatchObject({ kind: 'completed' });
    const [url, options] = jest.mocked(global.fetch).mock.calls[0];
    expect(url).toBe('http://ai-service/contributor-matching/generate');
    expect(options?.headers).toMatchObject({
      authorization: 'Bearer internal-test-token',
    });
    expect(JSON.parse(String(options?.body))).toEqual(input);
  });

  it('rejects an AI match that cites an unknown evidence ID', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce(
      responseWith({
        status: 'COMPLETED',
        matches: [
          {
            contributorId: 'contributor-1',
            matchScore: 0.94,
            confidence: 'HIGH',
            justification: 'Unsupported citation.',
            matchedSkills: [
              {
                name: 'Node.js',
                proficiency: 'advanced',
                evidenceIds: ['private:evidence'],
              },
            ],
            evidenceIds: ['private:evidence'],
          },
        ],
        metadata: {
          provider: 'fixture',
          model: 'fixture',
          promptVersion: 'contributor-matching-v1',
          schemaVersion: 'contributor-matching-v1',
          serviceVersion: 'test',
        },
      }),
    );

    await expect(
      new ContributorMatchingClient(config as unknown as ConfigService).generate(input),
    ).rejects.toMatchObject({ code: 'AI_CONTRIBUTOR_MATCHING_RESPONSE_INVALID' });
  });
});

function responseWith(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}
