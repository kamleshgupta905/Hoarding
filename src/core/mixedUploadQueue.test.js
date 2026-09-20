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

describe('browser memory guard', () => {
  // Parsing is client side: the file is read into an ArrayBuffer, JSZip expands
  // it, and each extracted photo is held as a blob plus a base64 copy.
  const limitsFor = (isDesktopApp) => ({
    hard: isDesktopApp ? 500 : 150,
    warn: isDesktopApp ? 250 : 60
  });

  const verdict = (sizeMB, isDesktopApp) => {
    const { hard, warn } = limitsFor(isDesktopApp);
    if (sizeMB > hard) return 'blocked';
    if (sizeMB > warn) return 'confirm';
    return 'allowed';
  };

  it('blocks a 380 MB deck in the browser, where it would exhaust memory', () => {
    expect(verdict(380, false)).toBe('blocked');
  });

  it('allows the same 380 MB deck in the desktop app with a warning', () => {
    expect(verdict(380, true)).toBe('confirm');
  });

  it('lets an ordinary deck through with no prompt', () => {
    expect(verdict(25, false)).toBe('allowed');
    expect(verdict(25, true)).toBe('allowed');
  });

  it('warns in the band where it usually works but may not', () => {
    expect(verdict(90, false)).toBe('confirm');
    expect(verdict(300, true)).toBe('confirm');
  });

  it('blocks beyond the desktop ceiling too', () => {
    expect(verdict(600, true)).toBe('blocked');
  });
});
