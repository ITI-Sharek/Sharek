import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ApplicationError } from '../../../shared/errors/application.error';
import {
  MaterialAnalysisInput,
  MaterialAnalysisResult,
  MaterialAnalysisSourceVersion,
} from '../dto/material-analysis.dto';

@Injectable()
export class MaterialAnalysisClient {
  constructor(private readonly config: ConfigService) {}

  async analyze(input: MaterialAnalysisInput): Promise<MaterialAnalysisResult> {
    const baseUrl = this.config.get<string>('AI_SERVICE_URL', 'http://localhost:8010');
    const path = this.config.get<string>(
      'AI_MATERIAL_ANALYSIS_PATH',
      '/material-analysis/analyze',
    );
    const timeoutMs = this.config.get<number>(
      'AI_MATERIAL_ANALYSIS_TIMEOUT_MS',
      135_000,
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

      if (response.status === 422) {
        throw new ApplicationError(
          'Selected Materials could not be analyzed',
          'AI_MATERIAL_ANALYSIS_INPUT_REJECTED',
          422,
        );
      }
      if (!response.ok) {
        throw new ApplicationError(
          'Material analysis service returned an error',
          'AI_MATERIAL_ANALYSIS_SERVICE_ERROR',
          502,
        );
      }

      return this.validateResult(await response.json(), input);
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError(
        'Material analysis service is unavailable',
        'AI_MATERIAL_ANALYSIS_SERVICE_UNAVAILABLE',
        502,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private validateResult(
    payload: unknown,
    input: MaterialAnalysisInput,
  ): MaterialAnalysisResult {
    if (!this.isRecord(payload) || payload.status !== 'COMPLETED') {
      this.invalidResponse();
    }
    if (
      !Array.isArray(payload.projectSuggestions) ||
      !Array.isArray(payload.contributionRequestSuggestions) ||
      !this.isRecord(payload.metadata) ||
      (payload.chunks !== undefined && !Array.isArray(payload.chunks))
    ) {
      this.invalidResponse();
    }

    if (
      payload.projectSuggestions.length > 5 ||
      payload.contributionRequestSuggestions.length > 5
    ) {
      this.invalidResponse();
    }
    const projectSuggestions = payload.projectSuggestions.map((item) =>
      this.validateProjectSuggestion(item, input),
    );
    const contributionRequestSuggestions = payload.contributionRequestSuggestions.map(
      (item) => this.validateContributionRequestSuggestion(item, input),
    );
    const metadata = payload.metadata;
    const documentCount = this.requiredInteger(metadata, 'documentCount', 20, 1);
    if (documentCount !== input.materials.length) {
      this.invalidResponse();
    }

    return {
      status: 'COMPLETED',
      projectSuggestions,
      contributionRequestSuggestions,
      metadata: {
        provider: this.requiredString(metadata, 'provider', 100),
        model: this.requiredString(metadata, 'model', 150),
        promptVersion: this.requiredString(metadata, 'promptVersion', 100),
        schemaVersion: this.requiredString(metadata, 'schemaVersion', 100),
        serviceVersion: this.requiredString(metadata, 'serviceVersion', 100),
        latencyMs: this.requiredInteger(metadata, 'latencyMs'),
        documentCount,
        extractedCharacters: this.requiredInteger(
          metadata,
          'extractedCharacters',
          input.maxExtractedCharacters,
          1,
        ),
      },
      chunks: Array.isArray(payload.chunks)
        ? payload.chunks.map((item) => this.validateChunk(item, input))
        : [],
    };
  }

  private validateChunk(
    value: unknown,
    input: MaterialAnalysisInput,
  ): MaterialAnalysisResult['chunks'][number] {
    if (!this.isRecord(value)) this.invalidResponse();
    const materialId = value.materialId;
    const version = value.version;
    const key = `${String(materialId)}:${String(version)}`;
    if (
      typeof materialId !== 'string' ||
      !Number.isInteger(version) ||
      !input.materials.some(
        (item) => `${item.materialId}:${item.version}` === key,
      )
    ) {
      this.invalidResponse();
    }
    const embedding = value.embedding;
    if (
      !Array.isArray(embedding) ||
      embedding.length === 0 ||
      embedding.length > 4096 ||
      embedding.some((item) => typeof item !== 'number' || !Number.isFinite(item))
    ) {
      this.invalidResponse();
    }
    return {
      chunkId: this.requiredString(value, 'chunkId', 200),
      materialId,
      version: version as number,
      text: this.requiredString(value, 'text', 10_000),
      characterStart:
        value.characterStart === null || value.characterStart === undefined
          ? null
          : this.requiredInteger(value, 'characterStart', Number.MAX_SAFE_INTEGER, 0),
      characterEnd:
        value.characterEnd === null || value.characterEnd === undefined
          ? null
          : this.requiredInteger(value, 'characterEnd', Number.MAX_SAFE_INTEGER, 0),
      embedding: embedding as number[],
    };
  }

  private validateProjectSuggestion(
    value: unknown,
    input: MaterialAnalysisInput,
  ): MaterialAnalysisResult['projectSuggestions'][number] {
    if (!this.isRecord(value)) this.invalidResponse();
    const targetField = value.targetField;
    if (
      targetField !== 'title' &&
      targetField !== 'description' &&
      targetField !== 'technologies' &&
      targetField !== 'category' &&
      targetField !== 'difficulty'
    ) {
      this.invalidResponse();
    }
    const suggestionValue = value.value;
    if (
      targetField === 'technologies'
        ? !this.isStringArray(suggestionValue) || suggestionValue.length === 0
        : typeof suggestionValue !== 'string' || !suggestionValue.trim()
    ) {
      this.invalidResponse();
    }
    if (targetField === 'category' && !['web', 'mobile', 'ai_ml', 'devops', 'tools_utilities'].includes(String(suggestionValue))) {
      this.invalidResponse();
    }
    if (targetField === 'difficulty' && !['beginner', 'intermediate', 'advanced'].includes(String(suggestionValue))) {
      this.invalidResponse();
    }

    return {
      targetField,
      value: suggestionValue as string | string[],
      rationale: this.requiredString(value, 'rationale', 2_000),
      sourceVersions: this.validateSources(value.sourceVersions, input),
    };
  }

  private validateContributionRequestSuggestion(
    value: unknown,
    input: MaterialAnalysisInput,
  ): MaterialAnalysisResult['contributionRequestSuggestions'][number] {
    if (!this.isRecord(value)) this.invalidResponse();
    if (
      !Array.isArray(value.requirements) ||
      value.requirements.length === 0 ||
      value.requirements.length > 20 ||
      !value.requirements.some(
        (requirement) =>
          this.isRecord(requirement) && requirement.kind === 'required',
      ) ||
      !this.isStringArray(value.technologyTags, 50)
    ) {
      this.invalidResponse();
    }
    const requirements = value.requirements.map((requirement) => {
      if (!this.isRecord(requirement)) this.invalidResponse();
      if (
        requirement.kind !== 'required' &&
        requirement.kind !== 'preferred'
      ) {
        this.invalidResponse();
      }
      const text = this.requiredString(requirement, 'text', 500);
      if (text.length < 2) this.invalidResponse();
      return {
        kind: requirement.kind as 'required' | 'preferred',
        text,
      };
    });
    const difficulty = value.difficulty;
    if (
      difficulty !== null &&
      difficulty !== 'beginner' &&
      difficulty !== 'intermediate' &&
      difficulty !== 'advanced'
    ) {
      this.invalidResponse();
    }
    return {
      title: this.requiredString(value, 'title', 255),
      description: this.requiredString(value, 'description', 5_000),
      requirements,
      technologyTags: value.technologyTags as string[],
      difficulty,
      rationale: this.requiredString(value, 'rationale', 2_000),
      sourceVersions: this.validateSources(value.sourceVersions, input),
    };
  }

  private validateSources(
    value: unknown,
    input: MaterialAnalysisInput,
  ): MaterialAnalysisSourceVersion[] {
    if (!Array.isArray(value) || value.length === 0 || value.length > 20) {
      this.invalidResponse();
    }
    const allowed = new Set(
      input.materials.map((item) => `${item.materialId}:${item.version}`),
    );
    const seen = new Set<string>();
    return value.map((source) => {
      if (!this.isRecord(source) || typeof source.materialId !== 'string' || !Number.isInteger(source.version)) {
        this.invalidResponse();
      }
      const version = source.version as number;
      const key = `${source.materialId}:${version}`;
      if (seen.has(key) || !allowed.has(key) || version < 1) {
        this.invalidResponse();
      }
      seen.add(key);
      return { materialId: source.materialId, version };
    });
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

  private requiredInteger(
    record: Record<string, unknown>,
    key: string,
    maxValue = Number.MAX_SAFE_INTEGER,
    minValue = 0,
  ): number {
    const value = record[key];
    if (
      !Number.isInteger(value) ||
      (value as number) < minValue ||
      (value as number) > maxValue
    ) {
      this.invalidResponse();
    }
    return value as number;
  }

  private isStringArray(value: unknown, maxItemLength = 100): value is string[] {
    return (
      Array.isArray(value) &&
      value.length <= 20 &&
      value.every(
        (item) =>
          typeof item === 'string' &&
          item.trim().length > 0 &&
          item.length <= maxItemLength,
      )
    );
  }

  private invalidResponse(): never {
    throw new ApplicationError(
      'Material analysis service returned an invalid response',
      'AI_MATERIAL_ANALYSIS_RESPONSE_INVALID',
      502,
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
