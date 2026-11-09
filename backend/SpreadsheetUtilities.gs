/**
 * ITSU LACOSTE VERIFICATION & COLLECTION PORTAL
 * Spreadsheet Utilities Module
 * Takoradi Technical University - Department of Computer Science
 */

const SHEET_NAMES = {
  STUDENTS: 'Students',
  SELECTIONS: 'Selections',
  SETTINGS: 'Settings',
  ADMIN: 'Admin',
  AUDIT_LOGS: 'AuditLogs'
};

const SHEET_HEADERS = {
  [SHEET_NAMES.STUDENTS]: ['Full Name', 'Index Number', 'Payment Status', 'Payment Reference', 'Date Added'],
  [SHEET_NAMES.SELECTIONS]: ['Submission ID', 'Full Name', 'Index Number', 'Selected Colour', 'Selected Size', 'Submitted At', 'Submission Status'],
  [SHEET_NAMES.SETTINGS]: ['Key', 'Value', 'Description', 'Last Updated'],
  [SHEET_NAMES.ADMIN]: ['Email', 'Role', 'MustChangePassword', 'CreatedAt', 'LastLogin'],
  [SHEET_NAMES.AUDIT_LOGS]: ['Log ID', 'Timestamp', 'User', 'Action', 'Details', 'Status']
};

/**
 * Returns the active spreadsheet or binds to spreadsheet specified in Script Properties
 * @return {GoogleAppsScript.Spreadsheet.Spreadsheet}
 */
function getSpreadsheet() {
  try {
    const props = PropertiesService.getScriptProperties();
    const sheetId = props.getProperty('SPREADSHEET_ID');
    if (sheetId && sheetId.trim() !== '') {
      return SpreadsheetApp.openById(sheetId.trim());
    }
  } catch (e) {
    console.warn('Could not open spreadsheet by ID, falling back to active spreadsheet: ' + e.message);
  }
  
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  
  throw new Error('Spreadsheet not bound. Please run initializeDatabase() or set SPREADSHEET_ID in Script Properties.');
}

/**
 * Normalizes strings by trimming and converting to consistent casing
 */
function normalizeText(text) {
  if (text === null || text === undefined) return '';
  return String(text).trim();
}

/**
 * Normalizes index numbers (uppercase, no whitespace)
 */
function normalizeIndexNumber(indexNumber) {
  if (!indexNumber) return '';
  return String(indexNumber).trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * Safely gets a sheet by name or creates it with default headers if not present
 */
function getOrCreateSheet(sheetName) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    const headers = SHEET_HEADERS[sheetName];
    if (headers && headers.length > 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#F1F5F9');
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

/**
 * Reads all rows from a sheet as an array of JavaScript objects mapped by header names
 */
function getRowsAsObjects(sheetName) {
  const sheet = getOrCreateSheet(sheetName);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  
  if (lastRow < 2 || lastCol < 1) return [];
  
  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = values[0].map(h => normalizeText(h));
  const rows = [];
  
  for (let i = 1; i < values.length; i++) {
    const rowObj = { _rowIndex: i + 1 }; // 1-based index in sheet
    let hasData = false;
    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      const cellValue = values[i][j];
      rowObj[header] = cellValue !== undefined ? cellValue : '';
      if (cellValue !== '' && cellValue !== null && cellValue !== undefined) {
        hasData = true;
      }
    }
    if (hasData) {
      rows.push(rowObj);
    }
  }
  return rows;
}

/**
 * Appends a row of values to the specified sheet
 */
function appendRowToSheet(sheetName, rowArray) {
  const sheet = getOrCreateSheet(sheetName);
  sheet.appendRow(rowArray);
}

/**
 * Updates a row matching a search column value
 */
function updateRowByColumn(sheetName, searchColIndex, searchValue, updateMap) {
  const sheet = getOrCreateSheet(sheetName);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) return false;
  
  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = values[0];
  const targetVal = String(searchValue).trim().toLowerCase();
  
  for (let r = 1; r < values.length; r++) {
    const cellVal = String(values[r][searchColIndex - 1]).trim().toLowerCase();
    if (cellVal === targetVal) {
      for (const [colName, newVal] of Object.entries(updateMap)) {
        const colIdx = headers.indexOf(colName);
        if (colIdx !== -1) {
          sheet.getRange(r + 1, colIdx + 1).setValue(newVal);
        }
      }
      return true;
    }
  }
  return false;
}

/**
 * Deletes a row matching a search column value
 */
function deleteRowByColumn(sheetName, searchColIndex, searchValue) {
  const sheet = getOrCreateSheet(sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  
  const values = sheet.getRange(1, searchColIndex, lastRow, 1).getValues();
  const targetVal = String(searchValue).trim().toLowerCase();
  
  for (let r = values.length - 1; r >= 1; r--) {
    const cellVal = String(values[r][0]).trim().toLowerCase();
    if (cellVal === targetVal) {
      sheet.deleteRow(r + 1);
      return true;
    }
  }
  return false;
}

