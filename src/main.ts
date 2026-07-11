import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './shared/errors/http-exception.filter';

function parseCorsOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const corsOrigins = parseCorsOrigins(
    config.get<string>('CORS_ORIGINS', 'http://localhost:3000,http://localhost:3001'),
  );

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
}

void bootstrap();
