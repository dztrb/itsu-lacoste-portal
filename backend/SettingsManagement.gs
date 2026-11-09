/**
 * ITSU LACOSTE VERIFICATION & COLLECTION PORTAL
 * Settings Management Module
 * Takoradi Technical University - Department of Computer Science
 */

const DEFAULT_SETTINGS = {
  portal_name: 'ITSU Lacoste Verification & Collection Portal',
  submission_status: 'OPEN',
  available_colours: 'Blue,White',
  available_sizes: 'S,M,L,XL,XXL,XXXL',
  max_submissions_per_student: '1'
};

/**
 * Public function to retrieve current portal settings
 * Safe for student portal consumption
 */
function getPortalSettings() {
  try {
    const rows = getRowsAsObjects(SHEET_NAMES.SETTINGS);
    const settings = Object.assign({}, DEFAULT_SETTINGS);

    rows.forEach(r => {
      const key = (r['Key'] || '').trim();
      const val = (r['Value'] || '').trim();
      if (key) {
        settings[key] = val;
      }
    });

    return {
      portalName: settings.portal_name,
      submissionStatus: settings.submission_status, // 'OPEN' or 'CLOSED'
      availableColours: settings.available_colours.split(',').map(c => c.trim()).filter(Boolean),
      availableSizes: settings.available_sizes.split(',').map(s => s.trim()).filter(Boolean),
      maxSubmissions: parseInt(settings.max_submissions_per_student, 10) || 1
    };
  } catch (err) {
    console.warn('Could not read settings sheet, falling back to defaults: ' + err.message);
    return {
      portalName: DEFAULT_SETTINGS.portal_name,
      submissionStatus: DEFAULT_SETTINGS.submission_status,
      availableColours: ['Blue', 'White'],
      availableSizes: ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
      maxSubmissions: 1
    };
  }
}

/**
 * Updates portal settings (Treasurer authenticated)
 */
function updatePortalSettings(sessionToken, newSettings) {
  const session = validateAdminSession(sessionToken);

  const sheet = getOrCreateSheet(SHEET_NAMES.SETTINGS);
  const rows = getRowsAsObjects(SHEET_NAMES.SETTINGS);
  const timestamp = Utilities.formatDate(new Date(), 'GMT', "yyyy-MM-dd'T'HH:mm:ss'Z'");

  const updateKey = (key, value, desc) => {
    const existing = rows.find(r => (r['Key'] || '').trim() === key);
    if (existing) {
      updateRowByColumn(SHEET_NAMES.SETTINGS, 1, key, {
        'Value': value,
        'Last Updated': timestamp
      });
    } else {
      appendRowToSheet(SHEET_NAMES.SETTINGS, [key, value, desc, timestamp]);
    }
  };

  if (newSettings.portalName) {
    updateKey('portal_name', newSettings.portalName, 'Portal display title');
  }
  if (newSettings.submissionStatus) {
    const status = newSettings.submissionStatus.toUpperCase() === 'CLOSED' ? 'CLOSED' : 'OPEN';
    updateKey('submission_status', status, 'Global submission availability');
  }
  if (newSettings.availableColours) {
    const cols = Array.isArray(newSettings.availableColours) ? newSettings.availableColours.join(',') : newSettings.availableColours;
    updateKey('available_colours', cols, 'Comma-separated available colours');
  }
  if (newSettings.availableSizes) {
    const sizes = Array.isArray(newSettings.availableSizes) ? newSettings.availableSizes.join(',') : newSettings.availableSizes;
    updateKey('available_sizes', sizes, 'Comma-separated available sizes');
  }

  logAudit(session.email, 'SETTINGS_UPDATED', newSettings, 'SUCCESS');
  return { success: true, settings: getPortalSettings() };
}

/**
 * Quick toggle for submission status (OPEN / CLOSED)
 */
function setSubmissionStatus(sessionToken, status) {
  const session = validateAdminSession(sessionToken);
  const normalizedStatus = (status || '').toUpperCase() === 'CLOSED' ? 'CLOSED' : 'OPEN';

  const timestamp = Utilities.formatDate(new Date(), 'GMT', "yyyy-MM-dd'T'HH:mm:ss'Z'");
  updateRowByColumn(SHEET_NAMES.SETTINGS, 1, 'submission_status', {
    'Value': normalizedStatus,
    'Last Updated': timestamp
  });

  logAudit(session.email, 'SUBMISSION_STATUS_CHANGED', `Submission status set to ${normalizedStatus}`, 'SUCCESS');

  return { success: true, submissionStatus: normalizedStatus };
}

