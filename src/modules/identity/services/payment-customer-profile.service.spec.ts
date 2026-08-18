import { PaymentCustomerProfileService } from './payment-customer-profile.service';

describe('PaymentCustomerProfileService', () => {
  it('returns only the allowlisted hosted-checkout profile facts', async () => {
    const database = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          first_name: 'Test',
          last_name: 'Customer',
          email: 'test@example.com',
          phone_number: '+201000000000',
          country: 'EG',
          region: 'Cairo',
          city: 'Cairo',
        }),
      },
    };
    const service = new PaymentCustomerProfileService(database as never);

    await expect(service.getForUser('11111111-1111-4111-8111-111111111111')).resolves.toEqual({
      firstName: 'Test',
      lastName: 'Customer',
      email: 'test@example.com',
      phoneNumber: '+201000000000',
      country: 'EG',
      region: 'Cairo',
      city: 'Cairo',
    });
  });

  it('fails when the identity row is absent', async () => {
    const database = { user: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new PaymentCustomerProfileService(database as never);

    await expect(service.getForUser('11111111-1111-4111-8111-111111111111')).rejects.toMatchObject({
      code: 'PAYMENT_CUSTOMER_PROFILE_NOT_FOUND',
      statusCode: 404,
    });
  });
});
