import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AccessTokenGuard } from '../../shared/auth/guards/access-token.guard';
import { NotificationInboxService } from './notification-inbox.service';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { SetNotificationReadStateDto } from './dto/notification-command.dto';
import { UpdateNotificationPreferencesDto } from './dto/notification-preferences.dto';

@UseGuards(AccessTokenGuard)
@Controller()
export class NotificationsController {
  constructor(
    private readonly inbox: NotificationInboxService,
    private readonly preferences: NotificationPreferencesService,
  ) {}

  @Get('notifications')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: NotificationQueryDto,
  ) {
    return this.inbox.list(user.id, query);
  }

  @Get('notifications/unread-count')
  unreadCount(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: NotificationQueryDto,
  ) {
    return this.inbox.unreadCount(user.id, query);
  }

  @Patch('notifications/:notificationId/read-state')
  setReadState(
    @CurrentUser() user: AuthenticatedUser,
    @Param('notificationId', new ParseUUIDPipe({ version: '4' }))
    notificationId: string,
    @Body() body: SetNotificationReadStateDto,
  ) {
    return this.inbox.setReadState(user.id, notificationId, body.state);
  }

  @Post('notifications/mark-all-read')
  @HttpCode(200)
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.inbox.markAllRead(user.id);
  }

  @Get('me/notification-preferences')
  getPreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.preferences.get(user.id);
  }

  @Patch('me/notification-preferences')
  updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpdateNotificationPreferencesDto,
  ) {
    return this.preferences.update(user.id, body);
  }
}
