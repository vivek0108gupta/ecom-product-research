import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the verification gate and retroactively applies it.
 *
 * Any existing VERIFIED row whose product URL or source URL points at a reserved/example
 * domain, or whose source name does not attribute the record to a real origin, is
 * downgraded to PROVISIONAL with the reason recorded. Nothing is deleted: a downgraded
 * record is still useful research, it just no longer claims to have been verified.
 */
export class VerificationGate1790706000000 implements MigrationInterface {
  name = 'VerificationGate1790706000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" ADD "verificationNotes" jsonb`);

    // Mirrors isPlaceholderUrl()/isNonAttributableSourceName() for the rows already stored.
    // Kept deliberately broad: it is far better to strip a defensible VERIFIED badge than
    // to leave an indefensible one in place.
    const placeholderHost = `(
      "url" ~* '://([a-z0-9-]+\\.)*(example|test|invalid|localhost|demo|sample|placeholder|dummy|fake|mock|sandbox|staging|acme)([.-]|/)'
      OR "url" ~* '\\.(test|invalid|localhost|example|local|internal)(/|$|:)'
      OR "url" ~* '/(demo|sample|placeholder|dummy|fake|mock|example)/'
      OR "sourceUrl" ~* '://([a-z0-9-]+\\.)*(example|test|invalid|localhost|demo|sample|placeholder|dummy|fake|mock|sandbox|staging|acme)([.-]|/)'
      OR "sourceUrl" ~* '\\.(test|invalid|localhost|example|local|internal)(/|$|:)'
      OR "sourceUrl" ~* '/(demo|sample|placeholder|dummy|fake|mock|example)/'
    )`;

    const nonAttributableSource = `lower("sourceName") IN (
      'seed_demo_data','manual_csv','manual entry','demo assumption','unknown','n/a','na','none','test','demo','sample','placeholder','example','tbd'
    )`;

    await queryRunner.query(`
      UPDATE "products"
      SET "datasetStatus" = 'PROVISIONAL',
          "verificationNotes" = to_jsonb(ARRAY[
            'Downgraded by the VerificationGate migration: the VERIFIED claim could not be supported by a real, traceable source.'
          ])
      WHERE "datasetStatus" = 'VERIFIED'
        AND (${placeholderHost} OR ${nonAttributableSource})
    `);

    // Requirement 5/6: seed/demo data can never hold VERIFIED, whatever it was imported as.
    await queryRunner.query(`
      UPDATE "products"
      SET "datasetStatus" = 'SAMPLE',
          "verificationNotes" = to_jsonb(ARRAY['Seed/demo data can never hold VERIFIED status.'])
      WHERE "datasetStatus" = 'VERIFIED' AND lower("sourceName") = 'seed_demo_data'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // The original VERIFIED claims are not restored: they were refused for cause, and
    // re-asserting them on rollback would reintroduce exactly the unsupported claim.
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "verificationNotes"`);
  }
}
