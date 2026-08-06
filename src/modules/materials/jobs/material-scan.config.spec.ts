import { ConfigService } from '@nestjs/config';

import { isMaterialScanQueueEnabled } from './material-scan.config';

describe('isMaterialScanQueueEnabled', () => {
  const config = (values: Record<string, unknown>) =>
    ({
      get: (key: string, fallback: unknown) =>
        key in values ? values[key] : fallback,
    }) as unknown as ConfigService;

  it.each([
    ['test', false],
    ['development', true],
    ['production', true],
  ])('defaults to %s => %s', (nodeEnv, expected) => {
    expect(isMaterialScanQueueEnabled(config({ NODE_ENV: nodeEnv }))).toBe(
      expected,
    );
  });

  it('lets an explicit switch override the environment default', () => {
    expect(
      isMaterialScanQueueEnabled(
        config({ NODE_ENV: 'test', MATERIAL_SCAN_QUEUE_ENABLED: true }),
      ),
    ).toBe(true);
  });
});
