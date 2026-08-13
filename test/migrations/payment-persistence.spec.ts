import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationsDirectory = join(process.cwd(), 'prisma', 'migrations');

describe('PAY-02 payment persistence migration', () => {
  it('contains the payment attempt and webhook persistence constraints', () => {
    const migration = readdirSync(migrationsDirectory).find((entry) =>
      entry.includes('payment_attempts_and_webhook_events'),
    );

    expect(migration).toBe('20260813120000_payment_attempts_and_webhook_events');

    const sql = readFileSync(
      join(migrationsDirectory, migration!, 'migration.sql'),
      'utf8',
    );
    expect(sql).toContain('CREATE TABLE "PaymentAttempt"');
    expect(sql).toContain('CREATE TABLE "PaymentWebhookEvent"');
    expect(sql).toContain('PaymentAttempt_user_id_idempotency_key_key');
    expect(sql).toContain('PaymentWebhookEvent_fingerprint_key');
    expect(sql).toContain('PaymentWebhookEvent_provider_provider_event_id_key');
    expect(sql).toContain('PaymentWebhookEvent_payment_attempt_id_fkey');
  });

  it('adds the PAY-03 hosted checkout handoff field', () => {
    const migration = readdirSync(migrationsDirectory).find((entry) =>
      entry.includes('payment_checkout_handoff'),
    );

    expect(migration).toBe('20260813150000_payment_checkout_handoff');
    expect(
      readFileSync(
        join(migrationsDirectory, migration!, 'migration.sql'),
        'utf8',
      ),
    ).toContain(
      'ADD COLUMN "provider_client_secret" VARCHAR(1000)',
    );
  });
});
