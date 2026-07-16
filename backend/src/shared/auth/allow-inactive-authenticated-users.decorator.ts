import { SetMetadata } from '@nestjs/common';

export const ALLOW_INACTIVE_AUTHENTICATED_USERS_KEY =
  'allowInactiveAuthenticatedUsers';

export const AllowInactiveAuthenticatedUsers = () =>
  SetMetadata(ALLOW_INACTIVE_AUTHENTICATED_USERS_KEY, true);
