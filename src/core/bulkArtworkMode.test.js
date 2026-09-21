import { describe, it, expect } from 'vitest';

/**
 * Bulk campaign onboarding offers two artwork modes:
 *
 *   history_only   — the new PPT artwork is filed under ExecutionHistory and
 *                    the site's master photo is left alone
 *   replace_master — the new artwork becomes the master photo, and the photo
 *                    it replaces is archived into ExecutionHistory
 *
 * Both depend on the history entry actually reaching the sheet via the
 * batchUpdateSheet payload. These tests pin that payload-shaping logic, which
 * is what previously went missing: history was written to localStorage only.
 */

// Mirrors queueHistoryToSheet + the replace_master branch in bulkBookingEngine.
const queueHistoryToSheet = (batchUpdates, site, entryUrl, gps, now = Date.now()) => {
  if (!entryUrl) return;
  const targetLoc = site['Location '] || site.Location || site['Locality Site Location'] || '';
  const targetFacing = site.Facing || site['Traffic View'] || '';
  const row = batchUpdates.find(u =>
    (site._SiteID && u.siteId === site._SiteID) ||
    (site.SL && String(u.sl) === String(site.SL)) ||
    (targetLoc && u.siteName === targetLoc && (!targetFacing || u.facing === targetFacing)) ||
    (targetLoc && u.siteName === targetLoc)
  );
  if (!row || !row.fields) return;
  const stamped = `${entryUrl}|${now}${gps ? `|${String(gps).replace(/,/g, ' ')}` : ''}`;
  row.fields.ExecutionHistory = row.fields.ExecutionHistory
    ? `${row.fields.ExecutionHistory},${stamped}`
    : stamped;
};

const applyArtwork = ({ artworkMode, site, batchUpdates, uploadedUrl, now = Date.now() }) => {
  if (artworkMode === 'replace_master') {
    const oldMaster = site.ImageURL || site['IMAGE 1'] || site['Image URL'] || '';
    if (oldMaster && !oldMaster.includes('unsplash.com')) {
      queueHistoryToSheet(batchUpdates, site, oldMaster, null, now);
    }
    site.ImageURL = uploadedUrl;
    const row = batchUpdates.find(u =>
      (site._SiteID && u.siteId === site._SiteID) ||
      (site.SL && String(u.sl) === String(site.SL))
    );
    if (row) {
      row.url = uploadedUrl;
      if (row.fields) {
        row.fields.ImageURL = uploadedUrl;
        row.fields['Image URL'] = uploadedUrl;
      }
    }
  } else {
    queueHistoryToSheet(batchUpdates, site, uploadedUrl, null, now);
  }
};

const NEW_ART = 'https://lh3.googleusercontent.com/d/NEWART';
const OLD_MASTER = 'https://lh3.googleusercontent.com/d/OLDMASTER';
const NOW = 1789742255321;

const makeSite = (over = {}) => ({ _SiteID: 'site-1', SL: '7', ImageURL: OLD_MASTER, ...over });
const makeBatch = () => ([{
  siteId: 'site-1',
  sl: '7',
  siteName: 'Begum Bridge Metro Station',
  fields: { STATUS: 'Booked', BookedBy: 'Patanjali' }
}]);

describe('artwork mode: history_only', () => {
  it('files the new artwork into ExecutionHistory on the sheet payload', () => {
    const batch = makeBatch();
    applyArtwork({ artworkMode: 'history_only', site: makeSite(), batchUpdates: batch, uploadedUrl: NEW_ART, now: NOW });

    expect(batch[0].fields.ExecutionHistory).toBe(`${NEW_ART}|${NOW}`);
  });

  it('leaves the master photo untouched', () => {
    const site = makeSite();
    const batch = makeBatch();
    applyArtwork({ artworkMode: 'history_only', site, batchUpdates: batch, uploadedUrl: NEW_ART, now: NOW });

    expect(site.ImageURL).toBe(OLD_MASTER);
    // No url on the row means batchUpdateSheet_ must not touch the image column.
    expect(batch[0].url).toBeUndefined();
    expect(batch[0].fields.ImageURL).toBeUndefined();
  });

  it('keeps booking fields intact alongside the history entry', () => {
    const batch = makeBatch();
    applyArtwork({ artworkMode: 'history_only', site: makeSite(), batchUpdates: batch, uploadedUrl: NEW_ART, now: NOW });

    expect(batch[0].fields.STATUS).toBe('Booked');
    expect(batch[0].fields.BookedBy).toBe('Patanjali');
  });
});

