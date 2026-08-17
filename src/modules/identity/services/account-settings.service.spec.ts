import { AccountSettingsService } from './account-settings.service';

const user = {
  id: 'user-1', email: 'user@example.com', username: 'user-one', password_hash: 'hash',
  first_name: 'User', last_name: 'One', avatar_url: null, role: 'contributor', status: 'active',
  preferred_language: 'en', phone_number: null, phone_verified_at: null, country: null,
  region: null, city: null, gender: null, date_of_birth: null, profile_visibility: 'public',
  show_email: false, show_phone: false, show_activity: true, allow_indexing: true,
  identity_verification_status: 'unverified', identity_document_data: null,
  identity_document_mime_type: null, identity_document_updated_at: null,
  created_at: new Date(), updated_at: new Date(), last_login_at: null,
};

describe('AccountSettingsService', () => {
  function createService() {
    const database = {
      user: { findUnique: jest.fn().mockResolvedValue(user), update: jest.fn().mockResolvedValue(user) },
      authSession: { updateMany: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const passwordHasher = { verify: jest.fn().mockResolvedValue(true), hash: jest.fn().mockResolvedValue('new-hash') };
    const usernames = { assertAvailable: jest.fn().mockResolvedValue(undefined) };
    return { service: new AccountSettingsService(database as never, passwordHasher as never, usernames as never), database, passwordHasher, usernames };
  }

  it('changes a password and revokes every other active session', async () => {
    const { service, database, passwordHasher } = createService();
    await expect(service.changePassword('user-1', 'current-session', { currentPassword: 'old', newPassword: 'NewPassword123!' }))
      .resolves.toEqual({ message: 'Password has been changed successfully' });
    expect(passwordHasher.verify).toHaveBeenCalledWith('old', 'hash');
    expect(database.$transaction).toHaveBeenCalledWith(expect.any(Array));
  });

  it('stores an uploaded identity document as pending rather than verified', async () => {
    const { service, database } = createService();
    await service.uploadIdentityDocument('user-1', { buffer: Buffer.from('pdf'), mimetype: 'application/pdf', size: 3 });
    expect(database.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ identity_verification_status: 'pending' }),
    }));
  });
});
