import fs from 'fs';

let content = fs.readFileSync('src/services/dataService.js', 'utf8');

// Replace staffUploads fetch
content = content.replace(
  "requestJson(`\${STAFF_SCRIPT_URL}?action=staffUploads&sessionToken=\${encodeURIComponent(session || 'admin')}&t=\${Date.now()}`, { cache: 'no-store' }, 15000)",
  "requestJson(`\${STAFF_SCRIPT_URL}?action=staffUploads&sessionToken=\${encodeURIComponent(session || 'admin')}&t=\${Date.now()}`, {}, 30000)"
);

fs.writeFileSync('src/services/dataService.js', content);
