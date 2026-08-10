import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AccessTokenGuard } from '../../shared/auth/guards/access-token.guard';
import {
  AssignmentConversationQueryDto,
  AssignmentMessageQueryDto,
} from './dto/assignment-conversation-query.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { AssignmentConversationsService } from './assignment-conversations.service';

@UseGuards(AccessTokenGuard)
@Controller()
export class AssignmentConversationsController {
  constructor(private readonly conversations: AssignmentConversationsService) {}

  @Get('assignment-conversations')
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: AssignmentConversationQueryDto,
  ) {
    return this.conversations.listForActor(actor.id, query);
  }

  @Get('assignment-conversations/:conversationId')
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('conversationId', new ParseUUIDPipe({ version: '4' }))
    conversationId: string,
  ) {
    return this.conversations.getForActor(actor.id, conversationId);
  }

  @Get('assignment-conversations/:conversationId/messages')
  listMessages(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('conversationId', new ParseUUIDPipe({ version: '4' }))
    conversationId: string,
    @Query() query: AssignmentMessageQueryDto,
  ) {
    return this.conversations.listMessages(actor.id, conversationId, query);
  }

  @Post('assignment-conversations/:conversationId/messages')
  sendMessage(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('conversationId', new ParseUUIDPipe({ version: '4' }))
    conversationId: string,
    @Body() body: CreateMessageDto,
  ) {
    return this.conversations.sendMessage({
      actor,
      conversationId,
      body: body.body,
      idempotencyKey: body.idempotencyKey,
      replyToMessageId: body.replyToMessageId,
    });
  }
}
