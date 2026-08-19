import readXlsxFile from 'read-excel-file/node';

async function run() {
    const rows = await readXlsxFile('C:/Users/shri hari computer/OneDrive/Desktop/Meerut Media Plan_Master Data.xlsx');
    console.log("FIRST ROW (HEADERS):");
    console.dir(rows[0], { maxArrayLength: null });
}
run();
