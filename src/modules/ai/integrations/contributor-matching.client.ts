import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ApplicationError } from '../../../shared/errors/application.error';
import {
  ContributorMatchingCandidateSnapshot,
  ContributorMatchingInput,
  ContributorMatchingMatchedSkill,
  ContributorMatchingMetadata,
  ContributorMatchingProviderMatch,
  ContributorMatchingResult,
} from '../dto/contributor-matching.dto';

@Injectable()
export class ContributorMatchingClient {
  constructor(private readonly config: ConfigService) {}

  async generate(input: ContributorMatchingInput): Promise<ContributorMatchingResult> {
    const baseUrl = this.config.get<string>('AI_SERVICE_URL', 'http://localhost:8010');
    const path = this.config.get<string>(
      'AI_CONTRIBUTOR_MATCHING_PATH',
      '/contributor-matching/generate',
    );
    const timeoutMs = this.config.get<number>(
      'AI_CONTRIBUTOR_MATCHING_TIMEOUT_MS',
      75_000,
    );
    const authToken = this.config.get<string>('AI_SERVICE_AUTH_TOKEN', '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new ApplicationError(
          'Contributor matching service returned an error',
          'AI_CONTRIBUTOR_MATCHING_SERVICE_ERROR',
          502,
        );
      }
      return this.validateResult(await response.json(), input);
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError(
        'Contributor matching service is unavailable',
        'AI_CONTRIBUTOR_MATCHING_SERVICE_UNAVAILABLE',
        502,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private validateResult(
    payload: unknown,
    input: ContributorMatchingInput,
  ): ContributorMatchingResult {
    if (!this.isRecord(payload)) this.invalidResponse();
    if (payload.status === 'NOT_STARTED_NO_CANDIDATES') {
      return { kind: 'no_candidates' };
    }
    if (payload.status === 'NOT_STARTED_SYSTEM_LIMIT') {
      return { kind: 'system_limit' };
    }
    if (payload.status !== 'COMPLETED') this.invalidResponse();
    if (!Array.isArray(payload.matches) || payload.matches.length > 500) {
      this.invalidResponse();
    }

    const allowedEvidenceIds = new Set(input.allowedEvidenceIds);
    const candidates = new Map(
      input.candidates.map((candidate) => [candidate.contributorId, candidate]),
    );
    const seen = new Set<string>();
    const matches = payload.matches.map((value) => {
      const match = this.validateMatch(value, allowedEvidenceIds, candidates);
      if (seen.has(match.contributorId)) this.invalidResponse();
      seen.add(match.contributorId);
      return match;
    });
    if (!this.isRecord(payload.metadata)) this.invalidResponse();
    return {
      kind: 'completed',
      matches,
      metadata: this.validateMetadata(payload.metadata),
    };
  }

  private validateMatch(
    value: unknown,
    allowedEvidenceIds: Set<string>,
    candidates: Map<string, ContributorMatchingCandidateSnapshot>,
  ): ContributorMatchingProviderMatch {
    if (!this.isRecord(value)) this.invalidResponse();
    const contributorId = this.requiredString(value, 'contributorId', 200);
    const candidate = candidates.get(contributorId);
    if (!candidate) this.invalidResponse();
    const matchScore = value.matchScore;
    if (typeof matchScore !== 'number' || !Number.isFinite(matchScore) || matchScore < 0 || matchScore > 1) {
      this.invalidResponse();
    }
    if (value.confidence !== 'HIGH' && value.confidence !== 'MEDIUM' && value.confidence !== 'LOW') {
      this.invalidResponse();
    }
    const evidenceIds = this.evidenceIds(value.evidenceIds, allowedEvidenceIds);
    const skills = new Map(
      candidate.approvedSkills.map((skill) => [skill.name.toLocaleLowerCase('en-US'), skill]),
    );
    if (!Array.isArray(value.matchedSkills) || value.matchedSkills.length === 0) {
      this.invalidResponse();
    }
    const matchedSkills = value.matchedSkills.map((skill) =>
      this.validateMatchedSkill(skill, allowedEvidenceIds, skills),
    );
    return {
      contributorId,
      matchScore,
      confidence: value.confidence,
      justification: this.requiredString(value, 'justification', 2000),
      matchedSkills,
      evidenceIds,
    };
  }

  private validateMatchedSkill(
    value: unknown,
    allowedEvidenceIds: Set<string>,
    skills: Map<string, ContributorMatchingCandidateSnapshot['approvedSkills'][number]>,
  ): ContributorMatchingMatchedSkill {
    if (!this.isRecord(value)) this.invalidResponse();
    const name = this.requiredString(value, 'name', 200);
    const skill = skills.get(name.toLocaleLowerCase('en-US'));
    const proficiency = value.proficiency;
    if (
      !skill ||
      (proficiency !== 'beginner' &&
        proficiency !== 'intermediate' &&
        proficiency !== 'advanced') ||
      proficiency !== skill.proficiency
    ) this.invalidResponse();
    return {
      name,
      proficiency,
      evidenceIds: this.evidenceIds(value.evidenceIds, allowedEvidenceIds),
    };
  }

  private validateMetadata(value: Record<string, unknown>): ContributorMatchingMetadata {
    return {
      provider: this.requiredString(value, 'provider', 100),
      model: this.requiredString(value, 'model', 100),
      promptVersion: this.requiredString(value, 'promptVersion', 100),
      schemaVersion: this.requiredString(value, 'schemaVersion', 100),
      serviceVersion: this.requiredString(value, 'serviceVersion', 100),
      latencyMs: this.optionalInteger(value, 'latencyMs'),
      inputTokens: this.optionalInteger(value, 'inputTokens'),
      outputTokens: this.optionalInteger(value, 'outputTokens'),
    };
  }

  private evidenceIds(value: unknown, allowed: Set<string>): string[] {
    if (!Array.isArray(value) || value.length === 0) this.invalidResponse();
    const ids = value.map((item) => {
      if (typeof item !== 'string' || !item.trim() || item.length > 200) {
        this.invalidResponse();
      }
      return item;
    });
    if (new Set(ids).size !== ids.length || ids.some((id) => !allowed.has(id))) {
      this.invalidResponse();
    }
    return ids;
  }

  private requiredString(value: Record<string, unknown>, key: string, max: number): string {
    const item = value[key];
    if (typeof item !== 'string' || !item.trim() || item.length > max) this.invalidResponse();
    return item;
  }

  private optionalInteger(value: Record<string, unknown>, key: string): number | undefined {
    if (value[key] === undefined || value[key] === null) return undefined;
    if (!Number.isInteger(value[key]) || (value[key] as number) < 0) this.invalidResponse();
    return value[key] as number;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private invalidResponse(): never {
    throw new ApplicationError(
      'Contributor matching service returned an invalid response',
      'AI_CONTRIBUTOR_MATCHING_RESPONSE_INVALID',
      502,
    );
  }
}
