import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AccessTokenGuard } from '../../shared/auth/guards/access-token.guard';
import { AssignmentCallCommandDto } from './dto/assignment-call-command.dto';
import { AssignmentCallCapacityService } from './services/assignment-call-capacity.service';
import { AssignmentCallsService } from './services/assignment-calls.service';

@UseGuards(AccessTokenGuard)
@Controller()
export class AssignmentCallsController {
  constructor(
    private readonly calls: AssignmentCallsService,
    private readonly capacity: AssignmentCallCapacityService,
  ) {}

  @Post('assignment-conversations/:conversationId/calls')
  start(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('conversationId', new ParseUUIDPipe({ version: '4' })) conversationId: string,
    @Body() body: AssignmentCallCommandDto,
  ) {
    return this.calls.start({
      actor,
      conversationId,
      idempotencyKey: body.idempotencyKey,
    });
  }

  @Post('assignment-calls/:callId/answer')
  answer(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('callId', new ParseUUIDPipe({ version: '4' })) callId: string,
    @Body() body: AssignmentCallCommandDto,
  ) {
    return this.calls.answer({ actor, callId, idempotencyKey: body.idempotencyKey });
  }

  @Post('assignment-calls/:callId/decline')
  decline(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('callId', new ParseUUIDPipe({ version: '4' })) callId: string,
    @Body() body: AssignmentCallCommandDto,
  ) {
    return this.calls.decline({ actor, callId, idempotencyKey: body.idempotencyKey });
  }

  @Post('assignment-calls/:callId/end')
  end(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('callId', new ParseUUIDPipe({ version: '4' })) callId: string,
    @Body() body: AssignmentCallCommandDto,
  ) {
    return this.calls.end({ actor, callId, idempotencyKey: body.idempotencyKey });
  }

  /**
   * `idempotencyKey` is part of the wire contract for consistency with every
   * other call command, but `AssignmentCallsService.reconnect` does not use
   * it for replay detection -- see that method's doc comment for why.
   */
  @Post('assignment-calls/:callId/reconnect')
  reconnect(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('callId', new ParseUUIDPipe({ version: '4' })) callId: string,
    @Body() _body: AssignmentCallCommandDto,
  ) {
    return this.calls.reconnect({ actor, callId });
  }

  /**
   * Mints, so it is idempotent by nature -- still rate-limited (10/min/user)
   * at the guard layer like every other credential-minting endpoint.
   */
  @Get('assignment-calls/:callId/join-credentials')
  getJoinCredentials(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('callId', new ParseUUIDPipe({ version: '4' })) callId: string,
  ) {
    return this.calls.getJoinCredentials(actor, callId);
  }

  @Get('admin/communication-capacity')
  getCommunicationCapacity(@CurrentUser() actor: AuthenticatedUser) {
    return this.capacity.getCapacityForAdmin(actor);
  }
}
