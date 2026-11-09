# Google Sheets Database Structure

**Project:** ITSU Lacoste Verification & Collection Portal  
**Institution:** Takoradi Technical University  
**Department:** Department of Computer Science  
**Student Body:** Information Technology Students Union (ITSU)

The database consists of a single Google Spreadsheet containing five (5) worksheets. All sheets are automatically created and styled with blue-and-white university administrative branding upon running `initializeDatabase()`.

---

## Sheet 1: `Students`
Stores the official register of department students and their departmental dues / Lacoste payment eligibility.

| Column | Data Type | Description | Constraints |
|---|---|---|---|
| **Full Name** | String | Registered student full name (e.g., `Anthony Maclean`) | Required |
| **Index Number** | String | Student institutional index number (e.g., `0721000001`) | Unique, Primary Key |
| **Payment Status** | String | Payment eligibility (`PAID` or `UNPAID`) | Must be `PAID` to submit |
| **Payment Reference** | String | Receipt number, bank voucher or MoMo reference | Auditing reference |
| **Date Added** | String / Date | Timestamp when student was enrolled in the register | Auto-generated |

> **Security Rule:** Only students with `Payment Status == 'PAID'` can verify and select a Lacoste shirt. Students cannot access or read this worksheet.

---

## Sheet 2: `Selections`
Stores confirmed Lacoste shirt preferences submitted by eligible students.

| Column | Data Type | Description | Constraints |
|---|---|---|---|
| **Submission ID** | String | Unique reference identifier (e.g., `ITSU-LAC-A1B2C3`) | Unique |
| **Full Name** | String | Verified student full name | Read-only from Students sheet |
| **Index Number** | String | Student institutional index number | Unique (1 submission per student) |
| **Selected Colour** | String | Chosen colour (`Blue` or `White`) | Validated against Settings |
| **Selected Size** | String | Chosen size (`S`, `M`, `L`, `XL`, `XXL`, `XXXL`) | Validated against Settings |
| **Submitted At** | String / Date | GMT timestamp of submission | Auto-generated |
| **Submission Status** | String | Status (`CONFIRMED` or `CORRECTED`) | Managed by system / Treasurer |

> **Data Integrity:** Protected by Google Apps Script `LockService` during concurrent writes to prevent duplicate submissions.

---

## Sheet 3: `Settings`
Key-value configuration store for portal operation.

| Key | Default Value | Description |
|---|---|---|
| `portal_name` | `ITSU Lacoste Verification & Collection Portal` | Display title on header and pages |
| `submission_status` | `OPEN` | Global status (`OPEN` or `CLOSED`) |
| `available_colours` | `Blue,White` | Comma-separated valid colours |
| `available_sizes` | `S,M,L,XL,XXL,XXXL` | Comma-separated valid sizes |
| `max_submissions_per_student` | `1` | Maximum submissions allowed |

---

## Sheet 4: `Admin`
Stores administrator account metadata and status.

| Column | Data Type | Description |
|---|---|---|
| **Email** | String | Authorized email (`anthonymaclean100@gmail.com`) |
| **Role** | String | Administrative role (`Treasurer`) |
| **MustChangePassword** | String | Boolean flag (`TRUE` on first login, `FALSE` after) |
| **CreatedAt** | String / Date | Account provisioning timestamp |
| **LastLogin** | String / Date | Timestamp of most recent successful session |

> **CRITICAL SECURITY NOTE:** Administrative passwords and cryptographic session secrets are **NEVER** stored in Google Sheets. They are hashed with a unique salt using SHA-256 and stored exclusively in Google Apps Script `ScriptProperties`.

---

## Sheet 5: `AuditLogs`
Immutable security and administrative audit log tracking critical actions.

| Column | Data Type | Description |
|---|---|---|
| **Log ID** | String | Unique identifier (e.g., `LOG-A1B2C3D4`) |
| **Timestamp** | String | ISO 8601 GMT timestamp |
| **User** | String | Actor email or student index number |
| **Action** | String | Event code (e.g., `LOGIN_SUCCESS`, `SUBMISSION_CONFIRMED`, `PASSWORD_CHANGED`) |
| **Details** | String / JSON | Sanitized details (passwords and tokens redacted) |
| **Status** | String | Event outcome (`SUCCESS`, `WARNING`, `FAILED`, `INFO`) |

