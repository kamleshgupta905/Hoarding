import fs from 'fs';

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwmtW7Y71md_XoIk8A0JWrsWKSN-YuFgCcdahe5R56mADlGtH-t9Pj98YhPt3-Z1DoI5g/exec';
const filePath = 'releases_upload/heera-staff-camera.apk';

async function uploadStaffApk() {
  console.log('Reading', filePath, '...');
  const buffer = fs.readFileSync(filePath);
  const base64 = buffer.toString('base64');
  console.log('File size:', (buffer.length / (1024 * 1024)).toFixed(2), 'MB');
  console.log('Uploading to Google Drive...');

  const response = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({
      action: 'uploadInputFile',
      fileName: 'heera-staff-camera.apk',
      fileData: base64,
      mimeType: 'application/vnd.android.package-archive',
      sessionToken: 'adm_session_master_authorized'
    })
  });

  const resJson = await response.json();
  console.log('Response:', JSON.stringify(resJson, null, 2));
  const fileId = resJson.result?.fileId || resJson.fileId;
  if (fileId) {
    console.log('\n=== GOOGLE DRIVE LINKS FOR STAFF APK ===');
    console.log('Preview/View Link: https://drive.google.com/file/d/' + fileId + '/view?usp=sharing');
    console.log('Direct Download: https://drive.google.com/uc?export=download&id=' + fileId);
  }
}

uploadStaffApk().catch(console.error);
