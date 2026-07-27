import { createHmac } from 'crypto';

import { GitHubAppWebhookController } from './github-app-webhook.controller';

describe('GitHubAppWebhookController', () => {
  const secret = 'test-webhook-secret-at-least-32-characters';
  const credentials = {
    verifyWebhookSignature: jest.fn((body: Buffer, signature: string) => {
      const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
      return signature === expected;
    }),
  };
  const webhookService = { process: jest.fn().mockResolvedValue({ accepted: true }) };
  const controller = new GitHubAppWebhookController(
    credentials as never,
    webhookService as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('verifies the exact raw body before delegating headers and parsed payload', async () => {
    const rawBody = Buffer.from('{"action":"created"}');
    const signature = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
    await controller.receive(
      { rawBody, body: { action: 'created' } } as never,
      signature,
      'delivery-1',
      'installation',
    );
    expect(credentials.verifyWebhookSignature).toHaveBeenCalledWith(rawBody, signature);
    expect(webhookService.process).toHaveBeenCalledWith(
      'delivery-1',
      'installation',
      { action: 'created' },
    );
  });

  it('rejects an invalid signature without changing state', () => {
    expect(() =>
      controller.receive(
        { rawBody: Buffer.from('{}'), body: {} } as never,
        'sha256=invalid',
        'delivery-2',
        'installation',
      ),
    ).toThrow(expect.objectContaining({ code: 'GITHUB_APP_WEBHOOK_SIGNATURE_INVALID' }));
    expect(webhookService.process).not.toHaveBeenCalled();
  });
});
