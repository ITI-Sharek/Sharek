import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ApplicationError } from '../../../shared/errors/application.error';
import {
  AdvisoryFitAssessmentInput,
  AdvisoryFitAssessmentResult,
  AdvisoryFitFinding,
} from '../dto/advisory-fit-assessment.dto';

@Injectable()
export class AdvisoryFitClient {
  constructor(private readonly config: ConfigService) {}

  async assess(
    input: AdvisoryFitAssessmentInput,
  ): Promise<AdvisoryFitAssessmentResult> {
    const baseUrl = this.config.get<string>(
      'AI_SERVICE_URL',
      'http://localhost:8010',
    );
    const path = this.config.get<string>(
      'AI_ADVISORY_FIT_PATH',
      '/advisory-fit/assess',
    );
    const timeoutMs = this.config.get<number>(
      'AI_ADVISORY_FIT_TIMEOUT_MS',
      10000,
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
          'Advisory Fit service returned an error',
          'AI_ADVISORY_FIT_SERVICE_ERROR',
          502,
        );
      }

      return this.validateResult(await response.json());
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError(
        'Advisory Fit service is unavailable',
        'AI_ADVISORY_FIT_SERVICE_UNAVAILABLE',
        502,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private validateResult(payload: unknown): AdvisoryFitAssessmentResult {
    if (!this.isRecord(payload)) this.invalidResponse();

    if (payload.status === 'NOT_STARTED_SYSTEM_LIMIT') {
      return { kind: 'system_limit' };
    }
    if (payload.status === 'NOT_STARTED_NO_ASSESSABLE_EVIDENCE') {
      return { kind: 'no_assessable_evidence' };
    }
    if (payload.status !== 'COMPLETED') this.invalidResponse();
    if (!Array.isArray(payload.findings)) this.invalidResponse();

    const metadata = this.isRecord(payload.metadata) ? payload.metadata : payload;
    return {
      kind: 'completed',
      findings: payload.findings.map((finding) => this.validateFinding(finding)),
      provider: this.requiredString(metadata, 'provider'),
      model: this.requiredString(metadata, 'model'),
      promptVersion: this.requiredString(metadata, 'promptVersion'),
      schemaVersion: this.requiredString(metadata, 'schemaVersion'),
      serviceVersion: this.requiredString(metadata, 'serviceVersion'),
      latencyMs: this.optionalInteger(metadata, 'latencyMs'),
      inputTokens: this.optionalInteger(metadata, 'inputTokens'),
      outputTokens: this.optionalInteger(metadata, 'outputTokens'),
    };
  }

  private validateFinding(value: unknown): AdvisoryFitFinding {
    if (!this.isRecord(value)) this.invalidResponse();
    const citations = value.citations;
    const uncertainty = value.uncertainty;
    if (
      !Array.isArray(citations) ||
      citations.some((citation) => typeof citation !== 'string') ||
      !Array.isArray(uncertainty) ||
      uncertainty.some((item) => typeof item !== 'string')
    ) {
      this.invalidResponse();
    }

    const requirementKind = value.requirementKind;
    const finding = value.finding;
    const confidence = value.confidence;
    if (requirementKind !== 'required' && requirementKind !== 'preferred') {
      this.invalidResponse();
    }
    if (
      finding !== 'SUPPORTED' &&
      finding !== 'PARTIALLY_SUPPORTED' &&
      finding !== 'NOT_EVIDENCED' &&
      finding !== 'INCONCLUSIVE'
    ) {
      this.invalidResponse();
    }
    if (confidence !== 'HIGH' && confidence !== 'MEDIUM' && confidence !== 'LOW') {
      this.invalidResponse();
    }

    return {
      requirementId: this.requiredString(value, 'requirementId'),
      requirementKind,
      finding,
      confidence,
      citations: citations as string[],
      uncertainty: uncertainty as string[],
      explanation: this.requiredString(value, 'explanation', 2000),
    };
  }

  private requiredString(
    record: Record<string, unknown>,
    key: string,
    maxLength = 200,
  ): string {
    const value = record[key];
    if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
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
      'Advisory Fit service returned an invalid response',
      'AI_ADVISORY_FIT_RESPONSE_INVALID',
      502,
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
