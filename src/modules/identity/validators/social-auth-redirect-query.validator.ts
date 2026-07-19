import { ApplicationError } from '../../../shared/errors/application.error';

export interface SocialAuthRedirectQuery {
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
}

const QUERY_LIMITS = {
  code: 500,
  state: 200,
  error: 200,
  error_description: 500,
} as const;

export function parseSocialAuthRedirectQuery(
  query: Record<string, unknown>,
): SocialAuthRedirectQuery {
  const result: SocialAuthRedirectQuery = {
    code: readOptionalString(query, 'code'),
    state: readOptionalString(query, 'state'),
    error: readOptionalString(query, 'error'),
    errorDescription: readOptionalString(query, 'error_description'),
  };

  if (!result.error && (!result.code || !result.state)) {
    throw new ApplicationError(
      'OAuth callback code and state are required',
      'SOCIAL_AUTH_INVALID_CALLBACK',
      400,
    );
  }

  return result;
}

function readOptionalString(
  query: Record<string, unknown>,
  key: keyof typeof QUERY_LIMITS,
): string | undefined {
  const value = query[key];
  if (value === undefined) return undefined;

  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > QUERY_LIMITS[key]
  ) {
    throw new ApplicationError(
      `OAuth callback parameter ${key} is invalid`,
      'SOCIAL_AUTH_INVALID_CALLBACK',
      400,
    );
  }

  return value;
}
