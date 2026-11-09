# ITSU LACOSTE VERIFICATION & COLLECTION PORTAL

> **Information Technology Students Union (ITSU)**  
> **Department of Computer Science**  
> **Takoradi Technical University (TTU)**

A complete, production-ready web application built for the Information Technology Students Union (ITSU) to manage the verification and collection of departmental Lacoste shirt preferences from eligible paid students.

---

## 🌟 Key Features

### For Students (Public Portal)
- **Zero Friction Access:** No accounts, no usernames, no passwords.
- **Identity & Payment Verification:** Verified against the official paid-student register via Full Name and Index Number.
- **Colour Selection:** Royal Blue and Classic White with clean visual previews.
- **Size Selection:** S, M, L, XL, XXL, and XXXL.
- **Strict Duplicate Protection:** Only one submission permitted per student index number.
- **Instant Digital Reference:** Displays confirmed reference code upon successful submission.
- **Mobile-First Responsive Design:** Optimized for smartphones and handheld devices.

### For the Treasurer (Protected Dashboard)
- **Multi-Factor Administrative Security:** Authorized email (`anthonymaclean100@gmail.com`), SHA-256 salted password hashing in Script Properties, expiring sessions, rate limiting, and brute-force lockout protection.
- **Live Overview Metrics:** Total Paid Students, Confirmed Submissions, Pending Students, Completion Percentage, and Colour Breakdown.
- **Colour & Size Inventory Matrix:** Real-time cross-tabulation table (Size × Colour) for garment production ordering.
- **Student Register Management:** Search by name/index, filter by colour/size/status, add new paid students, and correct selections with full audit logging.
- **Pending Students Tracker:** Automatically compares paid register with submissions to list students who have not yet submitted, with one-click export.
- **Submission Availability Control:** Toggle student submissions **OPEN** or **CLOSED** in real time.
- **Comprehensive Reporting Suite:** Download registers and analytics in **Excel (.xlsx)**, **Word (.docx)**, **PDF**, and **CSV**.
- **Tamper-Evident Audit Logs:** Logs all administrative events, logins, setting changes, and edits.

---

## 🏗️ Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Tailwind CSS, Lucide Icons |
| **Backend** | Google Apps Script (V8 Runtime) |
| **Database** | Google Sheets (5 Worksheets) |
| **Communication** | `google.script.run` RPC with HTML Service |
| **Security** | Script Properties, LockService, HMAC Tokens |
| **Exports** | XLSX (Excel XML), DOCX, PDF, CSV |

---

## 📁 Repository Structure

```
itsu/
├── backend/
│   ├── Code.gs                   # Web App entry controller (doGet, routing)
│   ├── Authentication.gs         # Salted hashing, session management, lockout
│   ├── StudentVerification.gs    # Payment verification & expiring tokens
│   ├── SelectionManagement.gs    # Atomic submissions (LockService) & edits
│   ├── DashboardAnalytics.gs     # Live metrics, breakdown matrix, pending logic
│   ├── ReportGeneration.gs       # Report builders for Excel, Word, PDF, CSV
│   ├── SettingsManagement.gs     # Portal settings & OPEN/CLOSED switch
│   ├── AuditLogging.gs           # Security & administrative audit trail
│   ├── SpreadsheetUtilities.gs   # Sheet manipulation, row mapping, sanitization
│   ├── Setup.gs                  # One-click database & admin initializer
│   └── appsscript.json           # Apps Script manifest & permissions
├── frontend/
│   ├── Index.html                # Production single-file template for Apps Script
│   └── preview.html              # Standalone local testing file with mock backend
├── docs/
│   ├── DEPLOYMENT_GUIDE.md       # Step-by-step deployment instructions
│   └── SHEETS_STRUCTURE.md       # Detailed database schema and rules
└── README.md
```

---

## 🚀 Quick Start & Testing

### Option 1: Instant Local Browser Testing (No Setup Required)
1. Navigate to the `frontend/` folder.
2. Double-click [`preview.html`](file:///c:/Users/antho/OneDrive/Desktop/itsu/frontend/preview.html) in your browser.
3. Test student verification using sample registered students:
   - **Eligible Paid Student:** Full Name: `Anthony Maclean`, Index: `0721000001`
   - **Eligible Paid Student:** Full Name: `Kofi Mensah`, Index: `0721000002`
   - **Unpaid Student (Rejection test):** Full Name: `Benjamin Cudjoe`, Index: `0721000016`
4. Test Treasurer Login:
   - Click **Treasurer Portal** in the header or footer.
   - **Email:** `anthonymaclean100@gmail.com`
   - **Password:** `ITSU@Treasurer2026!`

### Option 2: Production Google Cloud Deployment
Follow the detailed instructions in [docs/DEPLOYMENT_GUIDE.md](file:///c:/Users/antho/OneDrive/Desktop/itsu/docs/DEPLOYMENT_GUIDE.md).

---

## 🛡️ Security Implementation Details

1. **Private Google Spreadsheet:** The database is not shared publicly. The Apps Script Web App executes as `Me (USER_DEPLOYING)`, allowing controlled access through backend functions only.
2. **Never Stored in Plaintext:** The Treasurer password is never written into Google Sheets or client-side code. It is stored as a SHA-256 salted hash inside Google Apps Script `ScriptProperties`.
3. **LockService Protection:** Simultaneous submissions from multiple students are serialized using `LockService.getScriptLock()` to prevent race conditions and duplicate selections.
4. **Expiring Signed Verification Tokens:** When a student verifies eligibility, the server generates a cryptographically signed HMAC-SHA256 token expiring in 30 minutes. Submissions must present a valid token.
5. **Brute Force Protection:** Login attempts are rate-limited. Exceeding 5 failed attempts triggers a 15-minute temporary administrative lockout.

---

## ✅ Acceptance Criteria Verification

- [x] **1. Paid Student Verification:** Paid students can verify eligibility with name & index number.
- [x] **2. Unpaid Student Rejection:** Unpaid students and unregistered index numbers are rejected.
- [x] **3. Colour Options:** Students can select Blue (Royal) or White.
- [x] **4. Size Options:** Students can select S, M, L, XL, XXL, or XXXL.
- [x] **5. Single Submission:** Duplicate submissions are strictly prevented on the server.
- [x] **6. Student Isolation:** Students cannot access the Treasurer dashboard or administrative records.
- [x] **7. Treasurer Authentication:** Treasurer logs in with `anthonymaclean100@gmail.com` and configured password.
- [x] **8. Server-Side Enforcement:** Every administrative function checks session tokens server-side.
- [x] **9. Live Statistics:** Real-time counts for paid students, submissions, pending students, and completion rate.
- [x] **10. Pending Students View:** Automatic comparison identifying paid students who have not yet submitted.
- [x] **11. Accurate Analytics:** Colour-by-size matrix and distribution charts update automatically.
- [x] **12. Submission Availability:** Treasurer can switch submissions between OPEN and CLOSED.
- [x] **13. Search and Filter:** Real-time search by name/index and filters by colour, size, and status.
- [x] **14. Multi-Format Reports:** Generates Excel (.xlsx), Word (.docx), PDF, and CSV downloads for all 7 reports.
- [x] **15. Security & Audit Trail:** All administrative operations are logged with timestamps and details.
- [x] **16. Mobile Responsive:** Interface adapts seamlessly to smartphones, tablets, and desktops.
- [x] **17. University Design System:** Minimalist blue-and-white theme with Inter typography and subtle borders.

