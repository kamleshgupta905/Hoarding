import fs from 'fs';

let content = fs.readFileSync('src/services/dataService.js', 'utf8');

const replacement = `export const fetchHoardings = async () => {
  try {
    let parsedData = [];
    let isCsv = false;
    const deletedSet = getDeletedSites();

    try {
        // Attempt 1: Direct CSV Export (Fastest, no Apps Script quotas)
        // Omit {cache: 'no-store'} to strictly avoid CORS preflight OPTIONS requests!
        const fetchUrl = \`https://docs.google.com/spreadsheets/d/\${SHEET_ID}/export?format=csv&sheet=\${SHEET_NAME}&_t=\${Date.now()}\`;
        const rawData = await requestText(fetchUrl, {}, 15000);
        
        const parsed = Papa.parse(rawData, { header: true, skipEmptyLines: true });
        if (parsed.data && parsed.data.length > 0) {
            parsedData = parsed.data;
            isCsv = true;
        }
    } catch (err1) {
        console.warn("Direct CSV fetch failed, falling back to Apps Script:", err1.message);
    }

    if (!isCsv || parsedData.length === 0) {
        // Attempt 2: Secure Apps Script Backend (Bypasses multiple-account CORS bugs)
        const fetchUrl = \`\${STAFF_SCRIPT_URL}?action=pullChanges&_t=\${Date.now()}\`;
        const response = await requestJson(fetchUrl, {}, 60000); // 60s timeout for Apps Script
        
        if (!response || !response.success || !response.rows || response.rows.length === 0) {
          return [];
        }
        
        const headers = response.headers;
        parsedData = response.rows.map(row => {
            const obj = {};
            headers.forEach((h, i) => obj[h] = row[i]);
            return obj;
        });
    }

    if (!parsedData || parsedData.length === 0) return [];

    return parsedData
      .filter(item => {
        if (!item || !item.City || item.City.toLowerCase() === 'total') return false;
        if (item._DeletedAt) return false;
        
        const loc = String(item['Location '] || item['Locality Site Location'] || item['Location'] || '').trim();
        const locality = String(item['Locality'] || item['Area'] || '').trim();
        const img = String(item.ImageURL || item['Site Photo'] || '');
        const id = String(item.UniqueID || item['Unique ID'] || item.ID || item._SiteID || '').trim().toLowerCase();
        
        if (img.includes('1gxuIMFvFbop-0usp0vf41QbwRgoOKJFr')) return false;
        if (!loc && (!locality || locality === 't' || locality.length <= 1)) return false;
        
        if (id && deletedSet.has(id)) return false;
        if (loc && deletedSet.has(loc.toLowerCase())) return false;
        
        return true;
      })
      .map(normalizeHoarding);
  } catch (error) {
    console.error("Live Spreadsheet Fetch Failed:", error);
    throw error;
  }
};`;

const regex = /export const fetchHoardings = async \(\) => \{[\s\S]*?throw error;\n  \}\n\};/m;

if (regex.test(content)) {
    content = content.replace(regex, replacement);
    fs.writeFileSync('src/services/dataService.js', content);
    console.log("Patched fetchHoardings successfully");
} else {
    console.log("Regex didn't match");
}
