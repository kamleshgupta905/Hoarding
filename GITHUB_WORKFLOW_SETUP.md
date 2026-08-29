# 🚀 Automatic APK & Desktop App Builder (GitHub Actions)

GitHub security policy ki wajah se AI Studio direct `.github/workflows` folder push nahi karta bina extra permission ke.

Agar aapko GitHub par online APK aur Windows `.exe` generate karni hai, toh bas ye 2 minute ka step karein:

---

### 📋 Step-by-Step Guide:

1. Apne **GitHub.com** repo page par jayein.
2. Upar **"Add file"** ➔ **"Create new file"** par click karein.
3. File name box mein type karein:
   ```
   .github/workflows/build-apk.yml
   ```
4. Neeche editor box mein ye code paste kar dein:

```yaml
name: Build Desktop App & Android APK

on:
  push:
    branches: [ main, master ]
  workflow_dispatch:

jobs:
  # 📱 1. BUILD ANDROID APK
  build-apk:
    name: 📱 Build Android APK
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Setup Java JDK
        uses: actions/setup-java@v3
        with:
          distribution: 'zulu'
          java-version: '17'

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3

      - name: Install Node Dependencies
        run: |
          npm ci || npm install

      - name: Build Web Application
        run: |
          npm run build

      - name: Configure Capacitor & Generate Android Platform
        run: |
          npm install @capacitor/core@latest @capacitor/cli@latest @capacitor/android@latest
          if [ ! -d "android" ]; then
            npx cap add android
          fi
          npx cap sync android

      - name: Build Android Debug APK
        run: |
          cd android
          chmod +x ./gradlew
          ./gradlew assembleDebug --stacktrace

      - name: Upload APK Artifact
        uses: actions/upload-artifact@v4
        with:
          name: HIRA-Staff-Camera-APK
          path: android/app/build/outputs/apk/debug/app-debug.apk

  # 🖥️ 2. BUILD WINDOWS DESKTOP APP (.EXE)
  build-desktop:
    name: 🖥️ Build Windows Desktop App
    runs-on: windows-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install Dependencies
        run: |
          npm ci || npm install

      - name: Build Web Frontend
        run: |
          npm run build

      - name: Package Windows Desktop App (.exe)
        run: |
          npm run electron:build
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Upload Windows Installer (.exe) Artifact
        uses: actions/upload-artifact@v4
        with:
          name: HIRA-Admin-Desktop-Windows-Setup
          path: |
            dist_electron/*.exe
            dist_electron/*.blockmap
            dist_electron/latest.yml
```

5. Neeche **"Commit changes"** button par click kar dein!

---

### 📥 Download Kaise Karein:
GitHub Repo ke **"Actions"** tab mein jakar **Artifacts** se direct download kar lein!
