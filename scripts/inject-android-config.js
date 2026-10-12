import fs from 'fs';
import path from 'path';

try {
  const pkgPath = path.resolve('package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const version = pkg.version || '1.8.50';
  const parts = version.split('.').map(n => parseInt(n, 10) || 0);
  const versionCode = (parts[0] || 1) * 10000 + (parts[1] || 0) * 100 + (parts[2] || 0);

  // 1. Update android/app/build.gradle with exact versionName and versionCode
  const gradlePath = path.resolve('android/app/build.gradle');
  if (fs.existsSync(gradlePath)) {
    let gradle = fs.readFileSync(gradlePath, 'utf8');
    gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
    gradle = gradle.replace(/versionName\s+["'][^"']+["']/, `versionName "${version}"`);
    fs.writeFileSync(gradlePath, gradle, 'utf8');
    console.log(`✅ [Android Config] Updated build.gradle to versionName: "${version}" (versionCode: ${versionCode})`);
  } else {
    console.warn('⚠️ [Android Config] android/app/build.gradle not found, skipping gradle injection.');
  }

  // 2. Update AndroidManifest.xml permissions and deep linking
  const manifestPath = path.resolve('android/app/src/main/AndroidManifest.xml');
  if (fs.existsSync(manifestPath)) {
    let manifest = fs.readFileSync(manifestPath, 'utf8');
    
    const permissions = [
      '    <uses-permission android:name="android.permission.INTERNET" />',
      '    <uses-permission android:name="android.permission.CAMERA" />',
      '    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
      '    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
      '    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
      '    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
      '    <uses-feature android:name="android.hardware.camera" android:required="false" />',
      '    <uses-feature android:name="android.hardware.location.gps" android:required="false" />',
      '    <uses-feature android:name="android.hardware.sensor.compass" android:required="false" />',
      '    <uses-feature android:name="android.hardware.sensor.gyroscope" android:required="false" />'
    ].join('\n');

    if (!manifest.includes('android.permission.CAMERA')) {
      manifest = manifest.replace('<application', `${permissions}\n    <application`);
    }

    const deepLinkFilter = [
      '            <intent-filter android:autoVerify="true">',
      '                <action android:name="android.intent.action.VIEW" />',
      '                <category android:name="android.intent.category.DEFAULT" />',
      '                <category android:name="android.intent.category.BROWSABLE" />',
      '                <data android:scheme="https" android:host="hoarding-hd9a.vercel.app" android:pathPrefix="/staff" />',
      '            </intent-filter>'
    ].join('\n');

    if (!manifest.includes('android:pathPrefix="/staff"') && manifest.includes('</activity>')) {
      manifest = manifest.replace('</activity>', `${deepLinkFilter}\n        </activity>`);
    }

    fs.writeFileSync(manifestPath, manifest, 'utf8');
    console.log('✅ [Android Config] Injected camera, GPS permissions and /staff deep link intent into AndroidManifest.xml');
  } else {
    console.warn('⚠️ [Android Config] AndroidManifest.xml not found, skipping manifest injection.');
  }
} catch (err) {
  console.error('❌ [Android Config] Error injecting Android configuration:', err);
  process.exit(1);
}
