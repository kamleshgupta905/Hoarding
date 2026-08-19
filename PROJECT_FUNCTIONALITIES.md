# 📋 AdHoardings – Project Functionalities & Implementation Guide

AdHoardings ek premium outdoor advertising discovery platform hai jo live data sync aur AI-driven image validation ka upyog karta hai.

---

## 🚀 Key Functionalities

### 1. 🌐 Public Discovery Platform
*   **Search & Filter:** User locality, city, size (Large/Medium/Small), aur media format (Front Lit/Back Lit) ke aadhar par hoardings search kar sakte hain.
*   **City-wise Browsing:** Har city (Delhi, Mumbai, etc.) ke liye dedicated hoarding listings.
*   **Interactive Map:** Leaflet.js ka upyog karke hoardings ki exact GPS location map par dikhayi jati hai.
*   **Detailed View:** Har hoarding ki dimensions, traffic story, monthly cost, aur verification history detail page par uplabdha hai.

### 2. 🤖 AI-Powered Daily Updates
*   **Automatic Location Detection:** Groq AI (Llama 4) ka upyog karke hoarding photos ke GPS stamps se site ka naam automatically detect kiya jata hai.
*   **Status Validation:** AI image ko "Available" ya "Occupied" status mein classify karta hai.
*   **Auto-Sync:** Location match hone par data turant Google Sheets mein update ho jata hai.

### 3. 🛡️ Admin Management Panel
*   **Inventory Control:** Har hoarding ka online status (Active/Offline) manage karne ki suvidha.
*   **Bulk Uploads:** Excel (CSV) aur PPT files ke zariye naya inventory data aur photos bulk mein upload karne ki automation.
*   **Lead Tracking:** Enquiry form submissions ko track karne ka mechanism.

---

## 🛠️ Implementation Details

### **Frontend Implementation (React)**
*   **Data Service (`dataService.js`):** Google Sheets ko as a database upyog kiya gaya hai. PapaParse library se CSV data fetch aur parse hota hai. Cache busting ke liye timestamp query params ka use hota hai.
*   **AI Service (`aiService.js`):** Groq API ka use karke images ko crop kiya jata hai (bottom GPS area) aur LLM ko analysis ke liye bheja jata hai. Keyword matching validation logic se AI ki accuracy badhayi gayi hai.
*   **State Management:** React hooks (`useState`, `useEffect`, `useMemo`) ka upyog real-time data filtering aur admin workflow ke liye kiya gaya hai.

### **Backend & Automation (Google Apps Script)**
*   **`GOOGLE_APPS_SCRIPT_FINAL.js`:** Yeh main automation engine hai.
    *   **File Processing:** Drive folder mein aayi Excel/PPT files ko detect karke data sheet mein map karta hai.
    *   **Image Mapping:** Image filename ko site name se match karke automatically correct row mein link karta hai.
    *   **API Endpoint:** React Dashboard se aane wali requests (AI updates) ko handle karne ke liye `doPost` function ka upyog kiya gaya hai.

### **Static Data & Config**
*   **Drive Image Fix:** Google Drive ke original links browser mein block hote hain, isliye script File ID extract karke unhe thumbnail URL format (`drive.google.com/thumbnail?sz=w1200&id=ID`) mein badalti hai.
*   **Routing:** `react-router-dom` se clean URLs (`/Meerut`, `/Noida/SiteName`) implement kiye gaye hain.

---

## 📂 Data Flow Diagram
```
Google Sheets (Database) <──> Google Apps Script (Automation) <──> React App (Frontend)
                                      ^                                 |
                                      │                                 v
                                (File Storage) <─────────────────── Groq AI Service
                                Google Drive
```
