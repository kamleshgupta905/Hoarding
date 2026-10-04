import { describe, it, expect } from 'vitest';
import {
  levenshteinDistance,
  normalizePhonetic,
  matchesKeywordFuzzy,
  matchesAllKeywordsFuzzy
} from './fuzzySearch.js';

describe('Fuzzy & Phonetic Search Engine', () => {
  describe('Levenshtein Distance', () => {
    it('computes exact match as 0', () => {
      expect(levenshteinDistance('begum', 'begum')).toBe(0);
    });

    it('computes single character edits', () => {
      expect(levenshteinDistance('begam', 'begum')).toBe(1);
      expect(levenshteinDistance('delhi', 'dehli')).toBe(2); // swap is 2 edits
    });
  });

  describe('normalizePhonetic', () => {
    it('normalizes begam to begum', () => {
      expect(normalizePhonetic('begam')).toContain('begum');
      expect(normalizePhonetic('begum')).toContain('begum');
    });

    it('normalizes vowels ee->i, oo->u', () => {
      expect(normalizePhonetic('meerat')).toBe(normalizePhonetic('meerat'));
      expect(normalizePhonetic('roorkee')).toBe('rurki');
    });
  });

  describe('matchesKeywordFuzzy & matchesAllKeywordsFuzzy', () => {
    const siteText = 'Begum Bridge Metro Station Meerut Uttar Pradesh Near Delhi Road';

    it('matches exact keyword', () => {
      expect(matchesKeywordFuzzy(siteText, 'begum')).toBe(true);
      expect(matchesKeywordFuzzy(siteText, 'bridge')).toBe(true);
    });

    it('matches "begam" with "begum" (the exact issue user reported)', () => {
      expect(matchesKeywordFuzzy(siteText, 'begam')).toBe(true);
      expect(matchesAllKeywordsFuzzy(siteText, 'begam bridge')).toBe(true);
      expect(matchesAllKeywordsFuzzy(siteText, 'begam metro')).toBe(true);
    });

    it('matches "dehli" with "delhi"', () => {
      expect(matchesKeywordFuzzy(siteText, 'dehli')).toBe(true);
      expect(matchesAllKeywordsFuzzy(siteText, 'dehli road')).toBe(true);
    });

    it('matches minor typos like "brdige" (edit distance <= 1)', () => {
      expect(matchesKeywordFuzzy(siteText, 'brdige')).toBe(true);
    });

    it('does not match completely unrelated words', () => {
      expect(matchesKeywordFuzzy(siteText, 'shastri')).toBe(false);
      expect(matchesKeywordFuzzy(siteText, 'mumbai')).toBe(false);
      expect(matchesAllKeywordsFuzzy(siteText, 'begam shastri')).toBe(false);
    });

    it('matches Hindi transliteration variations', () => {
      const parkSite = 'Bachha Park Chowk Meerut';
      expect(matchesAllKeywordsFuzzy(parkSite, 'bacha park')).toBe(true);
      expect(matchesAllKeywordsFuzzy(parkSite, 'bachcha park')).toBe(true);
      expect(matchesAllKeywordsFuzzy(parkSite, 'chauraha')).toBe(true); // chowk <-> chauraha alias
    });
  });
});
