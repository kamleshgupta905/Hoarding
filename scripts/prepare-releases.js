import fs from 'fs';
import { execSync } from 'child_process';

if (!fs.existsSync('releases_upload')) {
  fs.mkdirSync('releases_upload');
}

console.log('1. Downloading Staff APK...');
execSync('gh release download staff-apk-latest -p "heera-staff-camera.apk" --dir releases_upload --clobber', { stdio: 'inherit' });

console.log('2. Downloading Desktop Setup exe v1.8.54...');
execSync('curl -L -o releases_upload/Heera-Advertising-Admin-Setup-1.8.54.exe https://github.com/kamleshgupta905/hoarding-desktop-releases/releases/download/v1.8.54/Heera-Advertising-Admin-Setup-1.8.54.exe', { stdio: 'inherit' });

console.log('3. Downloaded files in releases_upload:');
fs.readdirSync('releases_upload').forEach(f => {
  const st = fs.statSync('releases_upload/' + f);
  console.log('-', f, '->', (st.size / (1024 * 1024)).toFixed(1) + ' MB');
});