describe('artwork mode: replace_master', () => {
  it('promotes the new artwork to master on both the row and the fields', () => {
    const site = makeSite();
    const batch = makeBatch();
    applyArtwork({ artworkMode: 'replace_master', site, batchUpdates: batch, uploadedUrl: NEW_ART, now: NOW });

    expect(site.ImageURL).toBe(NEW_ART);
    expect(batch[0].url).toBe(NEW_ART);
    expect(batch[0].fields.ImageURL).toBe(NEW_ART);
  });

  it('archives the photo it replaced into ExecutionHistory', () => {
    const batch = makeBatch();
    applyArtwork({ artworkMode: 'replace_master', site: makeSite(), batchUpdates: batch, uploadedUrl: NEW_ART, now: NOW });

    // The outgoing master must survive the swap, not be overwritten silently.
    expect(batch[0].fields.ExecutionHistory).toBe(`${OLD_MASTER}|${NOW}`);
  });

  it('does not archive a placeholder stock image as if it were real artwork', () => {
    const site = makeSite({ ImageURL: 'https://images.unsplash.com/photo-1541535650810' });
    const batch = makeBatch();
    applyArtwork({ artworkMode: 'replace_master', site, batchUpdates: batch, uploadedUrl: NEW_ART, now: NOW });

    expect(batch[0].fields.ExecutionHistory).toBeUndefined();
    expect(site.ImageURL).toBe(NEW_ART);
  });

  it('handles a site that had no master photo at all', () => {
    const site = makeSite({ ImageURL: '' });
    const batch = makeBatch();
    applyArtwork({ artworkMode: 'replace_master', site, batchUpdates: batch, uploadedUrl: NEW_ART, now: NOW });

    expect(batch[0].fields.ExecutionHistory).toBeUndefined();
    expect(batch[0].url).toBe(NEW_ART);
  });
});

describe('history entry shaping', () => {
  it('appends rather than overwriting when a site gets two entries', () => {
    const batch = makeBatch();
    const site = makeSite();
    queueHistoryToSheet(batch, site, `${NEW_ART}1`, null, NOW);
    queueHistoryToSheet(batch, site, `${NEW_ART}2`, null, NOW + 1000);

    expect(batch[0].fields.ExecutionHistory)
      .toBe(`${NEW_ART}1|${NOW},${NEW_ART}2|${NOW + 1000}`);
  });

  it('neutralises commas in gps so one entry cannot split into two', () => {
    const batch = makeBatch();
    queueHistoryToSheet(batch, makeSite(), NEW_ART, '28.956048, 77.734999', NOW);

    expect(batch[0].fields.ExecutionHistory).toBe(`${NEW_ART}|${NOW}|28.956048  77.734999`);
    expect(batch[0].fields.ExecutionHistory.split(',')).toHaveLength(1);
  });

  it('matches the target row by SL when the site has no _SiteID', () => {
    const batch = makeBatch();
    queueHistoryToSheet(batch, { SL: '7' }, NEW_ART, null, NOW);

    expect(batch[0].fields.ExecutionHistory).toBe(`${NEW_ART}|${NOW}`);
  });

  it('matches the target row by Location name when the site has no _SiteID or SL', () => {
    const batch = [{
      siteId: '',
      sl: '',
      siteName: 'Begum Bridge Metro Station',
      facing: 'Delhi Road',
      fields: { STATUS: 'Booked', BookedBy: 'Patanjali' }
    }];
    queueHistoryToSheet(batch, { Location: 'Begum Bridge Metro Station', Facing: 'Delhi Road' }, NEW_ART, null, NOW);

    expect(batch[0].fields.ExecutionHistory).toBe(`${NEW_ART}|${NOW}`);
  });

  it('does nothing when no row in the batch belongs to the site', () => {
    const batch = makeBatch();
    queueHistoryToSheet(batch, { _SiteID: 'someone-else', SL: '99' }, NEW_ART, null, NOW);

    expect(batch[0].fields.ExecutionHistory).toBeUndefined();
  });
});
