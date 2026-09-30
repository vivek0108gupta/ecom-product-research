import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { SourceDefinition, SourceRegistryReport, SourceStatus } from './source-registry.types';

/** Shown wherever the system would otherwise present an empty collection result. */
export const NO_SOURCE_MESSAGE = 'NO REAL DATA SOURCE CONFIGURED';

/**
 * Reads config/data-sources.json and reports which sources can actually collect.
 *
 * This is the seam that keeps business logic source-agnostic: adding a permitted API later
 * means adding a config entry and an adapter class. Normalization, profitability, demand,
 * competition and scoring never learn which source the data came from.
 *
 * A source counts as usable only when it is enabled, every credential it needs is present,
 * and an adapter implementation is registered for it. Anything else is reported with the
 * specific reason it is blocked, so "nothing is collecting" is never a silent state.
 */
@Injectable()
export class SourceRegistryService implements OnModuleInit {
  private readonly logger = new Logger(SourceRegistryService.name);
  private definitions: SourceDefinition[] = [];
  private researchedAt = 'unknown';

  /**
   * Adapter class names that exist in this codebase today. A config entry naming anything
   * else is reported as declared-but-not-implemented rather than silently treated as ready.
   */
  private readonly implementedAdapters = new Set<string>(['ManualCsvAdapter']);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.reload();
  }

  reload(): void {
    const path = this.configPath();
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as {
      _researchedAt?: string;
      sources: SourceDefinition[];
    };
    this.definitions = parsed.sources ?? [];
    this.researchedAt = parsed._researchedAt ?? 'unknown';
    this.logger.log(`Loaded ${this.definitions.length} data-source definitions from ${path}`);
  }

  getReport(): SourceRegistryReport {
    const sources = this.definitions.map((definition) => this.assess(definition));
    const automated = sources.filter((source) => source.usable && source.automated);

    return {
      researchedAt: this.researchedAt,
      automatedSourcesConfigured: automated.length,
      state: automated.length === 0 ? 'NO_REAL_DATA_SOURCE_CONFIGURED' : 'READY',
      message:
        automated.length === 0
          ? `${NO_SOURCE_MESSAGE} — no permitted automated source is enabled with valid credentials. ` +
            'Real data can still be supplied through the manual CSV/JSON import pipeline. ' +
            'See config/data-sources.json for the candidate sources and what each one requires.'
          : `${automated.length} automated source(s) configured: ${automated.map((source) => source.label).join(', ')}`,
      sources,
    };
  }

  /** True when at least one automated, permitted source can collect right now. */
  hasUsableAutomatedSource(): boolean {
    return this.getReport().automatedSourcesConfigured > 0;
  }

  getSource(key: string): SourceStatus | null {
    const definition = this.definitions.find((entry) => entry.key === key);
    return definition ? this.assess(definition) : null;
  }

  private assess(definition: SourceDefinition): SourceStatus {
    const missingEnv = definition.requiredEnv.filter((name) => {
      const value = process.env[name];
      return value === undefined || value.trim() === '';
    });

    const adapterImplemented = definition.adapter !== null && this.implementedAdapters.has(definition.adapter);

    let blockedReason: string | null = null;
    if (!definition.enabled) {
      blockedReason = 'disabled in config/data-sources.json';
    } else if (definition.adapter === null) {
      blockedReason = 'no adapter is defined for this source';
    } else if (!adapterImplemented) {
      blockedReason = `adapter '${definition.adapter}' is declared in config but not implemented in this codebase yet`;
    } else if (missingEnv.length > 0) {
      blockedReason = `missing credentials: ${missingEnv.join(', ')}`;
    }

    return { ...definition, missingEnv, adapterImplemented, usable: blockedReason === null, blockedReason };
  }

  private configPath(): string {
    const configured = this.configService.get<string>('configPaths.dataSources');
    return configured ?? resolve(process.cwd(), '../config/data-sources.json');
  }
}
