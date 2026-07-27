import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DatabaseService } from '../../../shared/database/database.service';
import { GitHubTokenEncryptionService } from '../security/github-token-encryption.service';

const CUTOVER_ID = 'github-evidence';
const EVIDENCE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class GitHubEvidenceCutoverService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly tokenEncryption: GitHubTokenEncryptionService,
  ) {}

  async execute(executedBy: string, now = new Date()) {
    const state = await this.database.$transaction((transaction) =>
      transaction.gitHubEvidenceCutover.upsert({
        where: { id: CUTOVER_ID },
        create: {
          id: CUTOVER_ID,
          cutover_at: now,
          executed_by: executedBy,
          legacy_evidence_cleanup_due_at: new Date(
            now.getTime() + EVIDENCE_RETENTION_MS,
          ),
        },
        update: {},
      }),
    );
    if (state.legacy_credentials_purged_at) return this.result(state);

    const accounts = await this.database.gitHubAccount.findMany({
      where: { access_token: { not: null } },
      select: { id: true, access_token: true },
    });
    let succeeded = 0;
    let failed = 0;
    for (const account of accounts) {
      try {
        if (!account.access_token) throw new Error('missing credential');
        await this.revokeProviderCredential(
          this.tokenEncryption.decrypt(account.access_token),
        );
        succeeded += 1;
      } catch {
        failed += 1;
      } finally {
        await this.database.gitHubAccount.update({
          where: { id: account.id },
          data: { access_token: null, refresh_token: null, token_expires_at: null },
        });
      }
    }

    const completed = await this.database.gitHubEvidenceCutover.update({
      where: { id: CUTOVER_ID },
      data: {
        legacy_credentials_purged_at: new Date(),
        provider_revocation_succeeded_count: succeeded,
        provider_revocation_failed_count: failed,
        last_error_code:
          failed > 0 ? 'GITHUB_LEGACY_PROVIDER_REVOCATION_INCOMPLETE' : null,
      },
    });
    return this.result(completed);
  }

  private async revokeProviderCredential(accessToken: string): Promise<void> {
    const clientId = this.config.get<string>('GITHUB_CLIENT_ID')?.trim();
    const clientSecret = this.config.get<string>('GITHUB_CLIENT_SECRET')?.trim();
    if (!clientId || !clientSecret) throw new Error('legacy app not configured');
    const response = await fetch(
      `https://api.github.com/applications/${encodeURIComponent(clientId)}/token`,
      {
        method: 'DELETE',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ access_token: accessToken }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok && response.status !== 404) throw new Error('revocation failed');
  }

  private result(state: {
    cutover_at: Date | null;
    legacy_credentials_purged_at: Date | null;
    provider_revocation_succeeded_count: number;
    provider_revocation_failed_count: number;
    legacy_evidence_cleanup_due_at: Date | null;
  }) {
    return {
      cutoverAt: state.cutover_at,
      credentialsPurgedAt: state.legacy_credentials_purged_at,
      providerRevocationSucceededCount: state.provider_revocation_succeeded_count,
      providerRevocationFailedCount: state.provider_revocation_failed_count,
      manualRevocationRequiredCount: state.provider_revocation_failed_count,
      evidenceCleanupDueAt: state.legacy_evidence_cleanup_due_at,
    };
  }
}
