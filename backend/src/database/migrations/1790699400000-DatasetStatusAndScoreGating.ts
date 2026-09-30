import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds dataset_status, score gating and per-value provenance.
 *
 * Hand-written rather than generated because the generated version dropped and re-added
 * the `source` columns (losing provenance on existing rows) and added NOT NULL columns to
 * populated tables. Here each new required column is added nullable, backfilled from the
 * data already present, and only then constrained — so a database holding real researched
 * data migrates without loss.
 */
export class DatasetStatusAndScoreGating1790699400000 implements MigrationInterface {
  name = 'DatasetStatusAndScoreGating1790699400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- marketplace_fees: value -> feeValue (preserves data) ---
    await queryRunner.query(`ALTER TABLE "marketplace_fees" RENAME COLUMN "value" TO "feeValue"`);

    // --- per-value provenance: source -> sourceName (preserves data) ---
    for (const table of ['product_prices', 'product_metrics', 'product_pain_points', 'product_costs']) {
      await queryRunner.query(`ALTER TABLE "${table}" RENAME COLUMN "source" TO "sourceName"`);
    }

    // --- per-value confidence ---
    for (const table of ['product_prices', 'product_metrics', 'product_pain_points']) {
      await queryRunner.query(`ALTER TABLE "${table}" ADD "confidenceScore" numeric(3,2)`);
    }

    // --- products: normalizedName, sourceName, datasetStatus ---
    await queryRunner.query(`ALTER TABLE "products" ADD "normalizedName" character varying`);
    await queryRunner.query(`ALTER TABLE "products" ADD "sourceName" character varying`);
    await queryRunner.query(`ALTER TABLE "products" ADD "datasetStatus" character varying`);

    // Backfill from what already exists: the same normalization the adapter applies
    // (lowercase, strip non-alphanumerics, collapse whitespace).
    await queryRunner.query(`
      UPDATE "products"
      SET "normalizedName" = btrim(regexp_replace(regexp_replace(lower("name"), '[^a-z0-9\\s]', ' ', 'g'), '\\s+', ' ', 'g'))
      WHERE "normalizedName" IS NULL
    `);
    await queryRunner.query(`
      UPDATE "products" p
      SET "sourceName" = COALESCE((SELECT d."name" FROM "data_sources" d WHERE d."id" = p."data_source_id"), 'unknown')
      WHERE p."sourceName" IS NULL
    `);
    // Existing isSampleData rows become SAMPLE; everything else is PROVISIONAL, never VERIFIED.
    await queryRunner.query(`
      UPDATE "products"
      SET "datasetStatus" = CASE WHEN "isSampleData" = true THEN 'SAMPLE' ELSE 'PROVISIONAL' END
      WHERE "datasetStatus" IS NULL
    `);

    await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "normalizedName" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "sourceName" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "datasetStatus" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "datasetStatus" SET DEFAULT 'PROVISIONAL'`);

    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "isSampleData"`);

    await queryRunner.query(`CREATE INDEX "IDX_products_datasetStatus" ON "products" ("datasetStatus")`);
    await queryRunner.query(`CREATE INDEX "IDX_products_marketplace_normalizedName" ON "products" ("marketplace_id", "normalizedName")`);

    // --- product_scores: score gating ---
    await queryRunner.query(`ALTER TABLE "product_scores" ADD "scoreStatus" character varying NOT NULL DEFAULT 'INCOMPLETE'`);
    await queryRunner.query(`ALTER TABLE "product_scores" ADD "missingCriticalFields" jsonb NOT NULL DEFAULT '[]'::jsonb`);
    // Existing scores predate the critical-field check; mark them INCOMPLETE and clear the
    // final score so nothing carries a headline number that was never gated.
    await queryRunner.query(`UPDATE "product_scores" SET "scoreStatus" = 'INCOMPLETE', "finalScore" = NULL, "classification" = NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product_scores" DROP COLUMN "missingCriticalFields"`);
    await queryRunner.query(`ALTER TABLE "product_scores" DROP COLUMN "scoreStatus"`);

    await queryRunner.query(`DROP INDEX "IDX_products_marketplace_normalizedName"`);
    await queryRunner.query(`DROP INDEX "IDX_products_datasetStatus"`);

    await queryRunner.query(`ALTER TABLE "products" ADD "isSampleData" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`UPDATE "products" SET "isSampleData" = ("datasetStatus" = 'SAMPLE')`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "datasetStatus"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "sourceName"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "normalizedName"`);

    for (const table of ['product_prices', 'product_metrics', 'product_pain_points']) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "confidenceScore"`);
    }
    for (const table of ['product_prices', 'product_metrics', 'product_pain_points', 'product_costs']) {
      await queryRunner.query(`ALTER TABLE "${table}" RENAME COLUMN "sourceName" TO "source"`);
    }

    await queryRunner.query(`ALTER TABLE "marketplace_fees" RENAME COLUMN "feeValue" TO "value"`);
  }
}
