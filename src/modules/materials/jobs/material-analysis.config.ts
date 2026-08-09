import { ConfigService } from '@nestjs/config';

export function isMaterialAnalysisQueueEnabled(config: ConfigService): boolean {
  return config.get<boolean>(
    'MATERIAL_ANALYSIS_QUEUE_ENABLED',
    config.get<string>('NODE_ENV', 'development') !== 'test',
  );
}
