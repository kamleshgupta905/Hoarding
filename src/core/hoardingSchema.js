export const INTERNAL_HEADERS = [
  '_SiteID',
  '_RowVersion',
  '_UpdatedAt',
  '_DeletedAt',
  '_LastOperationID'
];

export const REQUIRED_IMPORT_HEADERS = [
  'City',
  'Locality',
  'Location '
];

export const PROTECTED_IMPORT_HEADERS = new Set([
  'ImageURL',
  'ExecutionHistory',
  'History',
  'BookedBy',
  'BookingStart',
  'BookingEnd',
  ...INTERNAL_HEADERS
]);

export const HEADER_ALIASES = {
  'S. No.': ['s no', 's.no', 'sno', 'sl', 'serial', 'serial no', 'sr no'],
  State: ['state', 'province'],
  City: ['city', 'market city', 'market'],
  Locality: ['locality', 'area', 'zone'],
  'Location ': ['locality site location', 'site location', 'site name', 'location name', 'location', 'site'],
  'Pin Code': ['pin code', 'pincode', 'postal code', 'zip'],
  'Traffic From': ['traffic from', 'from', 'facing from'],
  'Traffic To': ['traffic to', 'to', 'facing', 'traffic facing'],
  'Lat.': ['lat', 'lat.', 'latitude'],
  'Long.': ['long', 'long.', 'lng', 'longitude'],
  'Lat Long (Concatenated)': ['lat long', 'lat-long', 'latlong', 'coordinates', 'gps coordinates'],
  'Size (Large/ Medium/ Small)': ['size', 'media size', 'site size'],
  Width: ['width', 'w'],
  Height: ['height', 'h'],
  Units: ['units', 'unit', 'quantity', 'qty'],
  'Total SQ.ft': ['total sq ft', 'total sqft', 'total square feet', 'sq ft', 'sqft'],
  'Type of Site (Unipole/ Billboard)': ['type', 'site type', 'media type', 'structure type'],
  'Media Format (Front Lit/ Back Lit/Non Lit)': ['media', 'media format', 'lighting', 'illumination', 'lit type'],
  'LHS/ Non LHS': ['lhs', 'non lhs', 'road side'],
  'Digital/ Non Digital': ['digital', 'non digital', 'digital type'],
  'Solus (Y/N)': ['solus', 'solus y n', 'exclusive'],
  'Site Category': ['site category', 'category'],
  'Avg. monthly Cost': [
    'avg monthly cost',
    'avg. monthly cost',
    'average monthly cost',
    'monthly rent',
    'monthly rental',
    'rent per month',
    'rental per month',
    'cost',
    'price'
  ],
  STATUS: ['status', 'availability', 'live status'],
  ImageURL: ['imageurl', 'image url', 'photo', 'photo url', 'image link'],
  _SiteID: ['site id', 'siteid', '_siteid']
};

export const normalizeText = (value) => String(value ?? '')
  .normalize('NFKD')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/\bfcng\b/g, ' facing ')
  .replace(/\bopp\b/g, ' opposite ')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const normalizeHeader = (value) => normalizeText(value).replace(/\s+/g, '');

export const getHeaderAliases = (header) => {
  const values = [header, ...(HEADER_ALIASES[header] || [])];
  return [...new Set(values.map(normalizeHeader).filter(Boolean))];
};

// Google Sheets headers are entered manually, so preserve a stable field name
// in the app even when the sheet uses a different case or an approved alias.
export const canonicalizeHeader = (header) => {
  const normalized = normalizeHeader(header);
  // Single-letter columns such as W/X/Y/Z are backend fields, not the
  // shorthand import aliases for Width/Height.
  if (normalized.length <= 1) return String(header ?? '');
  const canonical = Object.keys(HEADER_ALIASES).find((candidate) => (
    getHeaderAliases(candidate).includes(normalized)
  ));
  return canonical || String(header ?? '');
};

export const canonicalizeHeaders = (headers) => (
  (headers || []).map(canonicalizeHeader)
);

export const isInternalHeader = (header, index = -1) => (
  INTERNAL_HEADERS.includes(String(header)) || [19, 22, 23, 24, 25].includes(index)
);

export const isValidCoordinate = (value, type) => {
  if (value === '' || value === null || value === undefined) return true;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return false;
  return type === 'lat' ? parsed >= -90 && parsed <= 90 : parsed >= -180 && parsed <= 180;
};

const roundedCoordinate = (value) => {
  if (value === '' || value === null || value === undefined) return '';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(5) : '';
};

export const buildCompositeIdentity = (row) => [
  normalizeText(row.City),
  normalizeText(row['Location ']),
  normalizeText(row["Area"]),
  normalizeText(row['Traffic From']),
  normalizeText(row['Traffic To']),
  normalizeText(row.Width),
  normalizeText(row.Height),
  roundedCoordinate(row['Lat.'] ?? row.Latitude),
  roundedCoordinate(row['Long.'] ?? row.Longitude)
].join('|');

export const createOperationId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
};

export const rowsToObjects = (headers, rows) => rows.map((row) => (
  Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))
));

export const objectsToRows = (headers, records) => records.map((record) => (
  headers.map((header) => record[header] ?? '')
));
