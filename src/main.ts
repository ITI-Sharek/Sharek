import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { createCorsOptions } from './shared/config/cors.config';
import { HttpExceptionFilter } from './shared/errors/http-exception.filter';
import { createApplicationValidationPipe } from './shared/validation/application-validation.pipe';
import { isRealtimeNotificationsEnabled } from './shared/realtime/realtime.config';
import { RedisIoAdapter } from './shared/realtime/redis-io.adapter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);

  app.useGlobalPipes(createApplicationValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());

  app.enableCors(
    createCorsOptions(
      config.get<string>('NODE_ENV', 'development'),
      config.get<string>(
        'CORS_ORIGINS',
        'http://localhost:3000,http://localhost:3001',
      ),
    ),
  );

  if (isRealtimeNotificationsEnabled(config)) {
    const realtimeAdapter = new RedisIoAdapter(app, config);
    // Redis is coordination infrastructure, not an HTTP availability gate.
    // The adapter falls back to local Socket.IO delivery when Redis is down.
    await realtimeAdapter.connectToRedis();
    app.useWebSocketAdapter(realtimeAdapter);
  }

  const port = config.get<number>('PORT', 4000);
  await app.listen(port);
}

void bootstrap();
