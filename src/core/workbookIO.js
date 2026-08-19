import Papa from 'papaparse';
import readXlsxFile from 'read-excel-file/browser';
import writeXlsxFile from 'write-excel-file/browser';

const normalizedCell = (value) => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
};

const readCsv = (arrayBuffer) => {
  const text = new TextDecoder('utf-8').decode(arrayBuffer);
  const parsed = Papa.parse(text, { skipEmptyLines: false });
  if (parsed.errors.some((error) => error.type === 'Quotes')) {
    throw new Error(`CSV could not be parsed: ${parsed.errors[0].message}`);
  }
  return { sheetNames: ['CSV Import'], sheets: { 'CSV Import': parsed.data } };
};

export const readWorkbook = async (arrayBuffer, fileName = '') => {
  const extension = String(fileName).toLowerCase().split('.').pop();
  if (extension === 'csv') return readCsv(arrayBuffer);
  if (extension === 'xls') {
    throw new Error('Legacy .xls is not imported locally. Save it as .xlsx, or use the Google Drive conversion fallback.');
  }

  const file = new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const parsedSheets = await readXlsxFile(file);
  const sheetNames = parsedSheets.map(({ sheet }) => sheet);
  const sheets = Object.fromEntries(parsedSheets.map(({ sheet, data }) => [
    sheet,
    data.map((row) => row.map(normalizedCell))
  ]));
  return { sheetNames, sheets };
};

const exportCell = (value, header = false) => ({
  value: value === null || value === undefined ? '' : value,
  type: typeof value === 'number' ? Number : typeof value === 'boolean' ? Boolean : String,
  fontWeight: header ? 'bold' : undefined,
  backgroundColor: header ? '#E9EDF5' : undefined,
  wrap: true
});

export const exportWorkbook = async (headers, records, fileName = 'hoardings-export.xlsx') => {
  const rows = [
    headers.map((header) => exportCell(header, true)),
    ...records.map((record) => headers.map((header) => exportCell(record[header])))
  ];
  await writeXlsxFile(rows, {
    fileName,
    sheet: 'Hoardings_Master',
    columns: headers.map((header) => ({ width: Math.max(14, Math.min(42, String(header).length + 4)) }))
  });
};
