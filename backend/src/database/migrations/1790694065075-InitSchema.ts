import { MigrationInterface, QueryRunner } from "typeorm";

export class InitSchema1790694065075 implements MigrationInterface {
    name = 'InitSchema1790694065075'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "scrape_runs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "data_source_id" uuid NOT NULL, "status" character varying NOT NULL DEFAULT 'pending', "recordsReceived" integer NOT NULL DEFAULT '0', "recordsCreated" integer NOT NULL DEFAULT '0', "recordsUpdated" integer NOT NULL DEFAULT '0', "recordsSkippedDuplicate" integer NOT NULL DEFAULT '0', "recordsRejected" integer NOT NULL DEFAULT '0', "rejections" jsonb NOT NULL DEFAULT '[]'::jsonb, "errorMessage" text, "startedAt" TIMESTAMP WITH TIME ZONE, "finishedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7c271a723ce0a12f57edc6ae720" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "data_sources" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "type" character varying NOT NULL DEFAULT 'manual', "baseUrl" character varying, "termsUrl" character varying, "enabled" boolean NOT NULL DEFAULT true, "complianceNotes" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_bc118461a56a298ca753d901b88" UNIQUE ("name"), CONSTRAINT "PK_dc70b1c6b641726739857fd938d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "marketplace_fees" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "marketplace_id" uuid NOT NULL, "category" character varying NOT NULL DEFAULT 'default', "feeType" character varying NOT NULL, "value" numeric(10,2) NOT NULL, "source" text NOT NULL, "effectiveDate" date NOT NULL, "collectedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_00d345062f39be55ef7d1aded4f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_300307204f0dd6003d2edbcb4b" ON "marketplace_fees" ("marketplace_id", "category", "feeType", "effectiveDate") `);
        await queryRunner.query(`CREATE TABLE "product_costs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "product_id" uuid NOT NULL, "productCost" numeric(12,2), "shippingCost" numeric(12,2), "packagingCost" numeric(12,2), "marketplaceFeeOverride" numeric(12,2), "paymentFee" numeric(12,2), "advertisingCost" numeric(12,2), "returnAllowance" numeric(12,2), "otherCosts" numeric(12,2), "source" text NOT NULL, "sourceUrl" text, "effectiveDate" date NOT NULL, "collectedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "confidenceScore" numeric(3,2), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_95e8435aca3582e927b2cd9d54c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_48c371baf5c1012508ff656181" ON "product_costs" ("product_id", "effectiveDate") `);
        await queryRunner.query(`CREATE TABLE "product_metrics" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "product_id" uuid NOT NULL, "reviewCount" integer, "averageRating" numeric(3,2), "competitorCount" integer, "sellerCount" integer, "bestSellerRank" integer, "searchTerm" character varying, "source" text NOT NULL, "sourceUrl" text NOT NULL, "collectedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7f59cdc24297db92d4f73dccd7c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_72096a7ab51c7273261f510759" ON "product_metrics" ("product_id", "collectedAt") `);
        await queryRunner.query(`CREATE TABLE "product_pain_points" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "product_id" uuid NOT NULL, "type" character varying NOT NULL, "theme" character varying NOT NULL, "detail" text, "mentionCount" integer, "source" text NOT NULL, "sourceUrl" text NOT NULL, "collectedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c0c69f7bbc53353bd96eb4ae371" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_e2d9abaec970e012017489faff" ON "product_pain_points" ("product_id", "type") `);
        await queryRunner.query(`CREATE TABLE "product_prices" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "product_id" uuid NOT NULL, "sellingPrice" numeric(12,2) NOT NULL, "mrp" numeric(12,2), "discountPercentage" numeric(5,2), "currency" character varying NOT NULL DEFAULT 'INR', "source" text NOT NULL, "sourceUrl" text NOT NULL, "collectedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_31c33ddacf759f7c0e5d327c4bb" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_0a4a5b268dd4cdac05c73973e5" ON "product_prices" ("product_id", "collectedAt") `);
        await queryRunner.query(`CREATE TABLE "product_scores" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "product_id" uuid NOT NULL, "demandScore" numeric(5,2), "profitabilityScore" numeric(5,2), "competitionOpportunityScore" numeric(5,2), "differentiationScore" numeric(5,2), "shippingSimplicityScore" numeric(5,2), "customerPainOpportunityScore" numeric(5,2), "bundleExpansionScore" numeric(5,2), "finalScore" numeric(5,2), "riskScore" numeric(5,2), "riskReasons" jsonb NOT NULL DEFAULT '[]'::jsonb, "classification" character varying, "sellingPrice" numeric(12,2), "estimatedLandedCost" numeric(12,2), "profitPerUnit" numeric(12,2), "profitMarginPercentage" numeric(6,2), "roiPercentage" numeric(8,2), "dataCompleteness" numeric(3,2) NOT NULL, "weightsSnapshot" jsonb NOT NULL, "scoreBreakdown" jsonb NOT NULL, "computedAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "UQ_cc1917cc6ef32a0f02893851310" UNIQUE ("product_id"), CONSTRAINT "REL_cc1917cc6ef32a0f0289385131" UNIQUE ("product_id"), CONSTRAINT "PK_8e86f7b3aa9e21ecd55f0063fd4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "products" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "url" text NOT NULL, "marketplace_id" uuid NOT NULL, "externalId" character varying, "brand" character varying, "category" character varying NOT NULL, "subcategory" character varying, "description" text, "features" jsonb, "variants" jsonb, "sizes" jsonb, "colors" jsonb, "imageUrls" jsonb, "weightKg" numeric(10,3), "dimensions" jsonb, "fragile" boolean, "returnRisk" character varying, "regulatoryComplexity" character varying, "brandIpRisk" boolean, "seasonalDemand" boolean, "establishedBrandDominance" boolean, "bundlePotentialScore" numeric(5,2), "data_source_id" uuid NOT NULL, "sourceUrl" text NOT NULL, "collectedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "confidenceScore" numeric(3,2), "isSampleData" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_product_marketplace_url" UNIQUE ("marketplace_id", "url"), CONSTRAINT "uq_product_marketplace_external_id" UNIQUE ("marketplace_id", "externalId"), CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c3932231d2385ac248d0888d95" ON "products" ("category") `);
        await queryRunner.query(`CREATE TABLE "marketplaces" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "slug" character varying NOT NULL, "name" character varying NOT NULL, "country" character varying NOT NULL DEFAULT 'IN', "currency" character varying NOT NULL DEFAULT 'INR', "websiteUrl" character varying, CONSTRAINT "UQ_379c7d517fd5576d1f7e1b00805" UNIQUE ("slug"), CONSTRAINT "PK_e4d5b8aa6ae255c4ce370792f79" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "scrape_runs" ADD CONSTRAINT "FK_5ae20b34d5d53c028501a0da745" FOREIGN KEY ("data_source_id") REFERENCES "data_sources"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "marketplace_fees" ADD CONSTRAINT "FK_aea1a85c34067109293c9d630df" FOREIGN KEY ("marketplace_id") REFERENCES "marketplaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "product_costs" ADD CONSTRAINT "FK_04587306adc2c09bf52d513def6" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "product_metrics" ADD CONSTRAINT "FK_6ff326dc200a793ba5eb3c6a230" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "product_pain_points" ADD CONSTRAINT "FK_57dd2ef041804e9a33b4e5cfe21" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "product_prices" ADD CONSTRAINT "FK_8218c69c7f5a3706662101fa788" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "product_scores" ADD CONSTRAINT "FK_cc1917cc6ef32a0f02893851310" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "products" ADD CONSTRAINT "FK_e9eb4265c14814fd10a10239c11" FOREIGN KEY ("marketplace_id") REFERENCES "marketplaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "products" ADD CONSTRAINT "FK_b250cc2a1b997140c61462932f9" FOREIGN KEY ("data_source_id") REFERENCES "data_sources"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT "FK_b250cc2a1b997140c61462932f9"`);
        await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT "FK_e9eb4265c14814fd10a10239c11"`);
        await queryRunner.query(`ALTER TABLE "product_scores" DROP CONSTRAINT "FK_cc1917cc6ef32a0f02893851310"`);
        await queryRunner.query(`ALTER TABLE "product_prices" DROP CONSTRAINT "FK_8218c69c7f5a3706662101fa788"`);
        await queryRunner.query(`ALTER TABLE "product_pain_points" DROP CONSTRAINT "FK_57dd2ef041804e9a33b4e5cfe21"`);
        await queryRunner.query(`ALTER TABLE "product_metrics" DROP CONSTRAINT "FK_6ff326dc200a793ba5eb3c6a230"`);
        await queryRunner.query(`ALTER TABLE "product_costs" DROP CONSTRAINT "FK_04587306adc2c09bf52d513def6"`);
        await queryRunner.query(`ALTER TABLE "marketplace_fees" DROP CONSTRAINT "FK_aea1a85c34067109293c9d630df"`);
        await queryRunner.query(`ALTER TABLE "scrape_runs" DROP CONSTRAINT "FK_5ae20b34d5d53c028501a0da745"`);
        await queryRunner.query(`DROP TABLE "marketplaces"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c3932231d2385ac248d0888d95"`);
        await queryRunner.query(`DROP TABLE "products"`);
        await queryRunner.query(`DROP TABLE "product_scores"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0a4a5b268dd4cdac05c73973e5"`);
        await queryRunner.query(`DROP TABLE "product_prices"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e2d9abaec970e012017489faff"`);
        await queryRunner.query(`DROP TABLE "product_pain_points"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_72096a7ab51c7273261f510759"`);
        await queryRunner.query(`DROP TABLE "product_metrics"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_48c371baf5c1012508ff656181"`);
        await queryRunner.query(`DROP TABLE "product_costs"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_300307204f0dd6003d2edbcb4b"`);
        await queryRunner.query(`DROP TABLE "marketplace_fees"`);
        await queryRunner.query(`DROP TABLE "data_sources"`);
        await queryRunner.query(`DROP TABLE "scrape_runs"`);
    }

}
