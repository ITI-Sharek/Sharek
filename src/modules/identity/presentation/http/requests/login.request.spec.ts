import { validate } from 'class-validator';

import { LoginRequest } from './login.request';

describe('LoginRequest', () => {
  it('requires a password of at least 8 characters', async () => {
    const request = new LoginRequest();
    request.email = 'contributor@example.com';
    request.password = 'short';

    const errors = await validate(request);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'password',
        }),
      ]),
    );
  });
});
