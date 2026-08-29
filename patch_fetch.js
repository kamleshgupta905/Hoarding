import fs from 'fs';

let content = fs.readFileSync('src/services/dataService.js', 'utf8');

const replacement = `export const fetchHoardings = async () => {
  try {
    const fetchUrl = \`\${STAFF_SCRIPT_URL}?action=pullChanges&_t=\${Date.now()}\`;
    const response = await requestJson(fetchUrl, { cache: 'no-store' }, 45000);
    
    if (!response || !response.success || !response.rows || response.rows.length === 0) {
      return [];
    }
    
    const headers = response.headers;
    const parsedData = response.rows.map(row => {
        const obj = {};
        headers.forEach((h, i) => obj[h] = row[i]);
        return obj;
    });
    
    const deletedSet = getDeletedSites();

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
    console.log("Patched successfully");
} else {
    console.log("Regex didn't match");
}
