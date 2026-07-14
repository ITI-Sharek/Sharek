import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  GeneratedSkillCandidate,
  SkillProfileGenerator,
  SkillProfileInput,
  SkillProfileResult,
} from '../../application/ports/skill-profile-generator.port';
import { ApplicationError } from '../../../../shared/errors/application.error';

@Injectable()
export class FastApiSkillProfileGeneratorClient extends SkillProfileGenerator {
  constructor(private readonly config: ConfigService) {
    super();
  }

  async generate(input: SkillProfileInput): Promise<SkillProfileResult> {
    const baseUrl = this.config.get<string>(
      'AI_SERVICE_URL',
      'http://localhost:8010',
    );
    const timeoutMs = this.config.get<number>('AI_SERVICE_TIMEOUT_MS', 60000);
    const authToken = this.config.get<string>('AI_SERVICE_AUTH_TOKEN', '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}/skill-profiles/generate`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(authToken
            ? {
                authorization: `Bearer ${authToken}`,
              }
            : {}),
        },
        body: JSON.stringify(input),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ApplicationError(
          `AI skill profile service returned ${response.status}`,
          'AI_SKILL_PROFILE_SERVICE_ERROR',
          502,
        );
      }

      return this.validateResult(await response.json(), input);
    } catch (error) {
      if (error instanceof ApplicationError) {
        throw error;
      }

      throw new ApplicationError(
        'AI skill profile service is unavailable',
        'AI_SKILL_PROFILE_SERVICE_UNAVAILABLE',
        502,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private validateResult(
    payload: unknown,
    input: SkillProfileInput,
  ): SkillProfileResult {
    if (!this.isRecord(payload)) {
      throw new ApplicationError(
        'AI skill profile response must be an object',
        'AI_SKILL_PROFILE_RESPONSE_INVALID',
        502,
      );
    }

    const skills = payload.skills;
    if (!Array.isArray(skills)) {
      throw new ApplicationError(
        'AI skill profile response is missing skills',
        'AI_SKILL_PROFILE_RESPONSE_INVALID',
        502,
      );
    }

    const allowedEvidenceIds = new Set(
      input.selectedRepositories.map((repository) => repository.evidenceId),
    );
    const allowedRepositoryNames = new Set(
      input.selectedRepositories.map((repository) => repository.fullName),
    );
    const provider = this.readRequiredString(payload, 'provider', 50);
    const model = this.readRequiredString(payload, 'model', 100);
    const promptVersion = this.readRequiredString(payload, 'promptVersion', 100);
    const schemaVersion = this.readRequiredString(payload, 'schemaVersion', 100);
    const serviceVersion = this.readRequiredString(payload, 'serviceVersion', 100);

    return {
      skills: skills.map((skill) =>
        this.validateSkill(skill, allowedEvidenceIds),
      ),
      fraudSignals: Array.isArray(payload.fraudSignals)
        ? payload.fraudSignals
            .filter((signal): signal is Record<string, unknown> =>
              this.isRecord(signal),
            )
            .map((signal) => ({
              code: this.readRequiredString(signal, 'code'),
              severity: this.readSeverity(signal.severity),
              message: this.readRequiredString(signal, 'message'),
              repositoryFullName: this.readOptionalRepositoryName(
                signal.repositoryFullName,
                allowedRepositoryNames,
              ),
            }))
        : [],
      evidenceQuality: this.readEvidenceQuality(payload.evidenceQuality),
      recommendation: this.readRecommendation(payload.recommendation),
      provider,
      model,
      promptVersion,
      schemaVersion,
      serviceVersion,
    };
  }

  private validateSkill(
    payload: unknown,
    allowedEvidenceIds: Set<string>,
  ): GeneratedSkillCandidate {
    if (!this.isRecord(payload)) {
      throw new ApplicationError(
        'AI skill profile skill must be an object',
        'AI_SKILL_PROFILE_RESPONSE_INVALID',
        502,
      );
    }

    const evidenceIds = payload.evidenceIds;
    if (
      !Array.isArray(evidenceIds) ||
      evidenceIds.length === 0 ||
      evidenceIds.some(
        (evidenceId) =>
          typeof evidenceId !== 'string' ||
          !allowedEvidenceIds.has(evidenceId),
      )
    ) {
      throw new ApplicationError(
        'AI skill profile skill must cite evidence',
        'AI_SKILL_PROFILE_RESPONSE_INVALID',
        502,
      );
    }

    const confidence = payload.confidence;
    if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
      throw new ApplicationError(
        'AI skill profile skill confidence is invalid',
        'AI_SKILL_PROFILE_RESPONSE_INVALID',
        502,
      );
    }

    return {
      name: this.readRequiredString(payload, 'name', 100),
      proficiency: this.readProficiency(payload.proficiency),
      confidence,
      evidenceIds: Array.from(new Set(evidenceIds as string[])),
      evidenceSummary:
        typeof payload.evidenceSummary === 'string'
          ? payload.evidenceSummary
          : null,
      limitations: Array.isArray(payload.limitations)
        ? payload.limitations.filter(
            (limitation): limitation is string =>
              typeof limitation === 'string',
          )
        : null,
    };
  }

  private readRequiredString(
    payload: Record<string, unknown>,
    key: string,
    maxLength = 500,
  ): string {
    const value = payload[key];
    if (
      typeof value !== 'string' ||
      !value.trim() ||
      value.trim().length > maxLength
    ) {
      throw new ApplicationError(
        `AI skill profile response is missing ${key}`,
        'AI_SKILL_PROFILE_RESPONSE_INVALID',
        502,
      );
    }

    return value.trim();
  }

  private readProficiency(
    value: unknown,
  ): 'beginner' | 'intermediate' | 'advanced' {
    if (
      value === 'beginner' ||
      value === 'intermediate' ||
      value === 'advanced'
    ) {
      return value;
    }

    throw new ApplicationError(
      'AI skill profile proficiency is invalid',
      'AI_SKILL_PROFILE_RESPONSE_INVALID',
      502,
    );
  }

  private readSeverity(value: unknown): 'low' | 'medium' | 'high' {
    if (value === 'low' || value === 'medium' || value === 'high') {
      return value;
    }

    return 'medium';
  }

  private readEvidenceQuality(
    value: unknown,
  ): 'strong' | 'medium' | 'weak' {
    if (value === 'strong' || value === 'medium' || value === 'weak') {
      return value;
    }

    throw new ApplicationError(
      'AI skill profile evidence quality is invalid',
      'AI_SKILL_PROFILE_RESPONSE_INVALID',
      502,
    );
  }

  private readRecommendation(
    value: unknown,
  ): 'pending_review' | 'needs_more_evidence' {
    if (value === 'pending_review' || value === 'needs_more_evidence') {
      return value;
    }

    throw new ApplicationError(
      'AI skill profile recommendation is invalid',
      'AI_SKILL_PROFILE_RESPONSE_INVALID',
      502,
    );
  }

  private readOptionalRepositoryName(
    value: unknown,
    allowedRepositoryNames: Set<string>,
  ): string | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value !== 'string' || !allowedRepositoryNames.has(value)) {
      throw new ApplicationError(
        'AI skill profile fraud signal cited an unknown repository',
        'AI_SKILL_PROFILE_RESPONSE_INVALID',
        502,
      );
    }

    return value;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
