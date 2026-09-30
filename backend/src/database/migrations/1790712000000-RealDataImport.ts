import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Prepares the schema for real data ingestion:
 *  - renames the PROVISIONAL dataset status to UNVERIFIED (same meaning, requested name)
 *  - adds product_field_observations, the per-field provenance ledger
 */
export class RealDataImport1790712000000 implements MigrationInterface {
  name = 'RealDataImport1790712000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "datasetStatus" DROP DEFAULT`);
    await queryRunner.query(`UPDATE "products" SET "datasetStatus" = 'UNVERIFIED' WHERE "datasetStatus" = 'PROVISIONAL'`);
    await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "datasetStatus" SET DEFAULT 'UNVERIFIED'`);

    await queryRunner.query(`
      CREATE TABLE "product_field_observations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "product_id" uuid NOT NULL,
        "fieldName" character varying NOT NULL,
        "rawValue" text NOT NULL,
        "numericValue" numeric(18,4),
        "sourceName" text NOT NULL,
        "sourceUrl" text NOT NULL,
        "observedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "confidenceScore" numeric(3,2),
        "importRunId" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_field_observations" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_pfo_product_field_observed"
      ON "product_field_observations" ("product_id", "fieldName", "observedAt")
    `);

    await queryRunner.query(`
      ALTER TABLE "product_field_observations"
      ADD CONSTRAINT "FK_pfo_product" FOREIGN KEY ("product_id")
      REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product_field_observations" DROP CONSTRAINT "FK_pfo_product"`);
    await queryRunner.query(`DROP INDEX "IDX_pfo_product_field_observed"`);
    await queryRunner.query(`DROP TABLE "product_field_observations"`);

    await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "datasetStatus" DROP DEFAULT`);
    await queryRunner.query(`UPDATE "products" SET "datasetStatus" = 'PROVISIONAL' WHERE "datasetStatus" = 'UNVERIFIED'`);
    await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "datasetStatus" SET DEFAULT 'PROVISIONAL'`);
  }
}
