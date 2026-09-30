import { DatasetStatus, ScoreStatus } from '../../common/interfaces/enums';
import { disclaimerFor, validationStepFor } from './analytics.service';

/**
 * Requirement 4 is a product-safety rule, not a cosmetic one: SAMPLE rows must never be
 * described as validated, profitable, best or recommended. These tests assert the wording
 * itself, so the rule cannot be quietly regressed by a copy edit.
 */
const FORBIDDEN_FOR_SAMPLE = /\b(validated|profitable|best|recommended)\b/i;

describe('disclaimerFor', () => {
  it('marks SAMPLE data as demo and denies it is a real listing', () => {
    const text = disclaimerFor(DatasetStatus.SAMPLE, ScoreStatus.COMPLETE);

    expect(text).toContain('DEMO DATA');
    expect(text).toContain('no real listing');
  });

  it('never describes SAMPLE data as validated, profitable, best or recommended', () => {
    for (const scoreStatus of [ScoreStatus.COMPLETE, ScoreStatus.INCOMPLETE, null]) {
      const text = disclaimerFor(DatasetStatus.SAMPLE, scoreStatus);
      const affirmative = text.replace(/not a validated, profitable or recommended product/i, '');

      expect(affirmative).not.toMatch(FORBIDDEN_FOR_SAMPLE);
    }
  });

  it('takes precedence over score status: SAMPLE is flagged as demo even when COMPLETE', () => {
    expect(disclaimerFor(DatasetStatus.SAMPLE, ScoreStatus.COMPLETE)).toContain('DEMO DATA');
  });

  it('explains that an INCOMPLETE product has no Final Score', () => {
    const text = disclaimerFor(DatasetStatus.UNVERIFIED, ScoreStatus.INCOMPLETE);

    expect(text).toContain('INCOMPLETE');
    expect(text).toContain('no Final Score');
    expect(text).toContain('must not be read as a recommendation');
  });

  it('tells the reader an UNVERIFIED row still needs confirming', () => {
    const text = disclaimerFor(DatasetStatus.UNVERIFIED, ScoreStatus.COMPLETE);

    expect(text).toContain('UNVERIFIED');
    expect(text).toContain('Confirm the listing');
  });

  it('still refuses to promise profit on VERIFIED data', () => {
    const text = disclaimerFor(DatasetStatus.VERIFIED, ScoreStatus.COMPLETE);

    expect(text).toContain('VERIFIED');
    expect(text).toContain('not a prediction of profit');
  });

  it('always returns a non-empty caveat', () => {
    for (const datasetStatus of Object.values(DatasetStatus)) {
      for (const scoreStatus of [ScoreStatus.COMPLETE, ScoreStatus.INCOMPLETE, null]) {
        expect(disclaimerFor(datasetStatus, scoreStatus).length).toBeGreaterThan(20);
      }
    }
  });
});

describe('validationStepFor', () => {
  it('tells the reader to do nothing with demo data', () => {
    const text = validationStepFor(DatasetStatus.SAMPLE);

    expect(text).toContain('No action');
    expect(text).toContain('demo data');
    expect(text).not.toMatch(/order|units/i);
  });

  it('gives a real validation step for researched data', () => {
    for (const status of [DatasetStatus.UNVERIFIED, DatasetStatus.VERIFIED]) {
      const text = validationStepFor(status);

      expect(text).toContain('20-30 units');
      expect(text).toContain('not a prediction of profit');
    }
  });
});
