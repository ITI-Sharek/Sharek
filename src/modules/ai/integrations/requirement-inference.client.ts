import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ContributionRequestRequirementKind,
  ContributionRequestSkillRequirementConfidence,
  SkillProfileProficiencyLevel,
} from '@prisma/client';

import { ApplicationError } from '../../../shared/errors/application.error';
import { normalizeSkillName } from '../../../shared/skills/skill-name';
import {
  InferredSkillRequirement,
  RequirementInferenceInput,
  RequirementInferenceResult,
} from '../dto/requirement-inference.dto';

/** The same cap the FastAPI contract and the persistence layer enforce. */
const MAX_INFERRED_SKILLS = 15;

const LEVELS: readonly string[] = Object.values(SkillProfileProficiencyLevel);
const KINDS: readonly string[] = Object.values(ContributionRequestRequirementKind);
const CONFIDENCES: readonly string[] = Object.values(
  ContributionRequestSkillRequirementConfidence,
);

@Injectable()
export class RequirementInferenceClient {
  constructor(private readonly config: ConfigService) {}

  async infer(
    input: RequirementInferenceInput,
  ): Promise<RequirementInferenceResult> {
    const baseUrl = this.config.get<string>(
      'AI_SERVICE_URL',
      'http://localhost:8010',
    );
    const path = this.config.get<string>(
      'AI_REQUIREMENT_INFERENCE_PATH',
      '/requirements/infer',
    );
    const timeoutMs = this.config.get<number>(
      'AI_REQUIREMENT_INFERENCE_TIMEOUT_MS',
      60_000,
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
          'Requirement inference service returned an error',
          'AI_REQUIREMENT_INFERENCE_SERVICE_ERROR',
          502,
        );
      }

      return this.validateResult(await response.json());
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError(
        'Requirement inference service is unavailable',
        'AI_REQUIREMENT_INFERENCE_SERVICE_UNAVAILABLE',
        502,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Revalidate everything the agent already promised.
   *
   * The FastAPI schema enforces the same vocabulary, so this looks redundant —
   * it is not. ADR 0015 makes these rows an authorization input, and the rule
   * the whole product rests on is that NestJS validates AI output and makes the
   * decision. A schema on the far side of an HTTP call is a promise by a
   * separately deployed service; this is the check that actually runs before a
   * value is allowed to influence whether someone may apply.
   *
   * Anything out of vocabulary fails the whole run rather than being dropped. A
   * silently discarded skill is a bar the owner never sees and never approves.
   */
  private validateResult(payload: unknown): RequirementInferenceResult {
    if (!this.isRecord(payload)) this.invalidResponse();
    if (!Array.isArray(payload.skills)) this.invalidResponse();
    if (payload.skills.length > MAX_INFERRED_SKILLS) this.invalidResponse();

    const skills = payload.skills.map((skill) => this.validateSkill(skill));

    // Normalized here with the same function the unique index is built on, so
    // a set that would violate that index is refused before a transaction is
    // ever opened rather than surfacing as a P2002 inside the worker.
    const normalized = skills.map((skill) => normalizeSkillName(skill.skillName));
    if (
      normalized.some((name) => name.length === 0) ||
      normalized.length !== new Set(normalized).size
    ) {
      this.invalidResponse();
    }

    const metadata = this.isRecord(payload.metadata) ? payload.metadata : payload;
    return {
      skills,
      provider: this.requiredString(metadata, 'provider'),
      model: this.requiredString(metadata, 'model'),
      promptVersion: this.requiredString(metadata, 'promptVersion'),
      schemaVersion: this.requiredString(metadata, 'schemaVersion'),
      serviceVersion: this.requiredString(metadata, 'serviceVersion'),
      latencyMs: this.optionalInteger(metadata, 'latencyMs'),
    };
  }

  private validateSkill(value: unknown): InferredSkillRequirement {
    if (!this.isRecord(value)) this.invalidResponse();

    const requiredLevel = value.requiredLevel;
    const kind = value.kind;
    const confidence = value.confidence;

    if (typeof requiredLevel !== 'string' || !LEVELS.includes(requiredLevel)) {
      this.invalidResponse();
    }
    if (typeof kind !== 'string' || !KINDS.includes(kind)) {
      this.invalidResponse();
    }
    // Rejected rather than coerced. A percentage arriving here means the far
    // side changed its contract, and mapping 0.9 to `high` would invent a
    // categorical judgement the agent never made.
    if (typeof confidence !== 'string' || !CONFIDENCES.includes(confidence)) {
      this.invalidResponse();
    }

    return {
      skillName: this.requiredString(value, 'skillName', 100),
      requiredLevel: requiredLevel as SkillProfileProficiencyLevel,
      kind: kind as ContributionRequestRequirementKind,
      confidence: confidence as ContributionRequestSkillRequirementConfidence,
    };
  }

  private requiredString(
    record: Record<string, unknown>,
    key: string,
    maxLength = 200,
  ): string {
    const value = record[key];
    if (
      typeof value !== 'string' ||
      !value.trim() ||
      value.trim().length > maxLength
    ) {
      this.invalidResponse();
    }
    return value.trim();
  }

  private optionalInteger(
    record: Record<string, unknown>,
    key: string,
  ): number | undefined {
    const value = record[key];
    if (value === undefined || value === null) return undefined;
    if (!Number.isInteger(value) || (value as number) < 0) this.invalidResponse();
    return value as number;
  }

  private invalidResponse(): never {
    throw new ApplicationError(
      'Requirement inference service returned an invalid response',
      'AI_REQUIREMENT_INFERENCE_RESPONSE_INVALID',
      502,
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
