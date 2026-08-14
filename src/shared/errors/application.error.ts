export class ApplicationError extends Error {
  constructor(
    message: string,
    readonly code = 'APPLICATION_ERROR',
    readonly statusCode = 400,
    readonly metadata?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export class BadRequestApplicationError extends ApplicationError {
  constructor(message: string, code = 'BAD_REQUEST') {
    super(message, code, 400);
  }
}

export class ForbiddenApplicationError extends ApplicationError {
  constructor(message: string, code = 'FORBIDDEN') {
    super(message, code, 403);
  }
}

export class NotFoundApplicationError extends ApplicationError {
  constructor(message: string, code = 'NOT_FOUND') {
    super(message, code, 404);
  }
}

export class ConflictApplicationError extends ApplicationError {
  constructor(
    message: string,
    code = 'CONFLICT',
    metadata?: Record<string, unknown>,
  ) {
    super(message, code, 409, metadata);
  }
}

export class UnprocessableApplicationError extends ApplicationError {
  constructor(
    message: string,
    code = 'UNPROCESSABLE_ENTITY',
    // Optional, matching ConflictApplicationError. A 422 that names which of
    // fifteen skill rows was the duplicate saves the caller a second request to
    // find out; existing two-argument call sites are unaffected.
    metadata?: Record<string, unknown>,
  ) {
    super(message, code, 422, metadata);
  }
}
