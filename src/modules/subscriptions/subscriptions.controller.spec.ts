import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { SubscriptionsController } from './subscriptions.controller';

describe('SubscriptionsController', () => {
  it('returns the current role-context plan status', async () => {
    const status = { plan: 'silver', roleContext: 'owner' };
    const subscriptions = {
      getPlanStatus: jest.fn().mockResolvedValue(status),
    };
    const controller = new SubscriptionsController(subscriptions as never);
    const actor: AuthenticatedUser = {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'owner@example.com',
      role: 'owner',
      status: 'active',
    };

    await expect(controller.getCurrentPlan(actor)).resolves.toBe(status);
    expect(subscriptions.getPlanStatus).toHaveBeenCalledWith(actor);
  });
});
