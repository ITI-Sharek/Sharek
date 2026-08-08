import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { AccessTokenGuard } from '../../shared/auth/guards/access-token.guard';
import { ListNotificationsQuery } from './dto/list-notifications.query';
import { NotificationsService } from './notifications.service';

@UseGuards(AccessTokenGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListNotificationsQuery,
  ) {
    return this.notifications.listForUser(user.id, query.limit);
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Patch(':notificationId/read')
  @HttpCode(HttpStatus.OK)
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('notificationId', new ParseUUIDPipe({ version: '4' }))
    notificationId: string,
  ) {
    return this.notifications.markRead(user.id, notificationId);
  }
}
