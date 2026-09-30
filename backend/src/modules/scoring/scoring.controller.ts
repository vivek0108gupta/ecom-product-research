import { Controller, Get, Post } from '@nestjs/common';
import { ConfigFilesService } from '../../config/config-files.service';
import { ScoringService } from './scoring.service';

@Controller('scoring')
export class ScoringController {
  constructor(
    private readonly scoring: ScoringService,
    private readonly configFiles: ConfigFilesService,
  ) {}

  /** The exact weights and thresholds currently driving every score, for display in the UI. */
  @Get('config')
  getConfig() {
    return this.configFiles.getScoringConfig();
  }

  @Post('config/reload')
  reloadConfig() {
    this.configFiles.reload();
    return { reloaded: true, weights: this.configFiles.getScoringConfig().finalScoreWeights };
  }

  @Post('rescore')
  rescore() {
    return this.scoring.rescoreAll();
  }
}
