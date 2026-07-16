import { PasswordHasher } from './password-hasher.service';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('verifies a hashed password', async () => {
    const hash = await hasher.hash('correct-password');

    await expect(hasher.verify('correct-password', hash)).resolves.toBe(true);
    await expect(hasher.verify('wrong-password', hash)).resolves.toBe(false);
  });
});
