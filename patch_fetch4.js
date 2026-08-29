import fs from 'fs';

let content = fs.readFileSync('src/pages/AdminDashboard.jsx', 'utf8');

content = content.replace(
  /fetch\(\`\\\$\{scriptUrl\}\?action=excelImportPreview&token=\\\$\{encodeURIComponent\(token\)\}&sessionToken=\\\$\{encodeURIComponent\(getAdminSession\(\)\)\}&t=\\\$\{Date\.now\(\)\}\`, \{ cache: 'no-store' \}\)/g,
  "fetch(`\${scriptUrl}?action=excelImportPreview&token=\${encodeURIComponent(token)}&sessionToken=\${encodeURIComponent(getAdminSession())}&t=\${Date.now()}`)"
);

content = content.replace(
  /fetch\(\`\\\$\{scriptUrl\}\?action=fileJobStatus&token=\\\$\{encodeURIComponent\(token\)\}&sessionToken=\\\$\{encodeURIComponent\(getAdminSession\(\)\)\}&t=\\\$\{Date\.now\(\)\}\`, \{ cache: 'no-store' \}\)/g,
  "fetch(`\${scriptUrl}?action=fileJobStatus&token=\${encodeURIComponent(token)}&sessionToken=\${encodeURIComponent(getAdminSession())}&t=\${Date.now()}`)"
);

fs.writeFileSync('src/pages/AdminDashboard.jsx', content);
