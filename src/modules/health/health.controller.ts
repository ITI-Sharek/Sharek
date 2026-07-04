import { Controller, Get } from '@nestjs/common';

import { HealthResponse } from './health.response';

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
    };
  }
}

