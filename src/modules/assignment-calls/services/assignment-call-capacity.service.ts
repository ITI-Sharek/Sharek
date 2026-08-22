import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { DatabaseService } from '../../../shared/database/database.service';
import { ForbiddenApplicationError } from '../../../shared/errors/application.error';
import { CommunicationCapacityDto } from '../dto/assignment-call-response.dto';

const WARNING_THRESHOLD = 0.8;

/**
 * The TURN bandwidth budget guard (ADR 0016). Unlike LiveKit's
 * participant-minute cap, whether a call will relay through TURN at all is
 * unknown until ICE negotiation happens, so this can only ever measure usage
 * *after the fact* -- there is no synchronous "would this call exceed the
 * cap" check to perform at start time. `pollAndRecordUsage` is meant to run
 * once daily from the provider's own usage API and snapshot the result;
 * `isExhausted`/`getCapacity` read the latest snapshot.
 *
 * No production TURN provider credentials exist yet in this environment, so
 * `pollAndRecordUsage` records zero usage for now -- the seam is real (a
 * daily BullMQ job already calls it), only the provider HTTP call inside it
 * is a stand-in. Swapping in a real Cloudflare/Twilio usage API call is a
 * one-method change, not a redesign.
 */
@Injectable()
export class AssignmentCallCapacityService {
  private readonly logger = new Logger(AssignmentCallCapacityService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async isExhausted(): Promise<boolean> {
    const capacity = await this.readCapacity();
    return capacity.exhausted;
  }

  /** This data is never shown as a user plan, quota, or reputation input -- admin-only (COMMUNICATION.md, call provider boundary). */
  async getCapacityForAdmin(actor: AuthenticatedUser): Promise<CommunicationCapacityDto> {
    if (actor.role !== 'admin' || actor.status !== 'active') {
      throw new ForbiddenApplicationError(
        'Active admin access is required',
        'ADMIN_ACCESS_REQUIRED',
      );
    }
    return this.readCapacity();
  }

  private async readCapacity(): Promise<CommunicationCapacityDto> {
    const budget = this.config.get<number>('TURN_MONTHLY_BUDGET_BYTES', 53_687_091_200);
    const latest = await this.database.communicationCapacityUsage.findFirst({
      orderBy: { measured_at: 'desc' },
      select: { turn_bytes_used: true, turn_bytes_budget: true },
    });
    // No poll has ever run: fail open. A budget guard that blocks every call
    // before its first real measurement would make the feature unusable on
    // a fresh deployment.
    const used = latest ? Number(latest.turn_bytes_used) : 0;
    const effectiveBudget = latest ? Number(latest.turn_bytes_budget) : budget;
    return {
      turnBytesUsed: used,
      turnBytesBudget: effectiveBudget,
      warningAt80: used >= effectiveBudget * WARNING_THRESHOLD,
      exhausted: latest ? used >= effectiveBudget : false,
    };
  }

  /** Intended to run once daily from a BullMQ repeat job. */
  async pollAndRecordUsage(): Promise<void> {
    const budget = this.config.get<number>('TURN_MONTHLY_BUDGET_BYTES', 53_687_091_200);
    // Stand-in for the real provider usage-API call (Cloudflare Realtime
    // TURN / Twilio NTS). See the class doc comment.
    const turnBytesUsed = 0;
    await this.database.communicationCapacityUsage.create({
      data: {
        turn_bytes_used: BigInt(turnBytesUsed),
        turn_bytes_budget: BigInt(budget),
      },
    });
    if (turnBytesUsed >= budget * WARNING_THRESHOLD) {
      this.logger.warn(
        `TURN bandwidth usage at ${Math.round((turnBytesUsed / budget) * 100)}% of the monthly budget`,
      );
    }
  }
}
