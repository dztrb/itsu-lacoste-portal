/**
 * ITSU LACOSTE VERIFICATION & COLLECTION PORTAL
 * Dashboard & Analytics Module
 * Takoradi Technical University - Department of Computer Science
 */

/**
 * Computes live metrics and distribution analytics for Treasurer dashboard
 */
function getDashboardStats(sessionToken) {
  validateAdminSession(sessionToken);

  const students = getRowsAsObjects(SHEET_NAMES.STUDENTS);
  const selections = getRowsAsObjects(SHEET_NAMES.SELECTIONS);
  const settings = getPortalSettings();

  // Filter only PAID students
  const paidStudents = students.filter(s => normalizeText(s['Payment Status']).toUpperCase() === 'PAID');
  const totalPaid = paidStudents.length;

  // Map of submitted index numbers
  const selectionMap = new Map();
  selections.forEach(sel => {
    const idx = normalizeIndexNumber(sel['Index Number']);
    if (idx) {
      selectionMap.set(idx, sel);
    }
  });

  const totalSubmissions = selections.length;
  const pendingCount = Math.max(0, totalPaid - totalSubmissions);
  const completionPercentage = totalPaid > 0 ? Math.round((totalSubmissions / totalPaid) * 100) : 0;

  // Colour counts
  let blueCount = 0;
  let whiteCount = 0;
  let otherColourCount = 0;
  let collectedCount = 0;

  // Size distribution counts
  const sizeCounts = {
    'S': 0,
    'M': 0,
    'L': 0,
    'XL': 0,
    'XXL': 0,
    'XXXL': 0
  };

  // Colour x Size matrix: { [size]: { Blue: 0, White: 0, Total: 0 } }
  const matrix = {
    'S': { Blue: 0, White: 0, Total: 0 },
    'M': { Blue: 0, White: 0, Total: 0 },
    'L': { Blue: 0, White: 0, Total: 0 },
    'XL': { Blue: 0, White: 0, Total: 0 },
    'XXL': { Blue: 0, White: 0, Total: 0 },
    'XXXL': { Blue: 0, White: 0, Total: 0 }
  };

  selections.forEach(sel => {
    const col = normalizeText(sel['Selected Colour']).toLowerCase();
    const sz = normalizeText(sel['Selected Size']).toUpperCase();
    const stStatus = normalizeText(sel['Submission Status']).toUpperCase();
    if (stStatus.includes('COLLECTED')) {
      collectedCount++;
    }

    if (col === 'blue') {
      blueCount++;
    } else if (col === 'white') {
      whiteCount++;
    } else {
      otherColourCount++;
    }

    if (sizeCounts.hasOwnProperty(sz)) {
      sizeCounts[sz]++;
    }

    if (matrix.hasOwnProperty(sz)) {
      if (col === 'blue') {
        matrix[sz].Blue++;
      } else if (col === 'white') {
        matrix[sz].White++;
      }
      matrix[sz].Total++;
    }
  });

  const bluePercentage = totalSubmissions > 0 ? Math.round((blueCount / totalSubmissions) * 100) : 0;
  const whitePercentage = totalSubmissions > 0 ? Math.round((whiteCount / totalSubmissions) * 100) : 0;

  // Recent 10 submissions
  const recentSubmissions = selections.slice(-10).reverse().map(sel => ({
    submissionId: sel['Submission ID'],
    fullName: sel['Full Name'],
    indexNumber: sel['Index Number'],
    colour: sel['Selected Colour'],
    size: sel['Selected Size'],
    submittedAt: sel['Submitted At']
  }));

  return {
    overview: {
      totalPaidStudents: totalPaid,
      totalSubmissions: totalSubmissions,
      pendingStudents: pendingCount,
      completionPercentage: completionPercentage,
      collectedCount: collectedCount,
      uncollectedCount: Math.max(0, totalSubmissions - collectedCount),
      submissionStatus: settings.submissionStatus
    },
    colours: {
      blue: { count: blueCount, percentage: bluePercentage },
      white: { count: whiteCount, percentage: whitePercentage },
      other: otherColourCount
    },
    sizes: sizeCounts,
    matrix: matrix,
    recentSubmissions: recentSubmissions
  };
}

