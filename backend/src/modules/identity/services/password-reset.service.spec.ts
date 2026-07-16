import { hashToken } from '../../../shared/auth/token-hash';
import { PasswordResetService } from './password-reset.service';

describe('PasswordResetService', () => {
  it('resets the password, consumes the code, and revokes sessions', async () => {
    const database = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      passwordResetOtp: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'reset-1',
          code_hash: hashToken('123456'),
          attempts: 0,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      authSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const passwordHasher = {
      hash: jest.fn().mockResolvedValue('new-password-hash'),
    };
    const service = new PasswordResetService(
      database as never,
      passwordHasher as never,
      {} as never,
    );

    await expect(
      service.resetPassword({
        email: 'owner@example.com',
        code: '123456',
        newPassword: 'NewPassword123!',
      }),
    ).resolves.toEqual({ message: 'Password has been reset successfully' });
    expect(database.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { password_hash: 'new-password-hash' },
    });
    expect(database.passwordResetOtp.update).toHaveBeenCalledWith({
      where: { id: 'reset-1' },
      data: { consumed_at: expect.any(Date) },
    });
    expect(database.authSession.updateMany).toHaveBeenCalledWith({
      where: { user_id: 'user-1', revoked_at: null },
      data: { revoked_at: expect.any(Date) },
    });
  });
});
