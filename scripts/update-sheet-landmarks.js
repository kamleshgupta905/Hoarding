import { getValidAccessToken } from './google-client.js';

async function updateSheetLandmarks() {
  const token = await getValidAccessToken();
  const sheetId = '1DBGLmkjT_7v-xqdomp8x9SogVFEa5iHhrx5Qrhl-ih0';
  
  // 1. Read existing headers
  const headerRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Hoardings_Master!A1:ZZ1`, {
    headers: { Authorization: 'Bearer ' + token }
  });
  const headerData = await headerRes.json();
  const headers = headerData.values ? headerData.values[0] : [];
  console.log('Current headers count:', headers.length);

  let visualColIdx = headers.indexOf('Visual_Landmarks');
  if (visualColIdx === -1) {
    // Column AD (col index 29, 30th column)
    console.log('Adding Visual_Landmarks header at column AD1...');
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Hoardings_Master!AD1?valueInputOption=RAW`, {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: [['Visual_Landmarks']]
      })
    });
    visualColIdx = 29; // AD is col index 29 (0-based)
  }

  // Column letters: A=0, B=1, C=2 ... Z=25, AA=26, AB=27, AC=28, AD=29
  // 2. Specific landmark updates for critical sites:
  const updates = [
    {
      row: 211, // SL 210
      sl: 210,
      mediaCol: 'C',
      mediaVal: 'Unipole',
      landmark: 'Central median unipole situated directly beneath elevated metro viaduct track pillars at traffic junction.'
    },
    {
      row: 212, // SL 211
      sl: 211,
      mediaCol: 'C',
      mediaVal: 'Gantry',
      landmark: 'Overhead highway gantry steel structure spanning across multi-lane roadway before intersection.'
    },
    {
      row: 210, // SL 209
      sl: 209,
      mediaCol: 'C',
      mediaVal: 'Unipole',
      landmark: 'Central median unipole under elevated metro viaduct track pillars facing Begum Bridge.'
    },
    {
      row: 213, // SL 212
      sl: 212,
      mediaCol: 'C',
      mediaVal: 'Gantry',
      landmark: 'Overhead highway gantry steel structure spanning across multi-lane roadway facing Begum Bridge.'
    },
    {
      row: 199, // SL 198
      sl: 198,
      mediaCol: 'C',
      mediaVal: 'Unipole',
      landmark: 'Curbside unipole along concrete flyover ramp retaining wall with wire mesh fencing and pedestrian staircase.'
    },
    {
      row: 197, // SL 196
      sl: 196,
      mediaCol: 'C',
      mediaVal: 'Unipole',
      landmark: 'Curbside unipole on flat sidewalk along open boulevard before flyover approach.'
    },
    {
      row: 198, // SL 197
      sl: 197,
      mediaCol: 'C',
      mediaVal: 'Unipole',
      landmark: 'Curbside unipole on opposite sidewalk facing Begum Bridge.'
    }
  ];

  for (const up of updates) {
    console.log(`Updating SL #${up.sl} at row ${up.row}...`);
    // Update Media column
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Hoardings_Master!${up.mediaCol}${up.row}?valueInputOption=RAW`, {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: [[up.mediaVal]]
      })
    });

    // Update Visual_Landmarks column (AD)
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Hoardings_Master!AD${up.row}?valueInputOption=RAW`, {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: [[up.landmark]]
      })
    });
  }

  console.log('✅ Sheet successfully updated with Visual_Landmarks and correct Media types!');
  process.exit(0);
}

updateSheetLandmarks().catch(err => {
  console.error('Error updating sheet:', err);
  process.exit(1);
});
