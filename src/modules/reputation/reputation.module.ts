import { Module } from '@nestjs/common';

import { ReputationSummaryReaderService } from './application/use-cases/reputation-summary-reader.service';

@Module({
  providers: [ReputationSummaryReaderService],
  exports: [ReputationSummaryReaderService],
})
export class ReputationModule {}
