import {
  BadRequestException,
  ValidationPipe,
  ValidationPipeOptions,
} from '@nestjs/common';
import { ValidationError } from 'class-validator';

import { BadRequestApplicationError } from '../errors/application.error';

const STABLE_VALIDATION_PREFIX = 'APPLICATION_ERROR:';

export function stableValidationMessage(code: string, message: string): string {
  return `${STABLE_VALIDATION_PREFIX}${JSON.stringify({ code, message })}`;
}

export function createApplicationValidationPipe(
  options: ValidationPipeOptions = {},
): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
    ...options,
    exceptionFactory: (errors) => {
      const messages = flattenValidationMessages(errors);
      const stableError = messages
        .map(parseStableValidationMessage)
        .find((value) => value !== null);
      if (stableError) {
        return new BadRequestApplicationError(
          stableError.message,
          stableError.code,
        );
      }
      return new BadRequestException(messages);
    },
  });
}

function parseStableValidationMessage(
  value: string,
): { code: string; message: string } | null {
  if (!value.startsWith(STABLE_VALIDATION_PREFIX)) return null;
  try {
    const parsed = JSON.parse(
      value.slice(STABLE_VALIDATION_PREFIX.length),
    ) as Record<string, unknown>;
    return typeof parsed.code === 'string' && typeof parsed.message === 'string'
      ? { code: parsed.code, message: parsed.message }
      : null;
  } catch {
    return null;
  }
}

function flattenValidationMessages(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...flattenValidationMessages(error.children ?? []),
  ]);
}
