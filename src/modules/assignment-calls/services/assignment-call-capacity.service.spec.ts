import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { AssignmentCallCapacityService } from './assignment-call-capacity.service';

const DEFAULT_BUDGET = 53_687_091_200;

function config(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = { TURN_MONTHLY_BUDGET_BYTES: DEFAULT_BUDGET, ...overrides };
  return {
    get: jest.fn((key: string, fallback: unknown) => (key in values ? values[key] : fallback)),
  };
}

function admin(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'admin@example.com',
    role: 'admin',
    status: 'active',
    ...overrides,
  };
}

describe('AssignmentCallCapacityService', () => {
  it('fails open (not exhausted) when no poll history exists yet', async () => {
    const database = {
      communicationCapacityUsage: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new AssignmentCallCapacityService(database as never, config() as never);

    await expect(service.isExhausted()).resolves.toBe(false);
    const capacity = await service.getCapacityForAdmin(admin());
    expect(capacity).toMatchObject({
      exhausted: false,
      warningAt80: false,
      turnBytesUsed: 0,
      turnBytesBudget: DEFAULT_BUDGET,
    });
  });

  it('reports warningAt80 true at exactly 80% used', async () => {
    const budget = 1_000;
    const database = {
      communicationCapacityUsage: {
        findFirst: jest.fn().mockResolvedValue({
          turn_bytes_used: BigInt(800),
          turn_bytes_budget: BigInt(budget),
        }),
      },
    };
    const service = new AssignmentCallCapacityService(database as never, config() as never);

    const capacity = await service.getCapacityForAdmin(admin());

    expect(capacity.warningAt80).toBe(true);
    expect(capacity.exhausted).toBe(false);
  });

  it('does not warn just under the 80% threshold', async () => {
    const budget = 1_000;
    const database = {
      communicationCapacityUsage: {
        findFirst: jest.fn().mockResolvedValue({
          turn_bytes_used: BigInt(799),
          turn_bytes_budget: BigInt(budget),
        }),
      },
    };
    const service = new AssignmentCallCapacityService(database as never, config() as never);

    const capacity = await service.getCapacityForAdmin(admin());

    expect(capacity.warningAt80).toBe(false);
  });

  it('reports exhausted true at exactly 100% used', async () => {
    const budget = 1_000;
    const database = {
      communicationCapacityUsage: {
        findFirst: jest.fn().mockResolvedValue({
          turn_bytes_used: BigInt(1_000),
          turn_bytes_budget: BigInt(budget),
        }),
      },
    };
    const service = new AssignmentCallCapacityService(database as never, config() as never);

    await expect(service.isExhausted()).resolves.toBe(true);
  });

  it('reports exhausted true above 100% used', async () => {
    const budget = 1_000;
    const database = {
      communicationCapacityUsage: {
        findFirst: jest.fn().mockResolvedValue({
          turn_bytes_used: BigInt(1_500),
          turn_bytes_budget: BigInt(budget),
        }),
      },
    };
    const service = new AssignmentCallCapacityService(database as never, config() as never);

    await expect(service.isExhausted()).resolves.toBe(true);
  });

  it('rejects a non-admin actor with ADMIN_ACCESS_REQUIRED', async () => {
    const database = {
      communicationCapacityUsage: { findFirst: jest.fn() },
    };
    const service = new AssignmentCallCapacityService(database as never, config() as never);

    await expect(
      service.getCapacityForAdmin(admin({ role: 'owner' })),
    ).rejects.toMatchObject({ code: 'ADMIN_ACCESS_REQUIRED', statusCode: 403 });
    expect(database.communicationCapacityUsage.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a suspended admin actor with ADMIN_ACCESS_REQUIRED', async () => {
    const database = {
      communicationCapacityUsage: { findFirst: jest.fn() },
    };
    const service = new AssignmentCallCapacityService(database as never, config() as never);

    await expect(
      service.getCapacityForAdmin(admin({ status: 'suspended' })),
    ).rejects.toMatchObject({ code: 'ADMIN_ACCESS_REQUIRED', statusCode: 403 });
    expect(database.communicationCapacityUsage.findFirst).not.toHaveBeenCalled();
  });

  it('records zero usage from pollAndRecordUsage, the stand-in for the real provider call', async () => {
    const database = {
      communicationCapacityUsage: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new AssignmentCallCapacityService(database as never, config() as never);

    await service.pollAndRecordUsage();

    expect(database.communicationCapacityUsage.create).toHaveBeenCalledWith({
      data: { turn_bytes_used: BigInt(0), turn_bytes_budget: BigInt(DEFAULT_BUDGET) },
    });
  });
});
