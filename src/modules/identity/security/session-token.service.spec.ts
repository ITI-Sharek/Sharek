import { SessionTokenService } from './session-token.service';

describe('SessionTokenService', () => {
  const service = new SessionTokenService();

  it('generates opaque tokens and hashes', () => {
    const tokens = service.generate();

    expect(tokens.accessToken).not.toEqual(tokens.accessTokenHash);
    expect(tokens.refreshToken).not.toEqual(tokens.refreshTokenHash);
    expect(tokens.accessTokenHash).toHaveLength(64);
    expect(tokens.refreshTokenHash).toHaveLength(64);
  });
});
