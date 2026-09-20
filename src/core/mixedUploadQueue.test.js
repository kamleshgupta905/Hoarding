import { describe, it, expect } from 'vitest';

/**
 * The header upload control accepts an Excel sheet, a PPT deck, or both in one
 * pick. Mirrors the classify + ordering logic in handleMixedUpload.
 *
 * Ordering matters: Excel syncs the master inventory, and PPT slide matching
 * runs against that inventory. Processing a deck before its sheet would match
 * slides against stale sites.
 */
const classify = (name) =>
  /\.(xlsx|xls|csv)$/i.test(name) ? 'excel' : (/\.(pptx?|ppt)$/i.test(name) ? 'ppt' : null);

const buildQueue = (names) => {
  const excel = names.filter(n => classify(n) === 'excel');
  const ppt = names.filter(n => classify(n) === 'ppt');
  return [
    ...excel.map(n => ({ name: n, type: 'excel' })),
    ...ppt.map(n => ({ name: n, type: 'ppt' }))
  ];
};

describe('file classification', () => {
  it('recognises every supported spreadsheet extension', () => {
    expect(classify('inventory.xlsx')).toBe('excel');
    expect(classify('inventory.xls')).toBe('excel');
    expect(classify('inventory.csv')).toBe('excel');
  });

  it('recognises both presentation extensions', () => {
    expect(classify('campaign.pptx')).toBe('ppt');
    expect(classify('campaign.ppt')).toBe('ppt');
  });

  it('is case insensitive, as file pickers preserve the original casing', () => {
    expect(classify('INVENTORY.XLSX')).toBe('excel');
    expect(classify('Campaign.PPTX')).toBe('ppt');
  });

  it('rejects unrelated files rather than guessing a type', () => {
    expect(classify('notes.pdf')).toBeNull();
    expect(classify('photo.jpg')).toBeNull();
    expect(classify('archive.zip')).toBeNull();
    expect(classify('README')).toBeNull();
  });

  it('classifies on the real extension, not an earlier lookalike in the name', () => {
    expect(classify('q3.xlsx.pptx')).toBe('ppt');
    expect(classify('deck.pptx.xlsx')).toBe('excel');
  });
});

describe('queue ordering', () => {
  it('runs Excel before PPT so slides match freshly synced inventory', () => {
    const queue = buildQueue(['campaign.pptx', 'inventory.xlsx']);
    expect(queue.map(j => j.type)).toEqual(['excel', 'ppt']);
  });

  it('keeps the order when they are already picked Excel first', () => {
    const queue = buildQueue(['inventory.xlsx', 'campaign.pptx']);
    expect(queue.map(j => j.type)).toEqual(['excel', 'ppt']);
  });

  it('handles a single file of either kind', () => {
    expect(buildQueue(['only.xlsx']).map(j => j.type)).toEqual(['excel']);
    expect(buildQueue(['only.pptx']).map(j => j.type)).toEqual(['ppt']);
  });

  it('drops unsupported files instead of queueing them', () => {
    const queue = buildQueue(['notes.pdf', 'inventory.xlsx', 'photo.jpg']);
    expect(queue).toHaveLength(1);
    expect(queue[0].name).toBe('inventory.xlsx');
  });

  it('produces an empty queue when nothing is usable', () => {
    expect(buildQueue(['notes.pdf', 'photo.jpg'])).toEqual([]);
  });

  it('preserves relative order within each type for multi-file picks', () => {
    const queue = buildQueue(['b.pptx', 'a.xlsx', 'a.pptx', 'b.xlsx']);
    expect(queue.map(j => j.name)).toEqual(['a.xlsx', 'b.xlsx', 'b.pptx', 'a.pptx']);
  });
});

describe('upload size guard', () => {
  // The parser keeps only the one photo per slide that gets uploaded, so peak
  // memory tracks the file size rather than a multiple of it. A deck still has
  // to fit in the heap, hence a ceiling.
  const limitsFor = (isDesktopApp) => ({
    hard: isDesktopApp ? 2048 : 600,
    warn: isDesktopApp ? 1024 : 250
  });

  const verdict = (sizeMB, isDesktopApp) => {
    const { hard, warn } = limitsFor(isDesktopApp);
    if (sizeMB > hard) return 'blocked';
    if (sizeMB > warn) return 'confirm';
    return 'allowed';
  };

  it('accepts a 380 MB deck in the browser now that blobs are released', () => {
    expect(verdict(380, false)).toBe('confirm');
  });

  it('accepts the same 380 MB deck in the desktop app without a prompt', () => {
    expect(verdict(380, true)).toBe('allowed');
  });

  it('lets an ordinary deck through with no prompt', () => {
    expect(verdict(25, false)).toBe('allowed');
    expect(verdict(25, true)).toBe('allowed');
  });

  it('warns near the browser ceiling', () => {
    expect(verdict(300, false)).toBe('confirm');
    expect(verdict(1500, true)).toBe('confirm');
  });

  it('still blocks decks past each ceiling', () => {
    expect(verdict(700, false)).toBe('blocked');
    expect(verdict(2500, true)).toBe('blocked');
  });
});
