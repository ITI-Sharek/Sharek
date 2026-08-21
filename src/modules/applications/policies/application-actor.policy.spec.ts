import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { ForbiddenApplicationError } from '../../../shared/errors/application.error';
import {
  assertActiveApplicationActor,
  assertActiveContributor,
  assertActiveOwner,
} from './application-actor.policy';

function actor(
  role: AuthenticatedUser['role'],
  status: AuthenticatedUser['status'] = 'active',
): AuthenticatedUser {
  return { id: 'user-1', role, status } as unknown as AuthenticatedUser;
}

describe('application-actor.policy', () => {
  it('admits an active contributor and refuses every other actor', () => {
    expect(() =>
      assertActiveContributor(actor('contributor', 'active')),
    ).not.toThrow();

    for (const forbidden of [
      actor('owner'),
      actor('admin'),
      actor('contributor', 'suspended'),
      actor('contributor', 'deactivated'),
    ]) {
      try {
        assertActiveContributor(forbidden);
        throw new Error('expected assertActiveContributor to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenApplicationError);
        expect((error as ForbiddenApplicationError).code).toBe(
          'APPLICATION_NOT_AUTHORIZED',
        );
        expect((error as ForbiddenApplicationError).statusCode).toBe(403);
      }
    }
  });

  it('admits an active owner and refuses every other actor', () => {
    expect(() => assertActiveOwner(actor('owner', 'active'))).not.toThrow();

    for (const forbidden of [
      actor('contributor'),
      actor('admin'),
      actor('owner', 'suspended'),
      actor('owner', 'deactivated'),
    ]) {
      try {
        assertActiveOwner(forbidden);
        throw new Error('expected assertActiveOwner to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenApplicationError);
        expect((error as ForbiddenApplicationError).code).toBe(
          'APPLICATION_NOT_AUTHORIZED',
        );
      }
    }
  });

  it('admits active owners and contributors, refuses everyone else', () => {
    expect(() => assertActiveApplicationActor(actor('owner'))).not.toThrow();
    expect(() =>
      assertActiveApplicationActor(actor('contributor')),
    ).not.toThrow();

    for (const forbidden of [
      actor('admin'),
      actor('owner', 'suspended'),
      actor('contributor', 'deactivated'),
    ]) {
      expect(() => assertActiveApplicationActor(forbidden)).toThrow(
        ForbiddenApplicationError,
      );
    }
  });
});