/**
 * Retrieves the comprehensive student register merging Students and Selections
 */
function getStudentSelections(sessionToken, filters) {
  validateAdminSession(sessionToken);

  const students = getRowsAsObjects(SHEET_NAMES.STUDENTS);
  const selections = getRowsAsObjects(SHEET_NAMES.SELECTIONS);

  // Index selections by normalized index number
  const selectionMap = new Map();
  selections.forEach(sel => {
    const idx = normalizeIndexNumber(sel['Index Number']);
    if (idx) {
      selectionMap.set(idx, sel);
    }
  });

  // Build combined student view
  let records = students.map(st => {
    const idx = normalizeIndexNumber(st['Index Number']);
    const sel = selectionMap.get(idx);
    const isSubmitted = !!sel;
    const isCollected = sel && normalizeText(sel['Submission Status']).toUpperCase().includes('COLLECTED');

    return {
      fullName: st['Full Name'],
      indexNumber: st['Index Number'],
      paymentStatus: st['Payment Status'] || 'UNPAID',
      paymentReference: st['Payment Reference'] || '-',
      submissionId: sel ? sel['Submission ID'] : '-',
      selectedColour: sel ? sel['Selected Colour'] : '-',
      selectedSize: sel ? sel['Selected Size'] : '-',
      submittedAt: sel ? sel['Submitted At'] : '-',
      submissionStatus: isSubmitted ? 'Submitted' : 'Pending',
      collectionStatus: isSubmitted ? (isCollected ? 'Collected' : 'Not Collected') : '-'
    };
  });

  // Apply search query
  if (filters && filters.search) {
    const q = filters.search.toLowerCase().trim();
    records = records.filter(r => 
      (r.fullName && r.fullName.toLowerCase().includes(q)) ||
      (r.indexNumber && r.indexNumber.toLowerCase().includes(q)) ||
      (r.paymentReference && r.paymentReference.toLowerCase().includes(q))
    );
  }

  // Apply colour filter
  if (filters && filters.colour && filters.colour !== 'ALL') {
    records = records.filter(r => r.selectedColour.toLowerCase() === filters.colour.toLowerCase());
  }

  // Apply size filter
  if (filters && filters.size && filters.size !== 'ALL') {
    records = records.filter(r => r.selectedSize.toUpperCase() === filters.size.toUpperCase());
  }

  // Apply submission/collection status filter
  if (filters && filters.status && filters.status !== 'ALL') {
    if (filters.status === 'Collected' || filters.status === 'Not Collected') {
      records = records.filter(r => r.collectionStatus === filters.status);
    } else {
      records = records.filter(r => r.submissionStatus.toLowerCase() === filters.status.toLowerCase());
    }
  }

  // Apply payment status filter
  if (filters && filters.paymentStatus && filters.paymentStatus !== 'ALL') {
    records = records.filter(r => r.paymentStatus.toUpperCase() === filters.paymentStatus.toUpperCase());
  }

  return records;
}

/**
 * Returns all paid students who have NOT yet submitted their Lacoste preference
 */
function getPendingStudents(sessionToken) {
  validateAdminSession(sessionToken);

  const students = getRowsAsObjects(SHEET_NAMES.STUDENTS);
  const selections = getRowsAsObjects(SHEET_NAMES.SELECTIONS);

  // Set of submitted index numbers
  const submittedSet = new Set();
  selections.forEach(sel => {
    const idx = normalizeIndexNumber(sel['Index Number']);
    if (idx) submittedSet.add(idx);
  });

  // Find paid students not in submitted set
  const pending = students
    .filter(st => {
      const isPaid = normalizeText(st['Payment Status']).toUpperCase() === 'PAID';
      const isSubmitted = submittedSet.has(normalizeIndexNumber(st['Index Number']));
      return isPaid && !isSubmitted;
    })
    .map(st => ({
      fullName: st['Full Name'],
      indexNumber: st['Index Number'],
      paymentStatus: st['Payment Status'],
      paymentReference: st['Payment Reference'] || '-',
      selectionStatus: 'Pending',
      dateAdded: st['Date Added'] || '-'
    }));

  return pending;
}

