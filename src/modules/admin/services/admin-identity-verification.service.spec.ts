import { AdminIdentityVerificationService } from './admin-identity-verification.service';

describe('AdminIdentityVerificationService', () => {
  const admin = {
    id: 'admin-uuid-1',
    email: 'admin@sharek.org',
    role: 'admin' as const,
    status: 'active' as const,
  };

  const sampleUser = {
    id: 'user-uuid-1',
    email: 'contributor@sharek.org',
    username: 'contributor1',
    first_name: 'Ahmed',
    last_name: 'Hassan',
    avatar_url: null,
    role: 'contributor',
    status: 'active',
    preferred_language: 'en',
    identity_verification_status: 'pending',
    identity_document_data: Buffer.from('mock-pdf-bytes'),
    identity_document_mime_type: 'application/pdf',
    identity_document_updated_at: new Date('2026-08-18T10:00:00.000Z'),
    identity_verified_at: null,
    identity_verification_rejected_reason: null,
    identity_verified_by: null,
    created_at: new Date('2026-08-01T10:00:00.000Z'),
    updated_at: new Date('2026-08-18T10:00:00.000Z'),
    last_login_at: null,
    phone_number: null,
    phone_verified_at: null,
    country: null,
    region: null,
    city: null,
    gender: null,
    date_of_birth: null,
    profile_visibility: 'public',
    show_email: false,
    show_phone: false,
    show_activity: true,
    allow_indexing: true,
  };

  function createService() {
    const database = {
      user: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([sampleUser]),
        findUnique: jest.fn().mockResolvedValue(sampleUser),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            ...sampleUser,
            ...data,
          }),
        ),
      },
    };

    const emailVerificationSender = {
      sendIdentityVerificationApproved: jest.fn().mockResolvedValue(undefined),
      sendIdentityVerificationRejected: jest.fn().mockResolvedValue(undefined),
    };

    const service = new AdminIdentityVerificationService(
      database as never,
      emailVerificationSender as never,
    );

    return { service, database, emailVerificationSender };
  }

  it('lists pending identity verifications with pagination', async () => {
    const { service, database } = createService();
    const result = await service.listVerifications({ page: 1, limit: 20, status: 'pending' });

    expect(result.total).toBe(1);
    expect(result.items.length).toBe(1);
    expect(result.items[0].email).toBe('contributor@sharek.org');
    expect(result.items[0].identityVerificationStatus).toBe('pending');
    expect(database.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { identity_verification_status: 'pending' },
      }),
    );
  });

  it('serves stored document buffer with mime type and filename', async () => {
    const { service } = createService();
    const doc = await service.getDocument('user-uuid-1');

    expect(doc.mimeType).toBe('application/pdf');
    expect(doc.filename).toBe('id-user-uuid-1.pdf');
    expect(doc.data.toString()).toBe('mock-pdf-bytes');
  });

  it('approves an identity verification and sends approval email notification', async () => {
    const { service, database, emailVerificationSender } = createService();
    const result = await service.reviewVerification(admin, 'user-uuid-1', {
      decision: 'verified',
    });

    expect(result.message).toContain('approved');
    expect(database.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-uuid-1' },
        data: expect.objectContaining({
          identity_verification_status: 'verified',
          identity_verified_by: admin.id,
          identity_verification_rejected_reason: null,
        }),
      }),
    );
    expect(emailVerificationSender.sendIdentityVerificationApproved).toHaveBeenCalledWith(
      expect.objectContaining({
        to: sampleUser.email,
        firstName: sampleUser.first_name,
      }),
    );
  });

  it('rejects an identity verification with reason and sends rejection email notification', async () => {
    const { service, database, emailVerificationSender } = createService();
    const result = await service.reviewVerification(admin, 'user-uuid-1', {
      decision: 'rejected',
      reason: 'Photo is blurry and unreadable',
    });

    expect(result.message).toContain('rejected');
    expect(database.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-uuid-1' },
        data: expect.objectContaining({
          identity_verification_status: 'rejected',
          identity_verification_rejected_reason: 'Photo is blurry and unreadable',
          identity_verified_by: admin.id,
        }),
      }),
    );
    expect(emailVerificationSender.sendIdentityVerificationRejected).toHaveBeenCalledWith(
      expect.objectContaining({
        to: sampleUser.email,
        firstName: sampleUser.first_name,
        reason: 'Photo is blurry and unreadable',
      }),
    );
  });
});
