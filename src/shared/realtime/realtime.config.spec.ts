import { ConfigService } from '@nestjs/config';

import { isRealtimeNotificationsEnabled } from './realtime.config';

describe('isRealtimeNotificationsEnabled', () => {
  it('defaults the shared realtime transport to disabled', () => {
    expect(isRealtimeNotificationsEnabled(new ConfigService())).toBe(false);
  });

  it.each([true, 'true'])('accepts an enabled value: %p', (value) => {
    expect(
      isRealtimeNotificationsEnabled(
        new ConfigService({ REALTIME_NOTIFICATIONS_ENABLED: value }),
      ),
    ).toBe(true);
  });

  it.each([false, 'false', 'unexpected'])('rejects a disabled value: %p', (value) => {
    expect(
      isRealtimeNotificationsEnabled(
        new ConfigService({ REALTIME_NOTIFICATIONS_ENABLED: value }),
      ),
    ).toBe(false);
  });
});
