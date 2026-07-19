import { createCorsOptions, parseCorsOrigins } from './cors.config';

describe('CORS configuration', () => {
  it('reflects any requesting origin in development', () => {
    expect(
      createCorsOptions('development', 'http://localhost:3000'),
    ).toEqual({
      origin: true,
      credentials: true,
    });
  });

  it('uses the configured allowlist outside development', () => {
    expect(
      createCorsOptions(
        'production',
        'https://app.example.com, https://admin.example.com',
      ),
    ).toEqual({
      origin: ['https://app.example.com', 'https://admin.example.com'],
      credentials: true,
    });
  });

  it('normalizes configured origins', () => {
    expect(
      parseCorsOrigins(
        " 'https://app.example.com', \"https://admin.example.com\", ",
      ),
    ).toEqual(['https://app.example.com', 'https://admin.example.com']);
  });
});
