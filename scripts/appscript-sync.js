import fs from 'fs';
import { getValidAccessToken } from './google-client.js';

const SCRIPT_ID_FILE = './.apps-script-id';

export async function getScriptId() {
  const args = process.argv.slice(2);
  let scriptId = args[1] || args[0];
  if (!scriptId || scriptId === 'push' || scriptId === 'pull') {
    if (fs.existsSync(SCRIPT_ID_FILE)) {
      scriptId = fs.readFileSync(SCRIPT_ID_FILE, 'utf8').trim();
    }
  }
  return scriptId;
}

export async function pullAppsScript(scriptId) {
  if (!scriptId) {
    console.error('❌ Script ID missing! Usage: node scripts/appscript-sync.js pull <SCRIPT_ID>');
    return;
  }
  fs.writeFileSync(SCRIPT_ID_FILE, scriptId);
  const token = await getValidAccessToken();
  console.log('📥 Pulling Apps Script files for:', scriptId);

  const res = await fetch('https://script.googleapis.com/v1/projects/' + scriptId + '/content', {
    headers: { Authorization: 'Bearer ' + token }
  });

  const data = await res.json();
  if (data.error) {
    console.error('❌ Pull failed:', data.error.message);
    return;
  }

  if (!fs.existsSync('./google_apps_script')) {
    fs.mkdirSync('./google_apps_script', { recursive: true });
  }

  for (const file of data.files || []) {
    const ext = file.type === 'JSON' ? '.json' : '.gs';
    const filePath = './google_apps_script/' + file.name + ext;
    fs.writeFileSync(filePath, file.source);
    console.log('✅ Saved: ' + filePath);
  }
  console.log('🎉 Pull complete!');
}

export async function pushAppsScript(scriptId) {
  if (!scriptId) {
    console.error('❌ Script ID missing! Usage: node scripts/appscript-sync.js push <SCRIPT_ID>');
    return;
  }
  fs.writeFileSync(SCRIPT_ID_FILE, scriptId);
  const token = await getValidAccessToken();
  console.log('🚀 Pushing code to Google Apps Script:', scriptId);

  const files = [];

  // 1. appsscript.json manifest
  let manifest = {
    timeZone: 'Asia/Kolkata',
    dependencies: {
      enabledAdvancedServices: [
        {
          userSymbol: 'Drive',
          version: 'v2',
          serviceId: 'drive'
        },
        {
          userSymbol: 'Sheets',
          version: 'v4',
          serviceId: 'sheets'
        }
      ]
    },
    exceptionLogging: 'STACKDRIVER',
    runtimeVersion: 'V8',
    webapp: {
      executeAs: 'USER_DEPLOYING',
      access: 'ANYONE'
    }
  };

  if (fs.existsSync('./google_apps_script/appsscript.json')) {
    try {
      manifest = JSON.parse(fs.readFileSync('./google_apps_script/appsscript.json', 'utf8'));
    } catch (_) {}
  }

  files.push({
    name: 'appsscript',
    type: 'JSON',
    source: JSON.stringify(manifest, null, 2)
  });

  // 2. Code.gs — the single source of truth for the Apps Script backend.
  // There is deliberately no fallback to another path: a second copy of this
  // file used to exist in the repo root, and the two drifted apart silently,
  // which meant a push could deploy stale backend code.
  let codeSource = '';
  if (fs.existsSync('./google_apps_script/Code.gs')) {
    codeSource = fs.readFileSync('./google_apps_script/Code.gs', 'utf8');
  } else {
    console.error('❌ google_apps_script/Code.gs not found — nothing to push!');
    return;
  }

  files.push({
    name: 'Code',
    type: 'SERVER_JS',
    source: codeSource
  });

  const res = await fetch('https://script.googleapis.com/v1/projects/' + scriptId + '/content', {
    method: 'PUT',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ files })
  });

  const data = await res.json();
  if (data.error) {
    console.error('❌ Push failed:', data.error.message);
  } else {
    console.log('🎉 PUSH SUCCESSFUL! Code updated live on Google Apps Script cloud!');
    console.log('Updated files:', data.files ? data.files.map(f => f.name) : []);
  }
}

async function main() {
  const mode = process.argv[2] || 'push';
  const scriptId = await getScriptId();
  if (mode === 'pull') {
    await pullAppsScript(scriptId);
  } else {
    await pushAppsScript(scriptId);
  }
}

main().catch(console.error);
