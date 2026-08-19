import {
  HEADER_ALIASES,
  PROTECTED_IMPORT_HEADERS,
  REQUIRED_IMPORT_HEADERS,
  buildCompositeIdentity,
  getHeaderAliases,
  isValidCoordinate,
  normalizeHeader,
  rowsToObjects
} from './hoardingSchema';

const EMPTY_VALUES = new Set(['', null, undefined]);

export const detectHeaderRow = (rows, targetHeaders, maxRows = 25) => {
  const targetAliases = new Set(targetHeaders.flatMap(getHeaderAliases));
  let best = { index: 0, score: -1 };
  rows.slice(0, maxRows).forEach((row, index) => {
    let score = 0;
    let siteHeader = false;
    row.forEach((cell) => {
      const normalized = normalizeHeader(cell);
      if (!normalized) return;
      if (targetAliases.has(normalized)) score += 3;
      if (getHeaderAliases('Location ').includes(normalized)) {
        score += 10;
        siteHeader = true;
      }
    });
    if (siteHeader && score > best.score) best = { index, score };
  });
  return best.index;
};

export const buildHeaderMapping = (incomingHeaders, targetHeaders, overrides = {}) => {
  const normalizedIncoming = incomingHeaders.map(normalizeHeader);
  const used = new Set();
  const mappings = targetHeaders.map((targetHeader, targetIndex) => {
    const override = overrides[targetHeader];
    let incomingIndex = override ? incomingHeaders.indexOf(override) : -1;
    let reason = override ? 'Confirmed manually' : '';
    if (incomingIndex === -1) {
      incomingIndex = normalizedIncoming.findIndex((value, index) => (
        !used.has(index) && value === normalizeHeader(targetHeader)
      ));
      if (incomingIndex !== -1) reason = 'Exact header';
    }
    if (incomingIndex === -1) {
      const aliases = getHeaderAliases(targetHeader);
      incomingIndex = normalizedIncoming.findIndex((value, index) => !used.has(index) && aliases.includes(value));
      if (incomingIndex !== -1) {
        reason = `${incomingHeaders[incomingIndex]} mapped to ${targetHeader}`;
      }
    }
    if (incomingIndex !== -1) used.add(incomingIndex);
    return { targetHeader, targetIndex, incomingIndex, incomingHeader: incomingHeaders[incomingIndex] || '', reason };
  });

  return {
    mappings,
    unknownHeaders: incomingHeaders.filter((header, index) => normalizeHeader(header) && !used.has(index)),
    aliasDictionary: HEADER_ALIASES
  };
};

const mapIncomingRecord = (row, targetHeaders, mapping) => Object.fromEntries(
  targetHeaders.map((header) => {
    const entry = mapping.mappings.find((item) => item.targetHeader === header);
    return [header, entry?.incomingIndex >= 0 ? row[entry.incomingIndex] ?? '' : ''];
  })
);

const hasRequiredValue = (record, header) => !EMPTY_VALUES.has(record[header]);

export const analyzeImport = ({
  grid,
  targetHeaders,
  existingRecords = [],
  headerRowIndex = null,
  mappingOverrides = {}
}) => {
  const detectedHeaderRow = headerRowIndex ?? detectHeaderRow(grid, targetHeaders);
  const incomingHeaders = (grid[detectedHeaderRow] || []).map((value) => String(value ?? '').trim());
  const mapping = buildHeaderMapping(incomingHeaders, targetHeaders, mappingOverrides);
  const incomingRows = grid.slice(detectedHeaderRow + 1).filter((row) => row.some((value) => String(value ?? '').trim()));
  const existingById = new Map(existingRecords.filter((row) => row._SiteID).map((row) => [String(row._SiteID), row]));
  const existingByComposite = new Map();
  existingRecords.forEach((record) => {
    const key = buildCompositeIdentity(record);
    if (!key.replace(/\|/g, '')) return;
    const values = existingByComposite.get(key) || [];
    values.push(record);
    existingByComposite.set(key, values);
  });

  const seen = new Map();
  const rows = [];
  const duplicates = [];
  const invalidCoordinates = [];
  const missingRequired = [];

  incomingRows.forEach((rawRow, offset) => {
    const sourceRow = detectedHeaderRow + offset + 2;
    const incoming = mapIncomingRecord(rawRow, targetHeaders, mapping);
    const missing = REQUIRED_IMPORT_HEADERS.filter((header) => !hasRequiredValue(incoming, header));
    if (missing.length) missingRequired.push({ row: sourceRow, site: incoming['Location '], fields: missing });

    if (!isValidCoordinate(incoming['Lat.'], 'lat') || !isValidCoordinate(incoming['Long.'], 'long')) {
      invalidCoordinates.push({ row: sourceRow, site: incoming['Location '], lat: incoming['Lat.'], long: incoming['Long.'] });
    }

    const siteId = String(incoming._SiteID || '').trim();
    const composite = buildCompositeIdentity(incoming);
    const duplicateKey = siteId || composite;
    if (seen.has(duplicateKey)) duplicates.push({ row: sourceRow, duplicateOfRow: seen.get(duplicateKey), site: incoming['Location '] });
    else if (duplicateKey) seen.set(duplicateKey, sourceRow);

    let existing = siteId ? existingById.get(siteId) : null;
    let matchMethod = existing ? 'SITE_ID' : '';
    let ambiguous = false;
    if (!existing && composite) {
      const candidates = existingByComposite.get(composite) || [];
      if (candidates.length === 1) {
        existing = candidates[0];
        matchMethod = 'COMPOSITE';
      } else if (candidates.length > 1) {
        ambiguous = true;
      }
    }

    const merged = existing ? { ...existing } : {};
    targetHeaders.forEach((header) => {
      const value = incoming[header];
      if (PROTECTED_IMPORT_HEADERS.has(header) && EMPTY_VALUES.has(value)) return;
      if (!EMPTY_VALUES.has(value)) merged[header] = value;
    });

    const blockingReasons = [];
    if (missing.length) blockingReasons.push(`Missing: ${missing.join(', ')}`);
    if (ambiguous) blockingReasons.push('Ambiguous existing site match');
    if (!isValidCoordinate(incoming['Lat.'], 'lat') || !isValidCoordinate(incoming['Long.'], 'long')) blockingReasons.push('Invalid latitude/longitude');
    if (duplicates.some((item) => item.row === sourceRow)) blockingReasons.push('Duplicate row in file');

    rows.push({
      sourceRow,
      incoming,
      merged,
      existing,
      matchMethod,
      action: blockingReasons.length ? 'REVIEW' : existing ? 'UPDATE' : 'ADD',
      blockingReasons
    });
  });

  return {
    detectedHeaderRow,
    incomingHeaders,
    mapping,
    rows,
    summary: {
      totalRows: rows.length,
      newRows: rows.filter((row) => row.action === 'ADD').length,
      updatedRows: rows.filter((row) => row.action === 'UPDATE').length,
      skippedRows: rows.filter((row) => row.action === 'REVIEW').length,
      duplicates,
      invalidCoordinates,
      missingRequired,
      unknownHeaders: mapping.unknownHeaders,
      mappedHeaders: mapping.mappings.filter((item) => item.incomingIndex >= 0),
      blockingErrors: rows.some((row) => row.action === 'REVIEW') ? ['Resolve review rows before import.'] : []
    }
  };
};

export const gridToRecords = (headers, rows) => rowsToObjects(headers, rows);
