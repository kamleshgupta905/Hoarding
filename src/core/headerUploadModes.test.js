import { describe, it, expect } from 'vitest';

describe('Header Sites Upload Mode Selector', () => {
  const buildUploadQueue = ({ mode, excelFile, pptFile, pptDestination = 'history' }) => {
    if (mode === 'excel') {
      if (!excelFile) throw new Error('Excel file is required');
      return [{ file: excelFile, type: 'excel' }];
    }
    if (mode === 'ppt') {
      if (!pptFile) throw new Error('PPT file is required');
      return [{ file: pptFile, type: 'ppt', options: { pptDestination } }];
    }
    if (mode === 'combo') {
      if (!excelFile || !pptFile) throw new Error('Both Excel and PPT files are required');
      return [
        { file: excelFile, type: 'excel' },
        { file: pptFile, type: 'ppt', options: { pptDestination } }
      ];
    }
    throw new Error('Unknown mode');
  };

  it('correctly configures Mode 1: Only Excel', () => {
    const queue = buildUploadQueue({
      mode: 'excel',
      excelFile: { name: 'inventory.xlsx' }
    });
    expect(queue).toHaveLength(1);
    expect(queue[0].type).toBe('excel');
    expect(queue[0].file.name).toBe('inventory.xlsx');
  });

  it('correctly configures Mode 2: Only PPT with Save to History', () => {
    const queue = buildUploadQueue({
      mode: 'ppt',
      pptFile: { name: 'hoardings_deck.pptx' },
      pptDestination: 'history'
    });
    expect(queue).toHaveLength(1);
    expect(queue[0].type).toBe('ppt');
    expect(queue[0].options.pptDestination).toBe('history');
  });

  it('correctly configures Mode 2: Only PPT with As Main Image', () => {
    const queue = buildUploadQueue({
      mode: 'ppt',
      pptFile: { name: 'hoardings_deck.pptx' },
      pptDestination: 'main'
    });
    expect(queue).toHaveLength(1);
    expect(queue[0].type).toBe('ppt');
    expect(queue[0].options.pptDestination).toBe('main');
  });

  it('correctly configures Mode 3: Combo running Excel first then PPT with target destination', () => {
    const queue = buildUploadQueue({
      mode: 'combo',
      excelFile: { name: 'sites.xlsx' },
      pptFile: { name: 'photos.pptx' },
      pptDestination: 'history'
    });
    expect(queue).toHaveLength(2);
    expect(queue[0].type).toBe('excel');
    expect(queue[1].type).toBe('ppt');
    expect(queue[1].options.pptDestination).toBe('history');
  });

  it('throws validation error if required files for chosen mode are missing', () => {
    expect(() => buildUploadQueue({ mode: 'excel' })).toThrow('Excel file is required');
    expect(() => buildUploadQueue({ mode: 'ppt' })).toThrow('PPT file is required');
    expect(() => buildUploadQueue({ mode: 'combo', excelFile: { name: 'test.xlsx' } })).toThrow('Both Excel and PPT files are required');
  });
});
