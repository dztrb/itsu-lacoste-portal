/**
 * ITSU LACOSTE VERIFICATION & COLLECTION PORTAL
 * Audit Logging Module
 * Takoradi Technical University - Department of Computer Science
 */

/**
 * Appends an entry to the AuditLogs sheet
 * @param {string} user - Email or student index number performing the action
 * @param {string} action - Short action code (e.g. LOGIN_SUCCESS, SUBMISSION_RECORDED, SETTINGS_UPDATED)
 * @param {string|object} details - Contextual details (sanitized, no sensitive secrets)
 * @param {string} status - 'SUCCESS', 'FAILED', 'INFO', 'WARNING'
 */
function logAudit(user, action, details, status) {
  try {
    const timestamp = Utilities.formatDate(new Date(), 'GMT', "yyyy-MM-dd'T'HH:mm:ss'Z'");
    const logId = 'LOG-' + Utilities.getUuid().substring(0, 8).toUpperCase();
    const detailsStr = typeof details === 'object' ? JSON.stringify(details) : String(details || '');
    
    // Safety check: ensure no password or secret leaks in logs
    const sanitizedDetails = detailsStr.replace(/("password"|"newPassword"|"token"|"sessionToken"):\s*".*?"/gi, '$1:"[REDACTED]"');
    
    appendRowToSheet(SHEET_NAMES.AUDIT_LOGS, [
      logId,
      timestamp,
      user || 'SYSTEM',
      action || 'UNKNOWN',
      sanitizedDetails,
      status || 'INFO'
    ]);
  } catch (err) {
    console.error('Failed to write audit log: ' + err.message);
  }
}

/**
 * Retrieves the most recent audit logs for the Treasurer dashboard
 * @param {string} sessionToken - Validated Treasurer session token
 * @return {Array<Object>} List of audit log records
 */
function getAuditLogs(sessionToken) {
  validateAdminSession(sessionToken); // Throws error if invalid session
  
  const rawLogs = getRowsAsObjects(SHEET_NAMES.AUDIT_LOGS);
  // Sort descending by timestamp / row
  return rawLogs.reverse().slice(0, 200).map(log => ({
    logId: log['Log ID'],
    timestamp: log['Timestamp'],
    user: log['User'],
    action: log['Action'],
    details: log['Details'],
    status: log['Status']
  }));
}

