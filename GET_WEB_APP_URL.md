# 🚀 How to Get Your Web App URL

You need to deploy the Google Apps Script to get the URL. Here is the step-by-step guide:

### Step 1: Open Script Editor
1. Open your **Google Sheet**.
2. Go to top menu: **Extensions** > **Apps Script**.
3. A new tab will open with a code editor.

### Step 2: Paste the Code
1. Delete any existing code in the editor.
2. Open the file `GOOGLE_APPS_SCRIPT.js` from your project folder.
3. Copy all the code and paste it into the Google Script editor.
4. **IMPORTANT**: On the left sidebar, click **Services +**, select **Drive API**, and click **Add**.
5. Update the `CONFIG` variables at the top of the script with your real Folder IDs:
   *   `PPT_UPLOAD_FOLDER_ID`
   *   `TEMP_SLIDES_FOLDER`

### Step 3: Deploy as Web App (Crucial Step)
1. In the top right corner, click the blue **Deploy** button.
2. Select **New deployment**.
3. Click the "Select type" gear icon ⚙️ and choose **Web app**.
4. Fill in these details (VERY IMPORTANT):
   *   **Description**: `v1`
   *   **Execute as**: `Me` (your email)
   *   **Who has access**: `Anyone` (must be Anyone to allow the website to talk to it)
5. Click **Deploy**.

### Step 4: Authorize
1. A popup will ask for permission. Click **Review permissions**.
2. Select your Google account.
3. You might see a warning "Google hasn't verified this app" (because it's your own custom script).
   *   Click **Advanced** (bottom left).
   *   Click **Go to [Project Name] (unsafe)**.
4. Click **Allow**.

### Step 5: Copy the URL
1. After deployment succeeds, you will see a box with a **Web app URL**.
2. It looks like: `https://script.google.com/macros/s/AKfycbx.../exec`
3. **Copy this long URL.**

### Step 6: Use in Dashboard
1. Go back to your Hoarding Admin Dashboard.
2. Go to the **Automation Center** tab.
3. Paste this URL into the box that says "Paste Script Web App URL here".
4. Click **Run Automation**.
