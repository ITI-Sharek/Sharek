import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class DatabaseService extends PrismaClient implements OnModuleInit {
  constructor(configService: ConfigService) {
    super({
      datasources: {
        db: {
          url: configService.getOrThrow<string>('DATABASE_URL'),
        },
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async enableShutdownHooks(app: INestApplication): Promise<void> {
    process.on('beforeExit', () => {
      void app.close();
    });
  }
}
