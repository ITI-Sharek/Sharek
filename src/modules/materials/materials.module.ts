import { Module } from '@nestjs/common';

import { MaterialStorage } from './storage/material-storage';
import { LocalMaterialStorage } from './storage/local-material-storage';

/**
 * Safe Materials.
 *
 * Upload is storage consent, not AI-processing consent: nothing in this module
 * extracts, embeds, retrieves, or calls a provider.
 */
@Module({
  providers: [{ provide: MaterialStorage, useClass: LocalMaterialStorage }],
  exports: [MaterialStorage],
})
export class MaterialsModule {}
