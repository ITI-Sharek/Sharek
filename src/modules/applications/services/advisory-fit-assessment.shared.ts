import { Prisma } from '@prisma/client';

import { NotFoundApplicationError } from '../../../shared/errors/application.error';

/**
 * Shared between the command service, which creates and reads Assessment
 * Requests, and the processor, which fulfils them on a worker. Kept deliberately
 * small: anything only one side needs stays with that side.
 */

export const APPLICATION_ASSESSMENT_INCLUDE = {
  requirementSnapshot: true,
  evidenceSnapshot: true,
} satisfies Prisma.ApplicationInclude;

export const ASSESSMENT_REQUEST_INCLUDE = {
  attempts: {
    orderBy: { attempt_number: 'desc' },
    include: {
      advisoryFitAssessment: {
        include: {
          findings: { orderBy: { requirement_id: 'asc' } },
          presentation: true,
        },
      },
    },
  },
} satisfies Prisma.AssessmentRequestInclude;

export type AssessmentApplication = Prisma.ApplicationGetPayload<{
  include: typeof APPLICATION_ASSESSMENT_INCLUDE;
}>;

export type AssessmentRequestWithResults = Prisma.AssessmentRequestGetPayload<{
  include: typeof ASSESSMENT_REQUEST_INCLUDE;
}>;

/**
 * The provider is allowed at most this many attempts per request. Distinct from
 * the queue's own retry budget: BullMQ retries infrastructure failures, while
 * this bounds how many times we will ask the provider about one Application.
 */
export const MAX_PROVIDER_ATTEMPTS = 2;

export function applicationNotFound(): NotFoundApplicationError {
  return new NotFoundApplicationError(
    'Application not found',
    'APPLICATION_NOT_FOUND',
  );
}

export function jsonStringArray(value: Prisma.JsonValue | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}
