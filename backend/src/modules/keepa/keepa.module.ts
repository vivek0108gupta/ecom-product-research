import { Module } from '@nestjs/common';
import { RealDataImportModule } from '../real-data-import/real-data-import.module';
import { KeepaClient } from './keepa.client';
import { KeepaPilotService } from './keepa-pilot.service';
import { KeepaProductSourceAdapter } from './keepa-product-source.adapter';

@Module({
  imports: [RealDataImportModule],
  providers: [
    { provide: KeepaClient, useFactory: () => new KeepaClient() },
    KeepaProductSourceAdapter,
    KeepaPilotService,
  ],
  exports: [KeepaClient, KeepaProductSourceAdapter, KeepaPilotService],
})
export class KeepaModule {}
