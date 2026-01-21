# 🤖 Fully Automated PPT → Website Workflow

This system allows you to upload a PowerPoint file, and the images automatically appear on your website.

### 📁 The Folder
**Use this Google Drive Folder:** [Hoarding Automation Folder](https://drive.google.com/drive/folders/1zlCavCgAa98MLZicTZrM0FTqqcG3h60l)

---

### 🛠️ How It Works (The 1-Step Process)

1.  **Prepare your PPT:**
    *   Ensure each slide represents **one** hoarding site.
    *   **CRITICAL:** In the **Speaker Notes** (section below the slide) of each slide, type the **Exact Site Name** as it appears in your Excel/Sheet.
        *   *Example:* `Maliwara Tyrannus`

2.  **Upload:**
    *   Drag and drop your `.pptx` file (or Google Slide) into the folder linked above.

3.  **Wait (Automation):**
    *   The system (Google Apps Script) wakes up automatically.
    *   It converts your PPT to images.
    *   It reads the name from the Speaker Notes.
    *   It saves the image to the public folder.
    *   It updates the Google Sheet with the new link.

4.  **Done!**
    *   Refresh your website, and the image is there.

---

### ⚙️ One-Time Setup (Trigger)

To make it run automatically without you clicking anything:

1.  Open your **Google Sheet**.
2.  Go to **Extensions > Apps Script**.
3.  In the left sidebar, click the **Alarm Clock Icon** (Triggers).
4.  Click **+ Add Trigger** (Blue button bottom right).
5.  Configure these settings:
    *   **Choose which function to run:** `processAutomation`
    *   **Select event source:** `Time-driven`
    *   **Select type of time based trigger:** `Minutes timer`
    *   **Select minute interval:** `Every minute` (or Every 5 minutes)
6.  Click **Save**.

Now the robot is alive and checking your folder 24/7! 🤖
