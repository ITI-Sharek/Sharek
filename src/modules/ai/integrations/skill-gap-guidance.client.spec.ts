import { ConfigService } from '@nestjs/config';

import { SkillGapGuidanceInput } from '../dto/skill-gap-guidance.dto';
import { SkillGapGuidanceClient } from './skill-gap-guidance.client';

const input: SkillGapGuidanceInput = {
  guidanceRequestId: 'guidance-request-1',
  requirements: [
    {
      id: 'requirement-1',
      kind: 'required',
      position: 0,
      text: 'Build a scheduled data pipeline with Apache Airflow',
    },
  ],
  approvedSkills: [
    {
      evidenceId: 'skill:python',
      name: 'Python',
      proficiency: 'advanced',
      evidenceSummary: 'Approved skill from reviewed profile',
    },
  ],
  evidence: [
    {
      evidenceId: 'requirement:requirement-1',
      type: 'contribution_requirement',
      label: 'Contribution Request requirement',
      summary: 'The request requires Airflow scheduling',
    },
    {
      evidenceId: 'skill:python',
      type: 'approved_skill',
      label: 'Python',
      summary: 'Approved skill from reviewed profile',
    },
  ],
  allowedEvidenceIds: ['requirement:requirement-1', 'skill:python'],
  requestedAt: '2026-08-11T12:00:00.000Z',
  contractVersion: 'skill-gap-guidance-v1',
};

describe('SkillGapGuidanceClient', () => {
  const originalFetch = global.fetch;
  const config = {
    get: jest.fn((key: string, fallback: unknown) => {
      if (key === 'AI_SERVICE_URL') return 'http://ai-service';
      if (key === 'AI_SKILL_GAP_GUIDANCE_PATH') return '/gap-guidance/generate';
      if (key === 'AI_SKILL_GAP_GUIDANCE_TIMEOUT_MS') return 1000;
      if (key === 'AI_SERVICE_AUTH_TOKEN') return 'internal-test-token';
      return fallback;
    }),
  };
  const client = new SkillGapGuidanceClient(config as unknown as ConfigService);

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('sends the fixed request snapshot through the authenticated AI seam', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce(
      responseWith({
        status: 'COMPLETED',
        missingSkills: [
          {
            requirementId: 'requirement-1',
            skillName: 'Apache Airflow',
            gap: 'not_evidenced',
            explanation: 'Airflow is not evidenced.',
            evidenceIds: ['requirement:requirement-1'],
            uncertainty: [],
          },
        ],
        recommendedTechnologies: [],
        learningResources: [],
        practiceProjects: [],
        improvementPath: [],
        sources: [
          {
            evidenceId: 'requirement:requirement-1',
            label: 'Contribution Request requirement',
            type: 'contribution_requirement',
          },
        ],
        metadata: {
          provider: 'deterministic-fake',
          model: 'fixture-v1',
          promptVersion: 'skill-gap-guidance-v1',
          schemaVersion: 'skill-gap-guidance-v1',
          serviceVersion: 'test',
          latencyMs: 1,
        },
      }),
    );

    const result = await client.generate(input);

    expect(result.kind).toBe('completed');
    if (result.kind === 'completed') {
      expect(result.missingSkills[0].skillName).toBe('Apache Airflow');
    }
    const [url, options] = jest.mocked(global.fetch).mock.calls[0];
    expect(url).toBe('http://ai-service/gap-guidance/generate');
    expect(options?.headers).toMatchObject({
      authorization: 'Bearer internal-test-token',
    });
    expect(JSON.parse(String(options?.body))).toEqual(input);
  });

  it('rejects provider citations outside the authorized evidence scope', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce(
      responseWith({
        status: 'COMPLETED',
        missingSkills: [
          {
            requirementId: 'requirement-1',
            skillName: 'Apache Airflow',
            gap: 'not_evidenced',
            explanation: 'Unsafe citation.',
            evidenceIds: ['private:unapproved'],
            uncertainty: [],
          },
        ],
        recommendedTechnologies: [],
        learningResources: [],
        practiceProjects: [],
        improvementPath: [],
        sources: [],
        metadata: {
          provider: 'fixture',
          model: 'fixture',
          promptVersion: 'skill-gap-guidance-v1',
          schemaVersion: 'skill-gap-guidance-v1',
          serviceVersion: 'test',
        },
      }),
    );

    await expect(client.generate(input)).rejects.toMatchObject({
      code: 'AI_SKILL_GAP_GUIDANCE_RESPONSE_INVALID',
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
