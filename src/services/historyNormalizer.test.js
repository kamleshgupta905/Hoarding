import { describe, it, expect } from 'vitest';
import { parseHistoryString } from './dataService';

/**
 * The Apps Script backend stores ExecutionHistory as comma-joined
 * "url|timestamp|gps" entries, and normalizeHistoryString_ guarantees the
 * timestamp is always present. This suite mirrors that backend function here so
 * its behaviour is pinned by tests (Apps Script itself cannot be run in CI),
 * and then checks the frontend parser agrees with what the backend writes.
 */
const normalizeHistoryString = (historyString, fallbackTs) => {
  const raw = String(historyString == null ? '' : historyString).trim();
  if (!raw) return '';

  const stamp = fallbackTs || new Date().getTime();

  const rejoined = [];
  raw.split(',').forEach((piece) => {
    const chunk = String(piece).trim();
    if (!chunk) return;
    if (chunk.indexOf('http') !== -1 || rejoined.length === 0) {
      rejoined.push(chunk);
      return;
    }
    const prev = rejoined[rejoined.length - 1];
    const prevParts = prev.split('|');
    if (/^-?\d+(\.\d+)?$/.test(chunk) && prevParts.length === 3 && prevParts[2].indexOf(' ') === -1) {
      rejoined[rejoined.length - 1] = `${prev} ${chunk}`;
    }
  });

  return rejoined.map((entry) => {
    const item = String(entry).trim();
    if (!item) return '';

    const parts = item.split('|');
    const url = String(parts[0] || '').trim();
    if (!url || url.indexOf('http') === -1) return '';

    const tsRaw = String(parts[1] || '').trim();
    let tsNum = Number(tsRaw);
    let valid = tsRaw && !isNaN(tsNum) && tsNum > 1000000000;

    if (!valid && tsRaw) {
      const parsed = new Date(tsRaw).getTime();
      if (!isNaN(parsed) && parsed > 1000000000) {
        tsNum = parsed;
        valid = true;
      }
    }

    const ts = valid ? tsNum : stamp;
    const gps = String(parts.slice(2).join('|') || '').trim().replace(/,/g, ' ');
    return `${url}|${ts}${gps ? `|${gps}` : ''}`;
  }).filter((e) => e !== '').join(',');
};

const FALLBACK = 1758000000000;
const REAL_TS = 1700000000000;
const URL_A = 'https://drive.google.com/file/d/AAA111/view';
const URL_B = 'https://drive.google.com/file/d/BBB222/view';

describe('ExecutionHistory timestamp normalization (backend contract)', () => {
  it('stamps an entry that has no timestamp at all', () => {
    // This is the exact shape that produced "Verified Date Unknown".
    expect(normalizeHistoryString(URL_A, FALLBACK)).toBe(`${URL_A}|${FALLBACK}`);
  });

  it('preserves a timestamp that is already valid', () => {
    const input = `${URL_A}|${REAL_TS}`;
    expect(normalizeHistoryString(input, FALLBACK)).toBe(input);
  });

  it('keeps good entries untouched while stamping only the undated one', () => {
    const input = `${URL_A}|${REAL_TS},${URL_B}`;
    expect(normalizeHistoryString(input, FALLBACK))
      .toBe(`${URL_A}|${REAL_TS},${URL_B}|${FALLBACK}`);
  });

  it('converts a date string written instead of epoch millis', () => {
    const out = normalizeHistoryString(`${URL_A}|2024-03-05T10:00:00.000Z`, FALLBACK);
    expect(out).toBe(`${URL_A}|${Date.parse('2024-03-05T10:00:00.000Z')}`);
  });

  it('retains a gps segment that was stored safely (space separated)', () => {
    expect(normalizeHistoryString(`${URL_A}||28.6 77.2`, FALLBACK))
      .toBe(`${URL_A}|${FALLBACK}|28.6 77.2`);
  });

  it('round-trips a safely stored gps without splitting the entry', () => {
    const out = normalizeHistoryString(`${URL_A}|${REAL_TS}|28.6 77.2`, FALLBACK);
    expect(out.split(',')).toHaveLength(1);
    expect(out).toBe(`${URL_A}|${REAL_TS}|28.6 77.2`);
  });

  it('salvages history already corrupted by a raw comma in gps', () => {
    // Legacy rows wrote "lat,lng" unescaped, so the lng broke off into its own
    // url-less fragment. Stitch it back rather than losing half the coordinate.
    const corrupted = `${URL_A}|${REAL_TS}|28.6,77.2`;
    const out = normalizeHistoryString(corrupted, FALLBACK);
    expect(out).toBe(`${URL_A}|${REAL_TS}|28.6 77.2`);
    expect(parseHistoryString(out)).toHaveLength(1);
  });

  it('drops empty and non-url junk instead of writing broken entries', () => {
    expect(normalizeHistoryString(`,,${URL_A}|${REAL_TS},not-a-url,`, FALLBACK))
      .toBe(`${URL_A}|${REAL_TS}`);
  });

  it('returns an empty string for empty or nullish input', () => {
    expect(normalizeHistoryString('', FALLBACK)).toBe('');
    expect(normalizeHistoryString(null, FALLBACK)).toBe('');
    expect(normalizeHistoryString(undefined, FALLBACK)).toBe('');
  });

  it('is idempotent - re-normalizing changes nothing', () => {
    const once = normalizeHistoryString(`${URL_A},${URL_B}|${REAL_TS}`, FALLBACK);
    expect(normalizeHistoryString(once, 9999999999999)).toBe(once);
  });
});

