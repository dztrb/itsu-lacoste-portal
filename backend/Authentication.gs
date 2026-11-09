/**
 * ITSU LACOSTE VERIFICATION & COLLECTION PORTAL
 * Authentication Module
 * Takoradi Technical University - Department of Computer Science
 */

const AUTH_CONFIG = {
  AUTHORIZED_EMAIL: 'anthonymaclean100@gmail.com',
  SESSION_DURATION_MS: 4 * 60 * 60 * 1000, // 4 hours
  MAX_FAILED_ATTEMPTS: 5,
  LOCKOUT_DURATION_MS: 15 * 60 * 1000 // 15 minutes
};

/**
 * Computes SHA-256 hash with salt
 * @param {string} password
 * @param {string} salt
 * @return {string} Hex encoded hash
 */
function hashPassword(password, salt) {
  const salted = password + salt;
  const rawBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salted, Utilities.Charset.UTF_8);
  let hexString = '';
  for (let i = 0; i < rawBytes.length; i++) {
    const byteVal = (rawBytes[i] < 0) ? rawBytes[i] + 256 : rawBytes[i];
    const hex = byteVal.toString(16);
    hexString += (hex.length === 1) ? '0' + hex : hex;
  }
  return hexString;
}

/**
 * Authenticates the Treasurer with email and password
 * Enforces rate limiting, lockout, session creation, and must-change-password flag
 */
