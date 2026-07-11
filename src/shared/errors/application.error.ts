export class ApplicationError extends Error {
  constructor(
    message: string,
    readonly code = 'APPLICATION_ERROR',
    readonly statusCode = 400,
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
  constructor(message: string, code = 'CONFLICT') {
    super(message, code, 409);
  }
}

export class UnprocessableApplicationError extends ApplicationError {
  constructor(message: string, code = 'UNPROCESSABLE_ENTITY') {
    super(message, code, 422);
  }
}
