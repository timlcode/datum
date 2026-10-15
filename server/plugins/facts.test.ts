import { describe, expect, it } from 'vitest';
import { factsConfigured, formatFacts, instructionWantsFacts } from './facts';

describe('facts plugin', () => {
  it('notices instructions that need outside dates', () => {
    expect(instructionWantsFacts('Verify the geotech report completion via email')).toBe(true);
    expect(instructionWantsFacts('Cross-check first-round grading comments')).toBe(true);
    expect(instructionWantsFacts('Pull live dates for the permit')).toBe(true);
    expect(instructionWantsFacts('Push Interior Finishes out two weeks.')).toBe(false);
    expect(instructionWantsFacts('Add a 5-day walkthrough after punch list')).toBe(false);
  });

  it('stays off unless a URL is configured', () => {
    const prev = process.env.DATUM_FACTS_URL;
    delete process.env.DATUM_FACTS_URL;
    expect(factsConfigured()).toBe(false);
    if (prev) process.env.DATUM_FACTS_URL = prev;
  });

  it('formats a packet without inventing items', () => {
    const text = formatFacts({
      ok: true,
      items: [{ date: '2026-10-02', summary: 'Permit comments returned', source: 'meeting minutes' }],
      errors: [],
    });
    expect(text).toContain('Permit comments returned');
    expect(text).toContain('meeting minutes');
    expect(text).not.toMatch(/192\.168|10\.0\.0/);
  });
});
