# ITSU Lacoste Verification & Collection Portal
## Production Deployment Guide

**Institution:** Takoradi Technical University (TTU)  
**Department:** Department of Computer Science  
**Student Union:** Information Technology Students Union (ITSU)  
**Authorized Treasurer Email:** `anthonymaclean100@gmail.com`

---

## 1. Architecture Overview

The system runs entirely on **Google Cloud / Google Workspace infrastructure**:
- **Database:** Google Sheets (private spreadsheet with 5 automated worksheets).
- **Backend:** Google Apps Script (`.gs` modules running in Google's secure V8 runtime).
- **Frontend:** Single-page React 18 application with Tailwind CSS and Lucide icons, served through Google Apps Script `HtmlService`.
- **Hosting:** Google Apps Script Web App.

---

## 2. Google Sheet Setup

1. Open [Google Drive](https://drive.google.com) signed in as the Treasurer (`anthonymaclean100@gmail.com`).
2. Click **+ New** > **Google Sheets** > **Blank spreadsheet**.
3. Name the spreadsheet:
   ```
   ITSU Lacoste Collection Database - TTU Computer Science
   ```
4. Copy the **Spreadsheet ID** from the browser URL:
   `https://docs.google.com/spreadsheets/d/`**`<SPREADSHEET_ID>`**`/edit`

---

## 3. Apps Script Project Configuration

1. In the Google Spreadsheet, click **Extensions** > **Apps Script**.
2. Rename the Apps Script project to:
   ```
   ITSU Lacoste Portal Backend
   ```
3. In the left sidebar of Apps Script, create the backend script files by clicking the **+** icon next to **Files** > **Script**:

   | File Name | Source Location in Repository |
   |---|---|
   | `Code.gs` | `backend/Code.gs` |
   | `SpreadsheetUtilities.gs` | `backend/SpreadsheetUtilities.gs` |
   | `AuditLogging.gs` | `backend/AuditLogging.gs` |
   | `Authentication.gs` | `backend/Authentication.gs` |
   | `SettingsManagement.gs` | `backend/SettingsManagement.gs` |
   | `StudentVerification.gs` | `backend/StudentVerification.gs` |
   | `SelectionManagement.gs` | `backend/SelectionManagement.gs` |
   | `DashboardAnalytics.gs` | `backend/DashboardAnalytics.gs` |
   | `ReportGeneration.gs` | `backend/ReportGeneration.gs` |
   | `Setup.gs` | `backend/Setup.gs` |

4. Create the frontend HTML file by clicking **+** > **HTML**:
   - File Name: `Index`
   - Paste the contents of `frontend/Index.html`.

5. Configure Manifest (`appsscript.json`):
   - In Apps Script Settings (gear icon), check **"Show 'appsscript.json' manifest file in editor"**.
   - Return to the editor, open `appsscript.json`, and replace with the contents of `backend/appsscript.json`:
     ```json
     {
       "timeZone": "Africa/Accra",
       "dependencies": {},
       "exceptionLogging": "STACKDRIVER",
       "runtimeVersion": "V8",
       "webapp": {
         "executeAs": "USER_DEPLOYING",
         "access": "ANYONE_ANONYMOUS"
       }
     }
     ```

---

## 4. Secure Treasurer Credential Initialization

To prevent security vulnerabilities, passwords and cryptographic secrets are **never stored in plaintext or inside the Google Sheet**.

1. In the Apps Script code editor, select the file `Setup.gs`.
2. From the function dropdown at the top toolbar, select `initializeDatabase`.
3. Click **Run**.
4. A Google authorization dialog will appear:
   - Click **Review Permissions**.
   - Select your account (`anthonymaclean100@gmail.com`).
   - Click **Advanced** > **Go to ITSU Lacoste Portal Backend (unsafe)**.
   - Click **Allow**.
5. The `initializeDatabase()` script will:
   - Create all 5 worksheets (`Students`, `Selections`, `Settings`, `Admin`, `AuditLogs`) with navy headers and formatting.
   - Populate default settings and initial student records for TTU Computer Science.
   - Generate a cryptographically random salt and compute a SHA-256 hash for the temporary initial password:
     ```
     ITSU@Treasurer2026!
     ```
   - Store the salted hash and HMAC secret in **Script Properties** (isolated from frontend and spreadsheets).
   - Flag `AUTH_MUST_CHANGE_PASSWORD = true`.

---

## 5. Web App Deployment & Permissions

To allow students to submit without requiring personal Google accounts:

1. In the Apps Script editor, click the blue **Deploy** button (top right) > **New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Configure the deployment settings:
   - **Description:** `ITSU Lacoste Portal Production v1.0`
   - **Execute as:** `Me (anthonymaclean100@gmail.com)` *(Crucial: This allows the web app to query the private spreadsheet securely on behalf of verified students)*
   - **Who has access:** `Anyone` *(Crucial: Allows students to open the link without being prompted for a Google Workspace login)*
4. Click **Deploy**.
5. Copy the **Web App URL**:
   `https://script.google.com/macros/s/.../exec`

This Web App URL is the official link given to students.

---

## 6. First Login & Password Change

1. Open the deployed Web App URL in your web browser.
2. In the footer or top navigation, click **Treasurer Portal** (or **Treasurer Access**).
3. Enter credentials:
   - **Email:** `anthonymaclean100@gmail.com`
   - **Password:** `ITSU@Treasurer2026!`
4. Click **Sign In to Dashboard**.
5. The portal will detect the first login and display the **Password Change Required** modal.
6. Enter the current temporary password and your new secure private password (minimum 8 characters).
7. Once updated, you have full administrative control.

---

## 7. Local Testing & Verification

For quick offline review or UI testing before deploying:
- Double-click `frontend/preview.html` to open it in Google Chrome, Microsoft Edge, or Mozilla Firefox.
- It includes a fully functional client-side mock backend simulating all Apps Script operations.
- Test student verification using index numbers `0721000001` through `0721000012`.
- Test rejection using unpaid student `0721000016`.

