import readXlsxFile from 'read-excel-file/node';

async function run() {
    try {
        const sheets = await readXlsxFile('C:/Users/shri hari computer/OneDrive/Desktop/Meerut Media Plan_Master Data.xlsx', { getSheets: true });
        console.log("Sheets:", sheets);
    } catch(e) {
        console.log("Error:", e);
    }
}
run();
