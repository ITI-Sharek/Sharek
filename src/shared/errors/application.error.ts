export class ApplicationError extends Error {
  constructor(
    message: string,
    readonly code = 'APPLICATION_ERROR',
  ) {
    super(message);
  }
}

