/**
 * ITSU LACOSTE VERIFICATION & COLLECTION PORTAL
 * Selection Management Module
 * Takoradi Technical University - Department of Computer Science
 */

/**
 * Submits student's Lacoste colour and size preference
 * Publicly called from Student Portal with valid verification token
 * Protected by LockService to guarantee duplicate prevention under concurrent requests
 */
function submitSelection(studentToken, colour, size) {
  // Validate token before acquiring lock to minimize lock contention
  const verifiedStudent = verifyStudentToken(studentToken);
  const targetIndex = normalizeIndexNumber(verifiedStudent.indexNumber);

  // Validate inputs
  const selectedColour = normalizeText(colour);
  const selectedSize = normalizeText(size).toUpperCase();

  const lock = LockService.getScriptLock();
  try {
    // Wait up to 15 seconds to acquire lock
    lock.waitLock(15000);
  } catch (e) {
    throw new Error('High server activity. Please try submitting again in a moment.');
  }

  try {
    // 1. Recheck if submissions are OPEN
    const settings = getPortalSettings();
    if (settings.submissionStatus !== 'OPEN') {
      throw new Error('Submissions are currently closed. Please contact the ITSU Treasurer for assistance.');
    }

    // 2. Validate selected colour and size against allowed values
    if (!settings.availableColours.includes(selectedColour)) {
      throw new Error(`Selected colour "${selectedColour}" is not valid. Allowed colours: ${settings.availableColours.join(', ')}.`);
    }
    if (!settings.availableSizes.includes(selectedSize)) {
      throw new Error(`Selected size "${selectedSize}" is not valid. Allowed sizes: ${settings.availableSizes.join(', ')}.`);
    }

    // 3. Recheck student payment status in Students worksheet
    const students = getRowsAsObjects(SHEET_NAMES.STUDENTS);
    const student = students.find(s => normalizeIndexNumber(s['Index Number']) === targetIndex);
    if (!student || normalizeText(student['Payment Status']).toUpperCase() !== 'PAID') {
      throw new Error("We couldn't verify your details. Please check your name and index number or contact the ITSU Treasurer.");
    }

    // 4. Duplicate submission check
    const existing = checkExistingSubmission(targetIndex);
    if (existing) {
      throw new Error('Your Lacoste selection has already been recorded.');
    }

    // 5. Generate unique submission ID
    const randomHex = Utilities.getUuid().replace(/-/g, '').substring(0, 6).toUpperCase();
    const submissionId = 'ITSU-LAC-' + randomHex;
    const submittedAt = Utilities.formatDate(new Date(), 'GMT', "yyyy-MM-dd'T'HH:mm:ss'Z'");

    // 6. Write to Selections worksheet
    appendRowToSheet(SHEET_NAMES.SELECTIONS, [
      submissionId,
      student['Full Name'],
      student['Index Number'],
      selectedColour,
      selectedSize,
      submittedAt,
      'CONFIRMED'
    ]);

    // 7. Audit log
    logAudit(student['Index Number'], 'SUBMISSION_CONFIRMED', {
      submissionId: submissionId,
      colour: selectedColour,
      size: selectedSize
    }, 'SUCCESS');

    return {
      success: true,
      submissionId: submissionId,
      fullName: student['Full Name'],
      indexNumber: student['Index Number'],
      selectedColour: selectedColour,
      selectedSize: selectedSize,
      submittedAt: submittedAt,
      message: 'Your Lacoste selection has been submitted successfully.'
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Adds a new paid student to the register (Treasurer only)
 */
function addPaidStudent(sessionToken, studentData) {
  const session = validateAdminSession(sessionToken);

  const fullName = normalizeText(studentData.fullName);
  const indexNumber = normalizeIndexNumber(studentData.indexNumber);
  const paymentStatus = normalizeText(studentData.paymentStatus || 'PAID').toUpperCase();
  const paymentReference = normalizeText(studentData.paymentReference || 'MANUAL-' + Utilities.getUuid().substring(0, 6).toUpperCase());
  const dateAdded = Utilities.formatDate(new Date(), 'GMT', "yyyy-MM-dd'T'HH:mm:ss'Z'");

  if (!fullName || !indexNumber) {
    throw new Error('Full Name and Index Number are required.');
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    throw new Error('Server busy. Please try again.');
  }

  try {
    const students = getRowsAsObjects(SHEET_NAMES.STUDENTS);
    const exists = students.some(s => normalizeIndexNumber(s['Index Number']) === indexNumber);
    if (exists) {
      throw new Error(`Student with Index Number "${indexNumber}" already exists in the register.`);
    }

    appendRowToSheet(SHEET_NAMES.STUDENTS, [
      fullName,
      indexNumber,
      paymentStatus,
      paymentReference,
      dateAdded
    ]);

    logAudit(session.email, 'STUDENT_ADDED', { fullName, indexNumber, paymentStatus }, 'SUCCESS');

    return {
      success: true,
      student: { fullName, indexNumber, paymentStatus, paymentReference, dateAdded }
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Updates a student's payment status (Treasurer only)
 */
function updateStudentPaymentStatus(sessionToken, indexNumber, newStatus) {
  const session = validateAdminSession(sessionToken);
  const normIndex = normalizeIndexNumber(indexNumber);
  const status = normalizeText(newStatus).toUpperCase();

  const success = updateRowByColumn(SHEET_NAMES.STUDENTS, 2, normIndex, {
    'Payment Status': status
  });

  if (!success) {
    throw new Error(`Student with Index Number ${indexNumber} not found.`);
  }

  logAudit(session.email, 'PAYMENT_STATUS_UPDATED', { indexNumber: normIndex, newStatus: status }, 'SUCCESS');
  return { success: true };
}

/**
 * Updates or corrects a student's selection (Treasurer only)
 */
function updateStudentSelection(sessionToken, indexNumber, selection) {
  const session = validateAdminSession(sessionToken);
  const normIndex = normalizeIndexNumber(indexNumber);

  const colour = normalizeText(selection.colour);
  const size = normalizeText(selection.size).toUpperCase();
  const reason = normalizeText(selection.reason || 'Treasurer Administrative Correction');

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    throw new Error('Server busy. Please try again.');
  }

  try {
    const existing = checkExistingSubmission(normIndex);
    const timestamp = Utilities.formatDate(new Date(), 'GMT', "yyyy-MM-dd'T'HH:mm:ss'Z'");

    if (existing) {
      // Update existing selection
      const success = updateRowByColumn(SHEET_NAMES.SELECTIONS, 3, normIndex, {
        'Selected Colour': colour,
        'Selected Size': size,
        'Submission Status': 'CORRECTED',
        'Submitted At': timestamp + ' (Admin Edit)'
      });

      if (!success) throw new Error('Could not update selection record.');
    } else {
      // Find student name to create new selection
      const students = getRowsAsObjects(SHEET_NAMES.STUDENTS);
      const student = students.find(s => normalizeIndexNumber(s['Index Number']) === normIndex);
      if (!student) throw new Error(`Student with Index Number ${normIndex} not found in register.`);

      const subId = 'ITSU-LAC-ADM-' + Utilities.getUuid().substring(0, 6).toUpperCase();
      appendRowToSheet(SHEET_NAMES.SELECTIONS, [
        subId,
        student['Full Name'],
        student['Index Number'],
        colour,
        size,
        timestamp,
        'CONFIRMED (Admin)'
      ]);
    }

    logAudit(session.email, 'SELECTION_CORRECTED', {
      indexNumber: normIndex,
      colour: colour,
      size: size,
      reason: reason
    }, 'SUCCESS');

    return { success: true, message: 'Selection updated successfully.' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Resets or deletes a student selection so they can submit again (Treasurer only)
 */
function deleteStudentSelection(sessionToken, indexNumber, reason) {
  const session = validateAdminSession(sessionToken);
  const normIndex = normalizeIndexNumber(indexNumber);

  const success = deleteRowByColumn(SHEET_NAMES.SELECTIONS, 3, normIndex);
  if (!success) {
    throw new Error(`No selection record found for student ${indexNumber}.`);
  }

  logAudit(session.email, 'SELECTION_RESET', {
    indexNumber: normIndex,
    reason: reason || 'Selection reset by Treasurer'
  }, 'WARNING');

  return { success: true, message: 'Selection record reset successfully.' };
}