function adminLogin(email, password) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    throw new Error('Server busy. Please try again in a few moments.');
  }

  try {
    const props = PropertiesService.getScriptProperties();
    const normalizedEmail = (email || '').trim().toLowerCase();
    
    // Check lockout status
    const attemptsJson = props.getProperty('AUTH_LOGIN_ATTEMPTS') || '{"count":0,"lockedUntil":0}';
    const attempts = JSON.parse(attemptsJson);
    const now = Date.now();
    
    if (attempts.lockedUntil && now < attempts.lockedUntil) {
      const waitMinutes = Math.ceil((attempts.lockedUntil - now) / (60 * 1000));
      logAudit(normalizedEmail, 'LOGIN_LOCKED', `Account locked out for ${waitMinutes} more minutes`, 'WARNING');
      throw new Error(`Account is temporarily locked due to repeated failed attempts. Please try again in ${waitMinutes} minute(s).`);
    }

    // Verify email matches authorized Treasurer email
    if (normalizedEmail !== AUTH_CONFIG.AUTHORIZED_EMAIL.toLowerCase()) {
      recordFailedLogin(props, attempts);
      logAudit(normalizedEmail, 'LOGIN_FAILED', 'Unauthorized email address attempted login', 'WARNING');
      throw new Error('Invalid email or password.');
    }

    // Verify password hash
    const storedHash = props.getProperty('AUTH_PASSWORD_HASH');
    const salt = props.getProperty('AUTH_PASSWORD_SALT');
    
    if (!storedHash || !salt) {
      throw new Error('Authentication is not yet initialized. Please run initializeDatabase() from Apps Script.');
    }

    const computedHash = hashPassword(password, salt);
    if (computedHash !== storedHash) {
      recordFailedLogin(props, attempts);
      logAudit(normalizedEmail, 'LOGIN_FAILED', 'Incorrect password entered', 'WARNING');
      throw new Error('Invalid email or password.');
    }

    // Login successful: reset failed attempts
    props.setProperty('AUTH_LOGIN_ATTEMPTS', JSON.stringify({ count: 0, lockedUntil: 0 }));

    // Generate random unpredictable session token
    const sessionToken = Utilities.getUuid() + '-' + Utilities.getUuid();
    const expiresAt = now + AUTH_CONFIG.SESSION_DURATION_MS;

    // Load active sessions
    const sessionsJson = props.getProperty('AUTH_ACTIVE_SESSIONS') || '{}';
    const sessions = JSON.parse(sessionsJson);

    // Clean expired sessions
    for (const token in sessions) {
      if (sessions[token].expiresAt < now) {
        delete sessions[token];
      }
    }

    const mustChangePassword = props.getProperty('AUTH_MUST_CHANGE_PASSWORD') === 'true';

    sessions[sessionToken] = {
      email: normalizedEmail,
      createdAt: now,
      expiresAt: expiresAt,
      mustChangePassword: mustChangePassword
    };

    props.setProperty('AUTH_ACTIVE_SESSIONS', JSON.stringify(sessions));

    // Update Admin sheet metadata
    try {
      updateRowByColumn(SHEET_NAMES.ADMIN, 1, normalizedEmail, {
        'LastLogin': Utilities.formatDate(new Date(), 'GMT', "yyyy-MM-dd'T'HH:mm:ss'Z'")
      });
    } catch (e) {
      console.warn('Could not update last login date in Admin sheet: ' + e.message);
    }

    logAudit(normalizedEmail, 'LOGIN_SUCCESS', 'Treasurer logged in successfully', 'SUCCESS');

    return {
      success: true,
      sessionToken: sessionToken,
      email: normalizedEmail,
      mustChangePassword: mustChangePassword,
      expiresAt: expiresAt
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Records a failed login attempt and locks account if threshold exceeded
 */
function recordFailedLogin(props, attempts) {
  attempts.count = (attempts.count || 0) + 1;
  if (attempts.count >= AUTH_CONFIG.MAX_FAILED_ATTEMPTS) {
    attempts.lockedUntil = Date.now() + AUTH_CONFIG.LOCKOUT_DURATION_MS;
  }
  props.setProperty('AUTH_LOGIN_ATTEMPTS', JSON.stringify(attempts));
}

/**
 * Validates the admin session token
 * Throws an Error if invalid or expired
 * @param {string} sessionToken
 * @return {Object} Session info
 */
function validateAdminSession(sessionToken) {
  if (!sessionToken || typeof sessionToken !== 'string') {
    throw new Error('Authentication required. Missing session token.');
  }

  const props = PropertiesService.getScriptProperties();
  const sessionsJson = props.getProperty('AUTH_ACTIVE_SESSIONS') || '{}';
  const sessions = JSON.parse(sessionsJson);

  const session = sessions[sessionToken];
  if (!session) {
    throw new Error('Session invalid or expired. Please sign in again.');
  }

  const now = Date.now();
  if (session.expiresAt < now) {
    delete sessions[sessionToken];
    props.setProperty('AUTH_ACTIVE_SESSIONS', JSON.stringify(sessions));
    throw new Error('Your session has expired. Please sign in again.');
  }

  // Slide expiry window if active
  session.expiresAt = now + AUTH_CONFIG.SESSION_DURATION_MS;
  props.setProperty('AUTH_ACTIVE_SESSIONS', JSON.stringify(sessions));

  return session;
}

/**
 * Logs out the administrator by revoking session token
 */
function adminLogout(sessionToken) {
  if (!sessionToken) return { success: true };

  const props = PropertiesService.getScriptProperties();
  const sessionsJson = props.getProperty('AUTH_ACTIVE_SESSIONS') || '{}';
  const sessions = JSON.parse(sessionsJson);

  if (sessions[sessionToken]) {
    const user = sessions[sessionToken].email;
    delete sessions[sessionToken];
    props.setProperty('AUTH_ACTIVE_SESSIONS', JSON.stringify(sessions));
    logAudit(user, 'LOGOUT', 'Treasurer logged out', 'INFO');
  }

  return { success: true };
}

/**
 * Changes administrator password securely
 * Supports both changeAdminPassword(sessionToken, newPassword) and
 * changeAdminPassword(sessionToken, currentPassword, newPassword)
 */
function changeAdminPassword(sessionToken, arg2, arg3) {
  const session = validateAdminSession(sessionToken);

  let currentPassword = null;
  let newPassword = null;

  if (arg3 !== undefined) {
    currentPassword = arg2;
    newPassword = arg3;
  } else {
    newPassword = arg2;
  }

  if (!newPassword || newPassword.length < 8) {
    throw new Error('New password must be at least 8 characters long.');
  }

  const props = PropertiesService.getScriptProperties();
  const storedHash = props.getProperty('AUTH_PASSWORD_HASH');
  const salt = props.getProperty('AUTH_PASSWORD_SALT');

  // If current password was provided, verify it
  if (currentPassword) {
    if (hashPassword(currentPassword, salt) !== storedHash) {
      logAudit(session.email, 'PASSWORD_CHANGE_FAILED', 'Incorrect current password provided', 'WARNING');
      throw new Error('Current password is incorrect.');
    }
  }

  // Create new salt and hash
  const newSalt = Utilities.getUuid();
  const newHash = hashPassword(newPassword, newSalt);

  props.setProperty('AUTH_PASSWORD_SALT', newSalt);
  props.setProperty('AUTH_PASSWORD_HASH', newHash);
  props.setProperty('AUTH_MUST_CHANGE_PASSWORD', 'false');

  // Update session flag
  const sessionsJson = props.getProperty('AUTH_ACTIVE_SESSIONS') || '{}';
  const sessions = JSON.parse(sessionsJson);
  if (sessions[sessionToken]) {
    sessions[sessionToken].mustChangePassword = false;
    props.setProperty('AUTH_ACTIVE_SESSIONS', JSON.stringify(sessions));
  }

  // Update Admin sheet
  try {
    updateRowByColumn(SHEET_NAMES.ADMIN, 1, session.email, {
      'MustChangePassword': 'FALSE'
    });
  } catch (e) {
    console.warn('Could not update MustChangePassword in Admin sheet: ' + e.message);
  }

  logAudit(session.email, 'PASSWORD_CHANGED', 'Treasurer successfully updated administrative password', 'SUCCESS');

  return { success: true, message: 'Password updated successfully.' };
}

