import fs from 'fs';

const CREDENTIALS_PATH = './credentials.json';
const TOKEN_PATH = './token.json';

export async function getValidAccessToken() {
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error('token.json not found! Run: npm run google:connect');
  }

  let tokenData = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));

  // Check if token expired (or expiring in next 60s)
  const isExpired = tokenData.expiry_date && (Date.now() >= (tokenData.expiry_date - 60000));

  if (!isExpired && tokenData.access_token) {
    return tokenData.access_token;
  }

  // Refresh token
  if (!tokenData.refresh_token) {
    throw new Error('No refresh_token found in token.json. Please re-run npm run google:connect');
  }

  let credsRaw = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
  if (credsRaw.charCodeAt(0) === 0xFEFF) credsRaw = credsRaw.slice(1);
  const creds = JSON.parse(credsRaw);
  const installed = creds.installed || creds.web;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: installed.client_id,
      client_secret: installed.client_secret,
      refresh_token: tokenData.refresh_token,
      grant_type: 'refresh_token'
    })
  });

  const refreshed = await response.json();
  if (refreshed.error) {
    throw new Error('Failed to refresh Google token: ' + JSON.stringify(refreshed));
  }

  tokenData.access_token = refreshed.access_token;
  tokenData.expiry_date = Date.now() + (refreshed.expires_in * 1000);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokenData, null, 2));

  return tokenData.access_token;
}
