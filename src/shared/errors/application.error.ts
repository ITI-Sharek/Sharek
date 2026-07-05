export class ApplicationError extends Error {
  constructor(
    message: string,
    readonly code = 'APPLICATION_ERROR',
    readonly statusCode = 400,
  ) {
    super(message);
  }
}
