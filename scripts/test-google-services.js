import fs from 'fs';

const CREDENTIALS_PATH = './credentials.json';
const TOKEN_PATH = './token.json';

async function main() {
  if (!fs.existsSync(TOKEN_PATH)) {
    console.log('❌ token.json abhi nahi mila. Pehle run karein: npm run google:connect');
    return;
  }

  const tokenData = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  const accessToken = tokenData.access_token;

  console.log('🔍 Testing Google Services Connection...\n');

  // 1. Test Gmail Profile
  try {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: 'Bearer ' + accessToken }
    });
    if (res.ok) {
      const data = await res.json();
      console.log('✅ Gmail Connected! Logged in as:', data.emailAddress);
    } else {
      console.log('⚠️ Gmail Status:', res.status, res.statusText);
    }
  } catch (err) {
    console.log('❌ Gmail test error:', err.message);
  }

  // 2. Test Google Drive
  try {
    const res = await fetch('https://www.googleapis.com/drive/v3/files?pageSize=5&fields=files(id,name)', {
      headers: { Authorization: 'Bearer ' + accessToken }
    });
    if (res.ok) {
      const data = await res.json();
      console.log('✅ Google Drive Connected! Found ' + (data.files ? data.files.length : 0) + ' recent files.');
    } else {
      console.log('⚠️ Drive Status:', res.status, res.statusText);
    }
  } catch (err) {
    console.log('❌ Drive test error:', err.message);
  }

  // 3. Test Google Sheets
  try {
    const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets/1DBGLmkjT_7v-xqdomp8x9SogVFEa5iHhrx5Qrhl-ih0', {
      headers: { Authorization: 'Bearer ' + accessToken }
    });
    if (res.ok) {
      const data = await res.json();
      console.log('✅ Google Sheets Connected! Sheet Title:', data.properties ? data.properties.title : 'OK');
    } else {
      console.log('⚠️ Google Sheets Status:', res.status, res.statusText);
    }
  } catch (err) {
    console.log('❌ Google Sheets test error:', err.message);
  }

  // 4. Test YouTube
  try {
    const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
      headers: { Authorization: 'Bearer ' + accessToken }
    });
    if (res.ok) {
      const data = await res.json();
      console.log('✅ YouTube Connected! Channel items found: ' + (data.items ? data.items.length : 0));
    } else {
      console.log('⚠️ YouTube Status:', res.status, res.statusText);
    }
  } catch (err) {
    console.log('❌ YouTube test error:', err.message);
  }

  console.log('\n🎉 Test complete!');
}

main().catch(console.error);
