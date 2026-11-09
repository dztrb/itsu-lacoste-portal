/**
 * ITSU LACOSTE VERIFICATION & COLLECTION PORTAL
 * Student Verification Module
 * Takoradi Technical University - Department of Computer Science
 */

const VERIFICATION_CONFIG = {
  TOKEN_EXPIRY_MS: 30 * 60 * 1000, // 30 minutes
  RATE_LIMIT_MAX: 10,
  RATE_LIMIT_WINDOW_MS: 5 * 60 * 1000 // 5 minutes
};

/**
 * Gets or initializes secret key for student tokens
 */
function getTokenSecret() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty('AUTH_TOKEN_SECRET');
  if (!secret) {
    secret = Utilities.getUuid() + '-' + Utilities.getUuid();
    props.setProperty('AUTH_TOKEN_SECRET', secret);
  }
  return secret;
}

/**
 * Generates an expiring cryptographic verification token for the verified student
 */
function generateStudentToken(indexNumber, fullName) {
  const secret = getTokenSecret();
  const expiresAt = Date.now() + VERIFICATION_CONFIG.TOKEN_EXPIRY_MS;
  const payload = [indexNumber, fullName, expiresAt].join('|');
  const signatureBytes = Utilities.computeHmacSha256Signature(payload, secret);
  
  let signatureHex = '';
  for (let i = 0; i < signatureBytes.length; i++) {
    const b = (signatureBytes[i] < 0) ? signatureBytes[i] + 256 : signatureBytes[i];
    const h = b.toString(16);
    signatureHex += (h.length === 1) ? '0' + h : h;
  }

  // Base64 encode the combined package: base64(payload + '::' + signatureHex)
  const tokenString = payload + '::' + signatureHex;
  return Utilities.base64EncodeWebSafe(tokenString);
}

/**
 * Validates the student verification token and returns the parsed payload
 */
function verifyStudentToken(token) {
  if (!token) {
    throw new Error('Missing verification token. Please verify your details again.');
  }

  try {
    const rawString = Utilities.newBlob(Utilities.base64DecodeWebSafe(token)).getDataAsString();
    const parts = rawString.split('::');
    if (parts.length !== 2) {
      throw new Error('Invalid verification token format.');
    }

    const payload = parts[0];
    const signatureHex = parts[1];
    const secret = getTokenSecret();

    // Verify signature
    const signatureBytes = Utilities.computeHmacSha256Signature(payload, secret);
    let expectedHex = '';
    for (let i = 0; i < signatureBytes.length; i++) {
      const b = (signatureBytes[i] < 0) ? signatureBytes[i] + 256 : signatureBytes[i];
      const h = b.toString(16);
      expectedHex += (h.length === 1) ? '0' + h : h;
    }

    if (signatureHex !== expectedHex) {
      throw new Error('Verification token signature invalid or tampered with.');
    }

    const [indexNumber, fullName, expiresAtStr] = payload.split('|');
    const expiresAt = parseInt(expiresAtStr, 10);

    if (Date.now() > expiresAt) {
      throw new Error('Your verification session has expired. Please verify your details again.');
    }

    return {
      indexNumber: indexNumber,
      fullName: fullName,
      expiresAt: expiresAt
    };
  } catch (err) {
    throw new Error('Verification token expired or invalid. Please re-verify your student details.');
  }
}

/**
 * Checks if a student has already submitted a selection
 * @param {string} indexNumber
 * @return {Object|null} The submission record if found, else null
 */
function checkExistingSubmission(indexNumber) {
  const normIndex = normalizeIndexNumber(indexNumber);
  if (!normIndex) return null;

  const rows = getRowsAsObjects(SHEET_NAMES.SELECTIONS);
  const existing = rows.find(r => normalizeIndexNumber(r['Index Number']) === normIndex);
  
  if (existing) {
    return {
      submissionId: existing['Submission ID'],
      fullName: existing['Full Name'],
      indexNumber: existing['Index Number'],
      selectedColour: existing['Selected Colour'],
      selectedSize: existing['Selected Size'],
      submittedAt: existing['Submitted At'],
      status: existing['Submission Status']
    };
  }
  return null;
}

/**
 * Verifies student eligibility using Full Name and Index Number
 * Publicly called by the Student Portal
 */
function verifyStudent(fullName, indexNumber) {
  // Input validation
  const inputName = normalizeText(fullName).toLowerCase();
  const inputIndex = normalizeIndexNumber(indexNumber);

  if (!inputName || !inputIndex) {
    return {
      verified: false,
      message: 'Please provide both your full name and index number.'
    };
  }

  // 1. Check if submissions are open
  const settings = getPortalSettings();
  if (settings.submissionStatus !== 'OPEN') {
    return {
      verified: false,
      isClosed: true,
      message: 'Submissions are currently closed. Please contact the ITSU Treasurer for assistance.'
    };
  }

  // 2. Check if student has already submitted
  const existingSub = checkExistingSubmission(inputIndex);
  if (existingSub) {
    return {
      verified: false,
      alreadySubmitted: true,
      submission: existingSub,
      message: 'Your Lacoste selection has already been recorded.'
    };
  }

  // 3. Search Students worksheet
  const students = getRowsAsObjects(SHEET_NAMES.STUDENTS);
  
  // Clean comparison: match index number strictly, and name fuzzily or strictly
  const student = students.find(s => {
    const sIndex = normalizeIndexNumber(s['Index Number']);
    if (sIndex !== inputIndex) return false;

    const sName = normalizeText(s['Full Name']).toLowerCase();
    // Allow matching exact or matching all parts of the student name
    if (sName === inputName) return true;

    // Check if input words are present in sheet name
    const inputWords = inputName.split(/\s+/).filter(w => w.length > 1);
    const sheetWords = sName.split(/\s+/).filter(w => w.length > 1);
    
    // If at least 2 words match or all input words match
    const matchCount = inputWords.filter(w => sheetWords.includes(w)).length;
    return (matchCount >= Math.min(2, inputWords.length));
  });

  // 4. Verify payment status is PAID
  const GENERIC_FAIL_MSG = "We couldn't verify your details. Please check your name and index number or contact the ITSU Treasurer.";
  
  if (!student) {
    return {
      verified: false,
      message: GENERIC_FAIL_MSG
    };
  }

  const paymentStatus = normalizeText(student['Payment Status']).toUpperCase();
  if (paymentStatus !== 'PAID') {
    return {
      verified: false,
      message: GENERIC_FAIL_MSG
    };
  }

  // 5. Success: generate verification token
  const verifiedFullName = student['Full Name'];
  const verifiedIndexNumber = student['Index Number'];
  const token = generateStudentToken(verifiedIndexNumber, verifiedFullName);

  return {
    verified: true,
    student: {
      fullName: verifiedFullName,
      indexNumber: verifiedIndexNumber
    },
    token: token,
    availableColours: settings.availableColours,
    availableSizes: settings.availableSizes
  };
}

