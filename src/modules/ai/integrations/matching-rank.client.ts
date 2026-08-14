import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ApplicationError } from '../../../shared/errors/application.error';
import {
  MatchingRankInput,
  MatchingRankResult,
  RankedMatchDto,
} from '../dto/matching-rank.dto';

/** A narrative is one or two sentences on a card, not an essay. */
const MAX_NARRATIVE_LENGTH = 300;

@Injectable()
export class MatchingRankClient {
  constructor(private readonly config: ConfigService) {}

  async rank(input: MatchingRankInput): Promise<MatchingRankResult> {
    const baseUrl = this.config.get<string>(
      'AI_SERVICE_URL',
      'http://localhost:8010',
    );
    const path = this.config.get<string>(
      'AI_MATCHING_RANK_PATH',
      '/matching/rank',
    );
    const timeoutMs = this.config.get<number>(
      'AI_MATCHING_RANK_TIMEOUT_MS',
      30_000,
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
          'Matching rank service returned an error',
          'AI_MATCHING_RANK_SERVICE_ERROR',
          502,
        );
      }

      return this.validateResult(await response.json(), input);
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError(
        'Matching rank service is unavailable',
        'AI_MATCHING_RANK_SERVICE_UNAVAILABLE',
        502,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Revalidate everything the agent already promised.
   *
   * The FastAPI schema enforces the same shape, so this looks redundant — it is
   * not. That schema is a promise by a separately deployed service that can be
   * changed, rolled back, or replaced without this repository knowing. This is
   * the check that actually runs before an order reaches a contributor.
   *
   * Every failure here is thrown, not repaired. The caller falls back to the
   * deterministic order, which is a complete and correct answer; a partially
   * trusted one is not.
   */
  private validateResult(
    payload: unknown,
    input: MatchingRankInput,
  ): MatchingRankResult {
    if (!this.isRecord(payload)) this.invalidResponse();
    if (!Array.isArray(payload.matches)) this.invalidResponse();

    const matches = payload.matches.map((match) => this.validateMatch(match));

    // The safety property, checked here as well as in the agent. A ranker may
    // reorder and explain; it may not add a Request the exclusions rejected,
    // drop one that was chosen, or repeat one to push another out of a capped
    // list. Comparing as a set *and* by count catches all three, because a
    // duplicate leaves the sets equal while the counts differ.
    const expected = new Set(input.candidates.map((c) => c.requestId));
    const returned = matches.map((match) => match.requestId);
    if (returned.length !== expected.size) this.invalidResponse();
    if (new Set(returned).size !== returned.length) this.invalidResponse();
    if (returned.some((requestId) => !expected.has(requestId))) {
      this.invalidResponse();
    }

    const metadata = this.isRecord(payload.metadata) ? payload.metadata : payload;
    return {
      matches,
      provider: this.requiredString(metadata, 'provider'),
      model: this.requiredString(metadata, 'model'),
      promptVersion: this.requiredString(metadata, 'promptVersion'),
      schemaVersion: this.requiredString(metadata, 'schemaVersion'),
      serviceVersion: this.requiredString(metadata, 'serviceVersion'),
      latencyMs: this.optionalInteger(metadata, 'latencyMs'),
    };
  }

  private validateMatch(value: unknown): RankedMatchDto {
    if (!this.isRecord(value)) this.invalidResponse();

    const requestId = value.requestId;
    const whyThisMatches = value.whyThisMatches;

    if (typeof requestId !== 'string' || requestId.trim().length === 0) {
      this.invalidResponse();
    }
    if (
      typeof whyThisMatches !== 'string' ||
      whyThisMatches.trim().length === 0 ||
      whyThisMatches.length > MAX_NARRATIVE_LENGTH
    ) {
      this.invalidResponse();
    }
    // Rejected rather than stripped. A percentage here means the far side
    // changed its contract, and quietly deleting the character would leave a
    // sentence built around a number the reader can no longer see (DEC-010).
    if ((whyThisMatches as string).includes('%')) this.invalidResponse();

    return {
      requestId: requestId as string,
      whyThisMatches: (whyThisMatches as string).trim(),
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private requiredString(
    source: Record<string, unknown>,
    key: string,
  ): string {
    const value = source[key];
    if (typeof value !== 'string' || value.trim().length === 0) {
      this.invalidResponse();
    }
    return value as string;
  }

  private optionalInteger(
    source: Record<string, unknown>,
    key: string,
  ): number | undefined {
    const value = source[key];
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return undefined;
    }
    return Math.trunc(value);
  }

  private invalidResponse(): never {
    throw new ApplicationError(
      'Matching rank service returned an invalid response',
      'AI_MATCHING_RANK_INVALID_RESPONSE',
      502,
    );
  }
}
