import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { createCorsOptions } from './shared/config/cors.config';
import { HttpExceptionFilter } from './shared/errors/http-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
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

  const port = config.get<number>('PORT', 4000);
  await app.listen(port);
}

void bootstrap();