describe('frontend parser agrees with normalized backend output', () => {
  it('reads a real timestamp back out of normalized history', () => {
    const normalized = normalizeHistoryString(`${URL_A}|${REAL_TS}`, FALLBACK);
    const parsed = parseHistoryString(normalized);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].timestamp).toBe(REAL_TS);
  });

  it('gives every entry a usable date once normalized, so none render as Unknown', () => {
    const normalized = normalizeHistoryString(`${URL_A},${URL_B}|${REAL_TS}`, FALLBACK);
    const parsed = parseHistoryString(normalized);
    expect(parsed).toHaveLength(2);
    // The undated entry is the bug being fixed: it must now carry a timestamp.
    parsed.forEach((item) => {
      expect(item.timestamp).toBeGreaterThan(1000000000);
    });
  });

  it('keeps full gps coordinates intact through normalize then parse', () => {
    const normalized = normalizeHistoryString(`${URL_A}||28.6 77.2`, FALLBACK);
    const parsed = parseHistoryString(normalized);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].gps).toBe('28.6 77.2');
  });
});

/**
 * Regressions found by inspecting the live Hoardings_Master sheet.
 * The ExecutionHistory column contained two kinds of damage:
 *   1. cells holding the literal text "[object Object]"
 *   2. entries whose gps was written as a raw "lat,lng", so the longitude
 *      broke off into its own url-less fragment, often repeated many times
 */
describe('repairs damage observed in the live sheet', () => {
  it('treats an "[object Object]" cell as empty instead of a photo', () => {
    expect(parseHistoryString('[object Object]')).toEqual([]);
    expect(parseHistoryString('[object Object][object Object]')).toEqual([]);
  });

  it('does not turn a split-off longitude into a phantom entry', () => {
    // Exactly the shape seen in the sheet: one photo, gps split by its comma.
    const fromSheet = `${URL_A}|1789619980787|28.956048, 77.734999`;
    const parsed = parseHistoryString(fromSheet);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].timestamp).toBe(1789619980787);
  });

  it('ignores the repeated orphan longitudes that follow real entries', () => {
    // The sheet had runs like ", 77.734999, 77.734999, 77.734999" between photos.
    const fromSheet = [
      `${URL_A}|1789619980787|28.956048, 77.734999`,
      ' 77.734999',
      ' 77.734999',
      `${URL_B}|1789730569271|28.956048, 77.734999`
    ].join(',');
    const parsed = parseHistoryString(fromSheet);
    expect(parsed).toHaveLength(2);
    expect(parsed.map((p) => p.timestamp)).toEqual([1789619980787, 1789730569271]);
  });

  it('normalizer stitches an orphan fragment back onto its entry', () => {
    const out = normalizeHistoryString(`${URL_A}|${REAL_TS}|28.956048, 77.734999`, FALLBACK);
    expect(out.split(',')).toHaveLength(1);
    expect(out).toContain('28.956048 77.734999');
  });

  it('normalizer drops repeated orphan longitudes rather than keeping junk', () => {
    const out = normalizeHistoryString(
      `${URL_A}|${REAL_TS}|28.956048, 77.734999, 77.734999, 77.734999`,
      FALLBACK
    );
    expect(parseHistoryString(out)).toHaveLength(1);
    expect(out.match(/77\.734999/g)).toHaveLength(1);
  });
});
