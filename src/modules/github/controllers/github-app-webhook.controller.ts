import { Controller, Headers, Post, RawBodyRequest, Req } from '@nestjs/common';
import { Request } from 'express';

import { ApplicationError } from '../../../shared/errors/application.error';
import { GitHubAppCredentialsService } from '../security/github-app-credentials.service';
import { GitHubAppWebhookService } from '../services/github-app-webhook.service';

@Controller('webhooks/github')
export class GitHubAppWebhookController {
  constructor(
    private readonly credentials: GitHubAppCredentialsService,
    private readonly webhookService: GitHubAppWebhookService,
  ) {}

  @Post('app')
  receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Headers('x-github-delivery') deliveryId: string | undefined,
    @Headers('x-github-event') event: string | undefined,
  ) {
    if (
      !request.rawBody ||
      !this.credentials.verifyWebhookSignature(request.rawBody, signature)
    ) {
      throw new ApplicationError(
        'GitHub App webhook signature is invalid',
        'GITHUB_APP_WEBHOOK_SIGNATURE_INVALID',
        401,
      );
    }
    if (!deliveryId || !event) {
      throw new ApplicationError(
        'GitHub App webhook headers are invalid',
        'GITHUB_APP_WEBHOOK_HEADERS_INVALID',
        400,
      );
    }
    return this.webhookService.process(
      deliveryId,
      event,
      request.body as Record<string, unknown>,
    );
  }
}
