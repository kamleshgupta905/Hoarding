import fs from 'fs';
import http from 'http';
import url from 'url';
import { exec } from 'child_process';

const CREDENTIALS_PATH = './credentials.json';
const TOKEN_PATH = './token.json';

if (!fs.existsSync(CREDENTIALS_PATH)) {
  console.error('❌ credentials.json not found!');
  process.exit(1);
}

let raw = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
if (raw.charCodeAt(0) === 0xFEFF) {
  raw = raw.slice(1);
}
const creds = JSON.parse(raw);
const installed = creds.installed || creds.web;
const { client_id, client_secret } = installed;

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/script.projects'
].join(' ');

// Start temporary local server to capture redirect
const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = new URL(req.url, 'http://localhost');
    const code = reqUrl.searchParams.get('code');
    const error = reqUrl.searchParams.get('error');

    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end('<h2>Authentication Failed: ' + error + '</h2>');
      server.close();
      return;
    }

    if (code) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h2>Authentication Successful! You can close this tab now.</h2>');
      
      console.log('✅ Authorization code received. Exchanging for tokens...');
      
      const port = server.address().port;
      const redirect_uri = 'http://localhost:' + port;

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id,
          client_secret,
          redirect_uri,
          grant_type: 'authorization_code'
        })
      });

      const tokenData = await tokenResponse.json();
      if (tokenData.error) {
        console.error('❌ Token exchange failed:', tokenData);
      } else {
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokenData, null, 2));
        console.log('🎉 Successfully connected to Google! Token saved to', TOKEN_PATH);
      }
      server.close();
    }
  } catch (err) {
    console.error('Error handling request:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal error');
    server.close();
  }
});

const PORT = 3005;

server.listen(PORT, () => {
  const port = server.address().port;
  const redirect_uri = `http://localhost:${port}`;
  
  const authUrl = new URL('https://accounts.google.com/o/oauth2/auth');
  authUrl.searchParams.set('client_id', client_id);
  authUrl.searchParams.set('redirect_uri', redirect_uri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');

  console.log('----------------------------------------------------');
  console.log('🔗 Open this URL in your browser if it does not open automatically:');
  console.log(authUrl.toString());
  console.log('----------------------------------------------------');

  const startCmd = process.platform === 'win32' ? 'start ""' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  exec(startCmd + ' "' + authUrl.toString() + '"');
});
