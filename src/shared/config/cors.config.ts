import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

export function parseCorsOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

export function createCorsOptions(
  environment: string,
  configuredOrigins: string,
): CorsOptions {
  return {
    // Reflect the request origin in development. A literal wildcard cannot be
    // used with credentialed requests because browsers reject that combination.
    origin:
      environment === 'development'
        ? true
        : parseCorsOrigins(configuredOrigins),
    credentials: true,
  };
}
