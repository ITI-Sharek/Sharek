import { PaymobWebhookController } from './paymob-webhook.controller';

describe('PaymobWebhookController', () => {
  it('keeps the provider callback public and delegates body, HMAC, and server time', async () => {
    const process = jest.fn().mockResolvedValue({
      received: true,
      outcome: 'processed',
    });
    const controller = new PaymobWebhookController({ process } as never);
    const request = { body: { type: 'TRANSACTION' } };

    await expect(
      controller.receive(request as never, 'a'.repeat(128)),
    ).resolves.toEqual({ received: true, outcome: 'processed' });

    expect(process).toHaveBeenCalledWith({
      payload: request.body,
      hmac: 'a'.repeat(128),
      processedAt: expect.any(Date),
    });
  });
});
