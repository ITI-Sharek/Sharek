import { SubscriptionCatalogController } from './subscription-catalog.controller';

describe('SubscriptionCatalogController', () => {
  it('returns the backend-owned plan catalog', () => {
    const plans = [{ planType: 'gold', amountCents: 29_900 }];
    const subscriptions = { getPlanCatalog: jest.fn().mockReturnValue(plans) };
    const controller = new SubscriptionCatalogController(subscriptions as never);

    expect(controller.getPlans()).toBe(plans);
    expect(subscriptions.getPlanCatalog).toHaveBeenCalledTimes(1);
  });
});
