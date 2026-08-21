import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ApplicationError } from '../../../shared/errors/application.error';

import {
  SkillGapGuidanceImprovementStep,
  SkillGapGuidanceInput,
  SkillGapGuidanceLearningResource,
  SkillGapGuidanceMissingSkill,
  SkillGapGuidancePracticeProject,
  SkillGapGuidanceRecommendedTechnology,
  SkillGapGuidanceResult,
  SkillGapGuidanceSource,
} from '../dto/skill-gap-guidance.dto';

@Injectable()
export class SkillGapGuidanceClient {
  constructor(private readonly config: ConfigService) { }

  async generate(input: SkillGapGuidanceInput): Promise<SkillGapGuidanceResult> {
    const baseUrl = this.config.get<string>(
      'AI_SERVICE_URL',
      'http://localhost:8010',
    );
    const path = this.config.get<string>(
      'AI_SKILL_GAP_GUIDANCE_PATH',
      '/gap-guidance/generate',
    );
    const timeoutMs = this.config.get<number>(
      'AI_SKILL_GAP_GUIDANCE_TIMEOUT_MS',
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
          'Skill-gap guidance service returned an error',
          'AI_SKILL_GAP_GUIDANCE_SERVICE_ERROR',
          502,
        );
      }

      return this.validateResult(await response.json(), input);
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError(
        'Skill-gap guidance service is unavailable',
        'AI_SKILL_GAP_GUIDANCE_SERVICE_UNAVAILABLE',
        502,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private validateResult(
    payload: unknown,
    input: SkillGapGuidanceInput,
  ): SkillGapGuidanceResult {
    if (!this.isRecord(payload)) this.invalidResponse();
    if (payload.status === 'NOT_STARTED_NO_ASSESSABLE_EVIDENCE') {
      return { kind: 'no_assessable_evidence' };
    }
    if (payload.status === 'NOT_STARTED_SYSTEM_LIMIT') {
      return { kind: 'system_limit' };
    }
    if (payload.status !== 'COMPLETED') this.invalidResponse();

    const allowedEvidenceIds = new Set(input.allowedEvidenceIds);
    const missingSkills = this.readArray(payload, 'missingSkills').map((item) =>
      this.validateMissingSkill(item, allowedEvidenceIds),
    );
    const recommendedTechnologies = this.readArray(
      payload,
      'recommendedTechnologies',
    ).map((item) => this.validateRecommendedTechnology(item, allowedEvidenceIds));
    const learningResources = this.readArray(payload, 'learningResources').map(
      (item) => this.validateLearningResource(item, allowedEvidenceIds),
    );
    const practiceProjects = this.readArray(payload, 'practiceProjects').map(
      (item) => this.validatePracticeProject(item, allowedEvidenceIds),
    );
    const improvementPath = this.readArray(payload, 'improvementPath').map(
      (item) => this.validateImprovementStep(item, allowedEvidenceIds),
    );
    const sources = this.readArray(payload, 'sources').map((item) =>
      this.validateSource(item, allowedEvidenceIds),
    );
    if (sources.length === 0) this.invalidResponse();
    const metadata = this.isRecord(payload.metadata)
      ? payload.metadata
      : undefined;
    if (!metadata) this.invalidResponse();

    return {
      kind: 'completed',
      missingSkills,
      recommendedTechnologies,
      learningResources,
      practiceProjects,
      improvementPath,
      sources,
      metadata: {
        provider: this.requiredString(metadata, 'provider', 100),
        model: this.requiredString(metadata, 'model', 100),
        promptVersion: this.requiredString(metadata, 'promptVersion', 100),
        schemaVersion: this.requiredString(metadata, 'schemaVersion', 100),
        serviceVersion: this.requiredString(metadata, 'serviceVersion', 100),
        latencyMs: this.optionalInteger(metadata, 'latencyMs'),
        inputTokens: this.optionalInteger(metadata, 'inputTokens'),
        outputTokens: this.optionalInteger(metadata, 'outputTokens'),
      },
    };
  }

  private validateMissingSkill(
    value: unknown,
    allowedEvidenceIds: Set<string>,
  ): SkillGapGuidanceMissingSkill {
    if (!this.isRecord(value)) this.invalidResponse();
    const gap = value.gap;
    if (gap !== 'not_evidenced' && gap !== 'below_target_proficiency') {
      this.invalidResponse();
    }
    return {
      requirementId: this.requiredString(value, 'requirementId', 200),
      skillName: this.requiredString(value, 'skillName', 200),
      gap,
      explanation: this.requiredString(value, 'explanation', 2000),
      evidenceIds: this.evidenceIds(value.evidenceIds, allowedEvidenceIds),
      uncertainty: this.stringArray(value.uncertainty, 10),
    };
  }

  private validateRecommendedTechnology(
    value: unknown,
    allowedEvidenceIds: Set<string>,
  ): SkillGapGuidanceRecommendedTechnology {
    if (!this.isRecord(value)) this.invalidResponse();
    return {
      name: this.requiredString(value, 'name', 200),
      rationale: this.requiredString(value, 'rationale', 2000),
      evidenceIds: this.evidenceIds(value.evidenceIds, allowedEvidenceIds),
    };
  }

  private validateLearningResource(
    value: unknown,
    allowedEvidenceIds: Set<string>,
  ): SkillGapGuidanceLearningResource {
    if (!this.isRecord(value)) this.invalidResponse();
    const resourceType = value.resourceType;
    if (
      resourceType !== 'documentation' &&
      resourceType !== 'course' &&
      resourceType !== 'tutorial' &&
      resourceType !== 'book' &&
      resourceType !== 'reference'
    ) {
      this.invalidResponse();
    }
    const url = this.requiredString(value, 'url', 1000);
    if (!/^https?:\/\//.test(url)) this.invalidResponse();
    return {
      title: this.requiredString(value, 'title', 300),
      resourceType,
      url,
      rationale: this.requiredString(value, 'rationale', 2000),
      evidenceIds: this.evidenceIds(value.evidenceIds, allowedEvidenceIds),
    };
  }

  private validatePracticeProject(
    value: unknown,
    allowedEvidenceIds: Set<string>,
  ): SkillGapGuidancePracticeProject {
    if (!this.isRecord(value)) this.invalidResponse();
    return {
      title: this.requiredString(value, 'title', 300),
      description: this.requiredString(value, 'description', 3000),
      technologies: this.stringArray(value.technologies, 20),
      evidenceIds: this.evidenceIds(value.evidenceIds, allowedEvidenceIds),
    };
  }

  private validateImprovementStep(
    value: unknown,
    allowedEvidenceIds: Set<string>,
  ): SkillGapGuidanceImprovementStep {
    if (!this.isRecord(value)) this.invalidResponse();
    return {
      step: this.requiredString(value, 'step', 300),
      focus: this.requiredString(value, 'focus', 2000),
      estimatedDuration:
        value.estimatedDuration === null || value.estimatedDuration === undefined
          ? null
          : this.requiredString(value, 'estimatedDuration', 100),
      evidenceIds: this.evidenceIds(value.evidenceIds, allowedEvidenceIds),
    };
  }

  private validateSource(
    value: unknown,
    allowedEvidenceIds: Set<string>,
  ): SkillGapGuidanceSource {
    if (!this.isRecord(value)) this.invalidResponse();
    const type = value.type;
    if (
      type !== 'approved_skill' &&
      type !== 'contribution_requirement' &&
      type !== 'curated_learning_resource'
    ) {
      this.invalidResponse();
    }
    const evidenceId = this.requiredString(value, 'evidenceId', 200);
    if (!allowedEvidenceIds.has(evidenceId)) this.invalidResponse();
    return {
      evidenceId,
      label: this.requiredString(value, 'label', 300),
      type,
    };
  }

  private evidenceIds(value: unknown, allowedEvidenceIds: Set<string>): string[] {
    const ids = this.stringArray(value, 50);
    if (ids.length === 0 || ids.some((id) => !allowedEvidenceIds.has(id))) {
      this.invalidResponse();
    }
    return Array.from(new Set(ids));
  }

  private readArray(
    record: Record<string, unknown>,
    key: string,
  ): unknown[] {
    if (!Array.isArray(record[key])) this.invalidResponse();
    return record[key] as unknown[];
  }

  private stringArray(value: unknown, maxItems: number): string[] {
    if (
      !Array.isArray(value) ||
      value.length > maxItems ||
      value.some(
        (item) => typeof item !== 'string' || !item.trim() || item.length > 1000,
      )
    ) {
      this.invalidResponse();
    }
    return value as string[];
  }

  private requiredString(
    record: Record<string, unknown>,
    key: string,
    maxLength: number,
  ): string {
    const value = record[key];
    if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
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
      'Skill-gap guidance service returned an invalid response',
      'AI_SKILL_GAP_GUIDANCE_RESPONSE_INVALID',
      502,
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
