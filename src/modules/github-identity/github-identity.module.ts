import { Module } from '@nestjs/common';

import { GitHubIdentityLookupService } from './github-identity-lookup.service';

/**
 * Leaf read model for the GitHub identity linked to a user. Both `identity`
 * and `github` import it so neither needs the other for this read, which
 * keeps the module graph acyclic: `identity` -> `github` -> `github-identity`.
 */
@Module({
  providers: [GitHubIdentityLookupService],
  exports: [GitHubIdentityLookupService],
})
export class GitHubIdentityModule {}
