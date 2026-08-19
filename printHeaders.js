import readXlsxFile from 'read-excel-file/node';
import fs from 'fs';

async function run() {
    try {
        const rows = await readXlsxFile('C:/Users/shri hari computer/OneDrive/Desktop/Meerut Media Plan_Master Data.xlsx');
        fs.writeFileSync('C:/Users/shri hari computer/Downloads/Hoarding-main/Hoarding-main/desktop_headers.json', JSON.stringify({
           typeOfRows: typeof rows,
           isArray: Array.isArray(rows),
           firstElement: Array.isArray(rows) ? rows[0] : null
        }, null, 2));
    } catch(e) {
        fs.writeFileSync('C:/Users/shri hari computer/Downloads/Hoarding-main/Hoarding-main/desktop_headers.json', JSON.stringify({ error: e.message }));
    }
}
run();
