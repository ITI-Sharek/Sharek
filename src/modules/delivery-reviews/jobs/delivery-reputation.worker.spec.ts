let jobProcessor:
  | ((job: { name: string }) => Promise<void>)
  | null = null;
const close = jest.fn();

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(
    (_queue: string, processor: typeof jobProcessor) => {
      jobProcessor = processor;
      return { on: jest.fn(), close };
    },
  ),
}));

import { DeliveryReputationWorker } from './delivery-reputation.worker';

describe('DeliveryReputationWorker', () => {
  const config = {
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'DELIVERY_REPUTATION_QUEUE_ENABLED') return true;
      if (key === 'NODE_ENV') return 'development';
      return fallback;
    }),
    getOrThrow: jest.fn(() => 'redis://localhost:6379'),
  };
  const queue = {
    schedule: jest.fn(),
    enqueueCatchUp: jest.fn(),
  };
  const projection = {
    processPendingApprovals: jest.fn(),
    reconcileAssignedContributors: jest.fn(),
  };
  const worker = new DeliveryReputationWorker(
    config as never,
    queue as never,
    projection as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    jobProcessor = null;
  });

  it('schedules startup catch-up and runs outbox consumption before reconciliation', async () => {
    const order: string[] = [];
    projection.processPendingApprovals.mockImplementation(async () => {
      order.push('outbox');
    });
    projection.reconcileAssignedContributors.mockImplementation(async () => {
      order.push('reconcile');
    });

    await worker.onApplicationBootstrap();
    await jobProcessor?.({ name: 'project-reputation' });

    expect(queue.schedule).toHaveBeenCalledTimes(1);
    expect(queue.enqueueCatchUp).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['outbox', 'reconcile']);
  });
});
