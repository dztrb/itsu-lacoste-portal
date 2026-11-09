/**
 * ITSU LACOSTE VERIFICATION & COLLECTION PORTAL
 * Setup & Database Initialization Module
 * Takoradi Technical University - Department of Computer Science
 */

/**
 * Run this function ONCE from the Apps Script editor to initialize the entire system.
 * Creates all worksheets, configures headers, populates settings, sets up admin credentials,
 * and inserts realistic student records for Takoradi Technical University.
 */
function initializeDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('Please open this script container-bound to a Google Spreadsheet.');
  }

  // 1. Ensure all sheets exist with headers
  Object.keys(SHEET_HEADERS).forEach(name => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
    }
    
    // Check if headers exist
    if (sheet.getLastRow() === 0) {
      const headers = SHEET_HEADERS[name];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length)
        .setBackground('#1E3A8A')
        .setFontColor('#FFFFFF')
        .setFontWeight('bold')
        .setFontFamily('Inter');
      sheet.setFrozenRows(1);
    }
  });

  // Remove default "Sheet1" if empty and others exist
  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1 && defaultSheet.getLastRow() === 0) {
    try { ss.deleteSheet(defaultSheet); } catch (e) {}
  }

  // 2. Populate Default Settings if empty
  const settingsSheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  if (settingsSheet.getLastRow() <= 1) {
    const defaultSettingsRows = [
      ['portal_name', 'ITSU Lacoste Verification & Collection Portal', 'Portal display title', new Date()],
      ['submission_status', 'OPEN', 'Status: OPEN or CLOSED', new Date()],
      ['available_colours', 'Blue,White', 'Comma-separated colours', new Date()],
      ['available_sizes', 'S,M,L,XL,XXL,XXXL', 'Comma-separated sizes', new Date()],
      ['max_submissions_per_student', '1', 'Max submissions allowed per student', new Date()]
    ];
    settingsSheet.getRange(2, 1, defaultSettingsRows.length, 4).setValues(defaultSettingsRows);
  }

  // 3. Populate Sample Takoradi Technical University Computer Science Students if Students sheet is empty
  const studentsSheet = ss.getSheetByName(SHEET_NAMES.STUDENTS);
  if (studentsSheet.getLastRow() <= 1) {
    const sampleStudents = [
      ['Anthony Maclean', '0721000001', 'PAID', 'REF-CS-2026-001', new Date()],
      ['Kofi Mensah', '0721000002', 'PAID', 'REF-CS-2026-002', new Date()],
      ['Ama Serwaa', '0721000003', 'PAID', 'REF-CS-2026-003', new Date()],
      ['Kwame Owusu', '0721000004', 'PAID', 'REF-CS-2026-004', new Date()],
      ['Abena Osei', '0721000005', 'PAID', 'REF-CS-2026-005', new Date()],
      ['Yaw Boakye', '0721000006', 'PAID', 'REF-CS-2026-006', new Date()],
      ['Akosua Boateng', '0721000007', 'PAID', 'REF-CS-2026-007', new Date()],
      ['Emmanuel Frimpong', '0721000008', 'PAID', 'REF-CS-2026-008', new Date()],
      ['Priscilla Darko', '0721000009', 'PAID', 'REF-CS-2026-009', new Date()],
      ['Samuel Appiah', '0721000010', 'PAID', 'REF-CS-2026-010', new Date()],
      ['Grace Addo', '0721000011', 'PAID', 'REF-CS-2026-011', new Date()],
      ['Michael Quaye', '0721000012', 'PAID', 'REF-CS-2026-012', new Date()],
      ['Eunice Mensah', '0721000013', 'PAID', 'REF-CS-2026-013', new Date()],
      ['Josephine Tetteh', '0721000014', 'PAID', 'REF-CS-2026-014', new Date()],
      ['Daniel Arthur', '0721000015', 'PAID', 'REF-CS-2026-015', new Date()],
      ['Benjamin Cudjoe', '0721000016', 'UNPAID', 'PENDING', new Date()],
      ['Sarah Mensah', '0721000017', 'UNPAID', 'PENDING', new Date()]
    ];
    studentsSheet.getRange(2, 1, sampleStudents.length, 5).setValues(sampleStudents);
  }

  // 4. Populate initial selections for demonstration if empty
  const selectionsSheet = ss.getSheetByName(SHEET_NAMES.SELECTIONS);
  if (selectionsSheet.getLastRow() <= 1) {
    const sampleSelections = [
      ['ITSU-LAC-A1B2C3', 'Anthony Maclean', '0721000001', 'Blue', 'L', new Date(), 'CONFIRMED'],
      ['ITSU-LAC-D4E5F6', 'Kofi Mensah', '0721000002', 'White', 'XL', new Date(), 'CONFIRMED'],
      ['ITSU-LAC-G7H8I9', 'Ama Serwaa', '0721000003', 'Blue', 'M', new Date(), 'CONFIRMED'],
      ['ITSU-LAC-J1K2L3', 'Kwame Owusu', '0721000004', 'Blue', 'XXL', new Date(), 'CONFIRMED'],
      ['ITSU-LAC-M4N5O6', 'Abena Osei', '0721000005', 'White', 'S', new Date(), 'CONFIRMED']
    ];
    selectionsSheet.getRange(2, 1, sampleSelections.length, 7).setValues(sampleSelections);
  }

  // 5. Populate Admin sheet metadata
  const adminSheet = ss.getSheetByName(SHEET_NAMES.ADMIN);
  if (adminSheet.getLastRow() <= 1) {
    adminSheet.getRange(2, 1, 1, 5).setValues([[
      AUTH_CONFIG.AUTHORIZED_EMAIL,
      'Treasurer',
      'TRUE',
      new Date(),
      '-'
    ]]);
  }

  // 6. Initialize Secure Script Properties for Admin Authentication
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SPREADSHEET_ID', ss.getId());

  // Generate Salt and Hash for default initial password: "ITSU2026"
  const initialPassword = 'ITSU2026';
  const salt = Utilities.getUuid();
  const hash = hashPassword(initialPassword, salt);

  props.setProperty('AUTH_PASSWORD_SALT', salt);
  props.setProperty('AUTH_PASSWORD_HASH', hash);
  props.setProperty('AUTH_MUST_CHANGE_PASSWORD', 'true');
  props.setProperty('AUTH_LOGIN_ATTEMPTS', JSON.stringify({ count: 0, lockedUntil: 0 }));
  props.setProperty('AUTH_ACTIVE_SESSIONS', JSON.stringify({}));
  props.setProperty('AUTH_TOKEN_SECRET', Utilities.getUuid() + '-' + Utilities.getUuid());

  // Log setup completion
  logAudit(AUTH_CONFIG.AUTHORIZED_EMAIL, 'SYSTEM_INITIALIZED', 'Database structure, default settings, and admin properties successfully initialized', 'SUCCESS');

  console.log('✅ ITSU Portal database initialized successfully!');
  console.log('Authorized Treasurer Email: ' + AUTH_CONFIG.AUTHORIZED_EMAIL);
  console.log('Initial Temporary Password: ' + initialPassword);
  console.log('Note: The Treasurer will be prompted to change this password on first login.');
}

