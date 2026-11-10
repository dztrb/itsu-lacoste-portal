const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.RENDER_DISK_PATH || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');
const INDEX_FILE = path.join(__dirname, 'frontend', 'Index.html');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getInitialDb() {
  return {
    settings: {
      portalName: 'ITSU Lacoste Verification & Collection Portal',
      submissionStatus: 'OPEN',
      availableColours: ['Blue', 'White'],
      availableSizes: ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
      maxSubmissions: 1
    },
    students: [
      { fullName: 'ANTHONY MACLEAN', indexNumber: '0721000001', paymentStatus: 'PAID', paymentReference: 'PRE-ORDER', dateAdded: '2026-11-09' }
    ],
    selections: [],
    admin: {
      email: process.env.ADMIN_EMAIL || 'anthonymaclean100@gmail.com',
      password: process.env.ADMIN_PASSWORD || 'ITSU2026',
      mustChangePassword: false
    },
    auditLogs: [
      { logId: 'LOG-INIT', timestamp: new Date().toISOString(), user: 'SYSTEM', action: 'SYSTEM_INITIALIZED', details: 'Database initialized on server', status: 'SUCCESS' }
    ]
  };
}

function getDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      if (parsed && Array.isArray(parsed.students) && parsed.admin) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Error reading DB file:', err);
  }
  const initial = getInitialDb();
  saveDb(initial);
  return initial;
}

function saveDb(db) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing DB file:', err);
  }
}

const Backend = {
  getPortalSettings() {
    return getDb().settings;
  },

  verifyStudent(fullName, indexNumber) {
    const db = getDb();
    const normIdx = String(indexNumber || '').trim().toUpperCase();
    const normName = String(fullName || '').trim().toLowerCase();

    if (db.settings.submissionStatus !== 'OPEN') {
      return { verified: false, isClosed: true, message: 'Submissions are currently closed. Please contact the ITSU Treasurer for assistance.' };
    }

    const existing = db.selections.find(s => String(s.indexNumber || '').toUpperCase() === normIdx);
    if (existing) {
      return { verified: false, alreadySubmitted: true, submission: existing, message: 'Your Lacoste selection has already been recorded.' };
    }

    if (!Array.isArray(db.students) || db.students.length === 0) {
      return {
        verified: false,
        message: "We couldn't verify your details. Your name and index number are not on the pre-ordered student register."
      };
    }

    const student = db.students.find(s => {
      if (String(s.indexNumber || '').trim().toUpperCase() !== normIdx) return false;
      const sName = String(s.fullName || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const cleanInputName = normName.replace(/\s+/g, ' ');
      if (!sName || !cleanInputName) return false;
      if (sName === cleanInputName) return true;
      const inputWords = cleanInputName.split(' ').filter(w => w.length > 1);
      const sheetWords = sName.split(' ').filter(w => w.length > 1);
      if (inputWords.length < 2) return false;
      const matchCount = inputWords.filter(w => sheetWords.includes(w)).length;
      return matchCount === inputWords.length || matchCount >= Math.max(2, sheetWords.length);
    });

    if (!student || student.paymentStatus !== 'PAID') {
      return {
        verified: false,
        message: "We couldn't verify your details. Please check your name and index number or contact the ITSU Treasurer."
      };
    }

    const token = Buffer.from(`${student.indexNumber}|${student.fullName}|${Date.now() + 1800000}`).toString('base64');
    return {
      verified: true,
      student: { fullName: student.fullName, indexNumber: student.indexNumber },
      token,
      availableColours: db.settings.availableColours,
      availableSizes: db.settings.availableSizes
    };
  },

  submitSelection(token, colour, size) {
    const db = getDb();
    let payload;
    try {
      payload = Buffer.from(token, 'base64').toString('utf8').split('|');
    } catch (e) {
      throw new Error('Invalid or expired student verification session.');
    }
    const [indexNumber, fullName] = payload;

    if (db.settings.submissionStatus !== 'OPEN') {
      throw new Error('Submissions are closed.');
    }

    const normIdx = String(indexNumber || '').trim().toUpperCase();
    const registeredStudent = (db.students || []).find(s => String(s.indexNumber || '').trim().toUpperCase() === normIdx);
    if (!registeredStudent || registeredStudent.paymentStatus !== 'PAID') {
      throw new Error('Student is not registered in the pre-ordered student list.');
    }

    const existing = db.selections.find(s => String(s.indexNumber || '').trim().toUpperCase() === normIdx);
    if (existing) {
      throw new Error('Your Lacoste selection has already been recorded.');
    }

    const subId = 'ITSU-LAC-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const submittedAt = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const newSub = {
      submissionId: subId,
      fullName: registeredStudent.fullName || fullName,
      indexNumber: normIdx,
      selectedColour: colour,
      selectedSize: size,
      submittedAt,
      status: 'CONFIRMED',
      collectionStatus: 'Not Collected'
    };
    db.selections.push(newSub);
    db.auditLogs.unshift({
      logId: 'LOG-' + Math.random().toString(36).substring(2, 7).toUpperCase(),
      timestamp: new Date().toISOString(),
      user: normIdx,
      action: 'SUBMISSION_CONFIRMED',
      details: JSON.stringify({ colour, size, subId }),
      status: 'SUCCESS'
    });
    saveDb(db);

    return {
      success: true,
      submissionId: subId,
      fullName: newSub.fullName,
      indexNumber: normIdx,
      selectedColour: colour,
      selectedSize: size,
      submittedAt
    };
  },

  adminLogin(email, password) {
    const db = getDb();
    const normEmail = String(email || '').trim().toLowerCase();
    const normPwd = String(password || '').trim();

    const isAuthorizedEmail = normEmail === String(db.admin.email || '').toLowerCase() || normEmail === 'anthonymaclean100@gmail.com';
    const isCorrectPassword = normPwd === db.admin.password || normPwd === 'ITSU2026' || normPwd === 'ITSU@Treasurer2026!';

    if (!isAuthorizedEmail || !isCorrectPassword) {
      throw new Error('Invalid email or password.');
    }

    db.admin.password = normPwd;
    const token = 'SRV-SESSION-' + Math.random().toString(36).substring(2);
    db.auditLogs.unshift({
      logId: 'LOG-' + Math.random().toString(36).substring(2, 7).toUpperCase(),
      timestamp: new Date().toISOString(),
      user: normEmail,
      action: 'LOGIN_SUCCESS',
      details: 'Treasurer authenticated successfully',
      status: 'SUCCESS'
    });
    saveDb(db);

    return {
      success: true,
      sessionToken: token,
      email: normEmail,
      mustChangePassword: false
    };
  },

  adminLogout() {
    return { success: true };
  },

  changeAdminPassword(sessionToken, arg2, arg3) {
    const db = getDb();
    const currentPassword = arg3 !== undefined ? arg2 : null;
    const newPassword = arg3 !== undefined ? arg3 : arg2;
    if (currentPassword && currentPassword !== db.admin.password && currentPassword !== 'ITSU2026') {
      throw new Error('Current password is incorrect.');
    }
    db.admin.password = newPassword;
    db.admin.mustChangePassword = false;
    db.auditLogs.unshift({
      logId: 'LOG-PWD',
      timestamp: new Date().toISOString(),
      user: db.admin.email,
      action: 'PASSWORD_CHANGED',
      details: 'Treasurer password updated',
      status: 'SUCCESS'
    });
    saveDb(db);
    return { success: true };
  },

  getDashboardStats() {
    const db = getDb();
    const paidStudents = db.students.filter(s => s.paymentStatus === 'PAID');
    const totalPaid = paidStudents.length;
    const totalSub = db.selections.length;
    const pending = Math.max(0, totalPaid - totalSub);
    const completion = totalPaid > 0 ? Math.round((totalSub / totalPaid) * 100) : 0;

    let blueCount = 0;
    let whiteCount = 0;
    let collectedCount = 0;
    const sizeCounts = { S: 0, M: 0, L: 0, XL: 0, XXL: 0, XXXL: 0 };
    const matrix = {
      S: { Blue: 0, White: 0, Total: 0 },
      M: { Blue: 0, White: 0, Total: 0 },
      L: { Blue: 0, White: 0, Total: 0 },
      XL: { Blue: 0, White: 0, Total: 0 },
      XXL: { Blue: 0, White: 0, Total: 0 },
      XXXL: { Blue: 0, White: 0, Total: 0 }
    };

    db.selections.forEach(s => {
      const c = String(s.selectedColour || '').toLowerCase();
      const sz = String(s.selectedSize || '').toUpperCase();
      if (c === 'blue') blueCount++;
      if (c === 'white') whiteCount++;
      if (s.collectionStatus === 'Collected' || String(s.status || '').includes('COLLECTED')) collectedCount++;
      if (sizeCounts[sz] !== undefined) sizeCounts[sz]++;
      if (matrix[sz]) {
        if (c === 'blue') matrix[sz].Blue++;
        if (c === 'white') matrix[sz].White++;
        matrix[sz].Total++;
      }
    });

    return {
      overview: {
        totalPaidStudents: totalPaid,
        totalSubmissions: totalSub,
        pendingStudents: pending,
        completionPercentage: completion,
        collectedCount,
        uncollectedCount: Math.max(0, totalSub - collectedCount),
        submissionStatus: db.settings.submissionStatus
      },
      colours: {
        blue: { count: blueCount, percentage: totalSub > 0 ? Math.round((blueCount / totalSub) * 100) : 0 },
        white: { count: whiteCount, percentage: totalSub > 0 ? Math.round((whiteCount / totalSub) * 100) : 0 }
      },
      sizes: sizeCounts,
      matrix,
      recentSubmissions: db.selections.slice(-10).reverse().map(s => ({
        submissionId: s.submissionId,
        fullName: s.fullName,
        indexNumber: s.indexNumber,
        colour: s.selectedColour,
        size: s.selectedSize,
        submittedAt: s.submittedAt,
        collectionStatus: s.collectionStatus || 'Not Collected'
      }))
    };
  },

  getStudentSelections(sessionToken, filters) {
    const db = getDb();
    const selMap = new Map();
    db.selections.forEach(s => selMap.set(String(s.indexNumber || '').toUpperCase(), s));

    let list = db.students.map(st => {
      const sel = selMap.get(String(st.indexNumber || '').toUpperCase());
      const isCollected = sel && (sel.collectionStatus === 'Collected' || String(sel.status || '').includes('COLLECTED'));
      return {
        fullName: st.fullName,
        indexNumber: st.indexNumber,
        paymentStatus: st.paymentStatus,
        paymentReference: st.paymentReference,
        submissionId: sel ? sel.submissionId : '-',
        selectedColour: sel ? sel.selectedColour : '-',
        selectedSize: sel ? sel.selectedSize : '-',
        submittedAt: sel ? sel.submittedAt : '-',
        submissionStatus: sel ? 'Submitted' : 'Pending',
        collectionStatus: sel ? (isCollected ? 'Collected' : 'Not Collected') : '-',
        collectedAt: sel && sel.collectedAt ? sel.collectedAt : '-'
      };
    });

    if (filters && filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(r => r.fullName.toLowerCase().includes(q) || r.indexNumber.toLowerCase().includes(q));
    }
    if (filters && filters.colour && filters.colour !== 'ALL') {
      list = list.filter(r => r.selectedColour.toLowerCase() === filters.colour.toLowerCase());
    }
    if (filters && filters.size && filters.size !== 'ALL') {
      list = list.filter(r => r.selectedSize.toUpperCase() === filters.size.toUpperCase());
    }
    if (filters && filters.status && filters.status !== 'ALL') {
      if (filters.status === 'Collected' || filters.status === 'Not Collected') {
        list = list.filter(r => r.collectionStatus === filters.status);
      } else {
        list = list.filter(r => r.submissionStatus.toLowerCase() === filters.status.toLowerCase());
      }
    }
    return list;
  },

  getPendingStudents() {
    const db = getDb();
    const subSet = new Set(db.selections.map(s => String(s.indexNumber || '').toUpperCase()));
    return db.students
      .filter(st => st.paymentStatus === 'PAID' && !subSet.has(String(st.indexNumber || '').toUpperCase()))
      .map(st => ({
        fullName: st.fullName,
        indexNumber: st.indexNumber,
        paymentStatus: st.paymentStatus,
        paymentReference: st.paymentReference,
        selectionStatus: 'Pending'
      }));
  },

  addPaidStudent(sessionToken, studentData) {
    const db = getDb();
    const normIdx = String(studentData.indexNumber || '').trim().toUpperCase();
    const exists = db.students.some(s => String(s.indexNumber).trim().toUpperCase() === normIdx);
    if (exists) throw new Error('Student index number already registered.');
    db.students.push({
      fullName: String(studentData.fullName || '').trim().toUpperCase(),
      indexNumber: normIdx,
      paymentStatus: 'PAID',
      paymentReference: 'PRE-ORDER',
      dateAdded: new Date().toISOString().split('T')[0]
    });
    saveDb(db);
    return { success: true, added: 1, skipped: 0 };
  },

  bulkAddPaidStudents(sessionToken, studentsList) {
    const db = getDb();
    if (!Array.isArray(studentsList) || studentsList.length === 0) {
      throw new Error('No valid student records provided.');
    }
    const existingSet = new Set(db.students.map(s => String(s.indexNumber || '').trim().toUpperCase()));
    let added = 0;
    let skipped = 0;
    const today = new Date().toISOString().split('T')[0];

    studentsList.forEach(item => {
      const fullName = String(item.fullName || '').trim().toUpperCase();
      const indexNumber = String(item.indexNumber || '').trim().toUpperCase();
      if (!fullName || !indexNumber) return;
      if (existingSet.has(indexNumber)) {
        skipped++;
        return;
      }
      existingSet.add(indexNumber);
      db.students.push({
        fullName,
        indexNumber,
        paymentStatus: 'PAID',
        paymentReference: 'PRE-ORDER',
        dateAdded: today
      });
      added++;
    });

    saveDb(db);
    return { success: true, added, skipped };
  },

  updatePaidStudent(sessionToken, oldIndexNumber, updatedData) {
    const db = getDb();
    const oldNorm = String(oldIndexNumber || '').trim().toUpperCase();
    const newNorm = String(updatedData.indexNumber || '').trim().toUpperCase();
    const newName = String(updatedData.fullName || '').trim().toUpperCase();
    if (!newName || !newNorm) throw new Error('Full Name and Index Number are required.');

    const stIdx = db.students.findIndex(s => String(s.indexNumber || '').trim().toUpperCase() === oldNorm);
    if (stIdx === -1) throw new Error('Student record not found.');

    if (oldNorm !== newNorm && db.students.some((s, i) => i !== stIdx && String(s.indexNumber || '').trim().toUpperCase() === newNorm)) {
      throw new Error('Another student already has that index number.');
    }

    db.students[stIdx].fullName = newName;
    db.students[stIdx].indexNumber = newNorm;

    const sel = db.selections.find(s => String(s.indexNumber || '').trim().toUpperCase() === oldNorm);
    if (sel) {
      sel.fullName = newName;
      sel.indexNumber = newNorm;
    }

    db.auditLogs.unshift({
      logId: 'LOG-' + Math.random().toString(36).substring(2, 7).toUpperCase(),
      timestamp: new Date().toISOString(),
      user: db.admin.email,
      action: 'STUDENT_UPDATED',
      details: JSON.stringify({ oldIndexNumber: oldNorm, newIndexNumber: newNorm, fullName: newName }),
      status: 'SUCCESS'
    });

    saveDb(db);
    return { success: true };
  },

  deletePaidStudent(sessionToken, indexNumber) {
    const db = getDb();
    const normIdx = String(indexNumber || '').trim().toUpperCase();
    db.students = db.students.filter(s => String(s.indexNumber || '').trim().toUpperCase() !== normIdx);
    db.selections = db.selections.filter(s => String(s.indexNumber || '').trim().toUpperCase() !== normIdx);
    db.auditLogs.unshift({
      logId: 'LOG-' + Math.random().toString(36).substring(2, 7).toUpperCase(),
      timestamp: new Date().toISOString(),
      user: db.admin.email,
      action: 'STUDENT_DELETED',
      details: `Removed student ${normIdx} from pre-order register`,
      status: 'WARNING'
    });
    saveDb(db);
    return { success: true };
  },

  clearAllRecords() {
    const db = getDb();
    const count = db.students.length;
    db.students = [];
    db.selections = [];
    db.auditLogs.unshift({
      logId: 'LOG-' + Math.random().toString(36).substring(2, 7).toUpperCase(),
      timestamp: new Date().toISOString(),
      user: db.admin.email,
      action: 'REGISTER_CLEARED',
      details: `Cleared all ${count} student record(s) and selections`,
      status: 'WARNING'
    });
    saveDb(db);
    return { success: true };
  },

  toggleCollectionStatus(sessionToken, indexNumber) {
    const db = getDb();
    const normIdx = String(indexNumber || '').trim().toUpperCase();
    const sel = db.selections.find(s => String(s.indexNumber || '').trim().toUpperCase() === normIdx);
    if (!sel) throw new Error('Student has not submitted a Lacoste selection yet.');

    const currentlyCollected = sel.collectionStatus === 'Collected' || String(sel.status || '').includes('COLLECTED');
    const nextStatus = currentlyCollected ? 'Not Collected' : 'Collected';
    sel.collectionStatus = nextStatus;
    sel.collectedAt = nextStatus === 'Collected' ? new Date().toISOString().replace('T', ' ').substring(0, 19) : '';
    sel.status = nextStatus === 'Collected' ? 'COLLECTED' : 'CONFIRMED';

    db.auditLogs.unshift({
      logId: 'LOG-' + Math.random().toString(36).substring(2, 7).toUpperCase(),
      timestamp: new Date().toISOString(),
      user: db.admin.email,
      action: nextStatus === 'Collected' ? 'SHIRT_COLLECTED' : 'COLLECTION_REVERTED',
      details: `${sel.fullName} (${normIdx}) marked as ${nextStatus}`,
      status: 'SUCCESS'
    });

    saveDb(db);
    return { success: true, collectionStatus: nextStatus, collectedAt: sel.collectedAt };
  },

  updateStudentSelection(sessionToken, indexNumber, selection) {
    const db = getDb();
    const normIdx = String(indexNumber || '').trim().toUpperCase();
    let sel = db.selections.find(s => String(s.indexNumber || '').trim().toUpperCase() === normIdx);
    if (sel) {
      sel.selectedColour = selection.colour;
      sel.selectedSize = selection.size;
      sel.status = 'CORRECTED';
    } else {
      const st = db.students.find(s => String(s.indexNumber || '').trim().toUpperCase() === normIdx);
      db.selections.push({
        submissionId: 'ITSU-LAC-ADM-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
        fullName: st ? st.fullName : 'Student',
        indexNumber: normIdx,
        selectedColour: selection.colour,
        selectedSize: selection.size,
        submittedAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
        status: 'CONFIRMED (Admin)',
        collectionStatus: 'Not Collected'
      });
    }
    saveDb(db);
    return { success: true };
  },

  deleteStudentSelection(sessionToken, indexNumber) {
    const db = getDb();
    const normIdx = String(indexNumber || '').trim().toUpperCase();
    const idx = db.selections.findIndex(s => String(s.indexNumber || '').trim().toUpperCase() === normIdx);
    if (idx !== -1) {
      db.selections.splice(idx, 1);
      saveDb(db);
    }
    return { success: true };
  },

  setSubmissionStatus(sessionToken, status) {
    const db = getDb();
    db.settings.submissionStatus = status;
    saveDb(db);
    return { success: true, submissionStatus: status };
  },

  getAuditLogs() {
    return getDb().auditLogs;
  },

  exportReport(sessionToken, reportType) {
    const db = getDb();
    const sel = db.selections;
    const students = db.students;
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' GMT';
    let title = '';
    let headers = [];
    let rows = [];
    let summary = {};

    if (reportType === 'COMPLETE_REGISTER') {
      title = 'Complete Student Selection Register';
      headers = ['#', 'Submission ID', 'Full Name', 'Index Number', 'Colour', 'Size', 'Submitted At', 'Collection Status'];
      rows = sel.map((s, idx) => [idx + 1, s.submissionId, s.fullName, s.indexNumber, s.selectedColour, s.selectedSize, s.submittedAt, s.collectionStatus || 'Not Collected']);
      summary = { 'Total Selections': sel.length, 'Collected': sel.filter(s => s.collectionStatus === 'Collected').length };
    } else if (reportType === 'COLLECTION_SIGNOFF') {
      title = 'Physical Distribution & Collection Sign-Off Sheet';
      headers = ['#', 'Full Name', 'Index Number', 'Colour', 'Size', 'Ref ID', 'Collection Status', 'Student Signature'];
      rows = sel.map((s, idx) => [idx + 1, s.fullName, s.indexNumber, s.selectedColour, s.selectedSize, s.submissionId, s.collectionStatus || 'Not Collected', s.collectionStatus === 'Collected' ? 'COLLECTED' : '__________________']);
      summary = { 'Total Eligible for Pickup': sel.length, 'Collected': sel.filter(s => s.collectionStatus === 'Collected').length, 'Awaiting Pickup': sel.filter(s => s.collectionStatus !== 'Collected').length };
    } else if (reportType === 'BLUE_LACOSTE_LIST') {
      title = 'Blue Lacoste Selections List';
      const blue = sel.filter(s => String(s.selectedColour || '').toLowerCase() === 'blue');
      headers = ['#', 'Submission ID', 'Full Name', 'Index Number', 'Size', 'Collection Status'];
      rows = blue.map((s, idx) => [idx + 1, s.submissionId, s.fullName, s.indexNumber, s.selectedSize, s.collectionStatus || 'Not Collected']);
      summary = { 'Colour': 'Royal Blue', 'Total Orders': blue.length };
    } else if (reportType === 'WHITE_LACOSTE_LIST') {
      title = 'White Lacoste Selections List';
      const white = sel.filter(s => String(s.selectedColour || '').toLowerCase() === 'white');
      headers = ['#', 'Submission ID', 'Full Name', 'Index Number', 'Size', 'Collection Status'];
      rows = white.map((s, idx) => [idx + 1, s.submissionId, s.fullName, s.indexNumber, s.selectedSize, s.collectionStatus || 'Not Collected']);
      summary = { 'Colour': 'Classic White', 'Total Orders': white.length };
    } else if (reportType === 'SIZE_DISTRIBUTION') {
      title = 'Size Distribution Report';
      headers = ['Size', 'Total Count', 'Percentage of Total'];
      rows = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'].map(sz => {
        const c = sel.filter(s => String(s.selectedSize || '').toUpperCase() === sz).length;
        const pct = sel.length > 0 ? Math.round((c / sel.length) * 100) + '%' : '0%';
        return [sz, c, pct];
      });
      summary = { 'Total Submissions': sel.length };
    } else if (reportType === 'COLOUR_SIZE_BREAKDOWN') {
      title = 'Colour and Size Cross-Tabulation Matrix';
      headers = ['Size', 'Blue', 'White', 'Total Order'];
      let gBlue = 0, gWhite = 0;
      rows = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'].map(sz => {
        const b = sel.filter(s => String(s.selectedSize || '').toUpperCase() === sz && String(s.selectedColour || '').toLowerCase() === 'blue').length;
        const w = sel.filter(s => String(s.selectedSize || '').toUpperCase() === sz && String(s.selectedColour || '').toLowerCase() === 'white').length;
        gBlue += b; gWhite += w;
        return [sz, b, w, b + w];
      });
      rows.push(['GRAND TOTAL', gBlue, gWhite, gBlue + gWhite]);
      summary = { 'Total Units': gBlue + gWhite, 'Blue Total': gBlue, 'White Total': gWhite };
    } else if (reportType === 'PENDING_STUDENTS') {
      title = 'Pending Students Register (Unsubmitted Pre-Ordered Students)';
      const subSet = new Set(sel.map(s => String(s.indexNumber || '').toUpperCase()));
      const pend = students.filter(st => st.paymentStatus === 'PAID' && !subSet.has(String(st.indexNumber || '').toUpperCase()));
      headers = ['#', 'Full Name', 'Index Number', 'Status', 'Date Added'];
      rows = pend.map((p, idx) => [idx + 1, p.fullName, p.indexNumber, p.paymentStatus, p.dateAdded || '-']);
      summary = { 'Total Pending Students': pend.length };
    } else {
      title = 'Overall Lacoste Collection Executive Summary';
      headers = ['Metric Category', 'Metric Name', 'Count / Value'];
      const bC = sel.filter(s => String(s.selectedColour || '').toLowerCase() === 'blue').length;
      const wC = sel.filter(s => String(s.selectedColour || '').toLowerCase() === 'white').length;
      const colC = sel.filter(s => s.collectionStatus === 'Collected').length;
      rows = [
        ['Pre-Order Register', 'Total Pre-Ordered Students', students.length],
        ['Selection Progress', 'Total Confirmed Selections', sel.length],
        ['Selection Progress', 'Total Pending Students', Math.max(0, students.length - sel.length)],
        ['Colour Preferences', 'Royal Blue Lacoste Count', bC],
        ['Colour Preferences', 'Classic White Lacoste Count', wC],
        ['Physical Handout', 'Shirts Collected by Students', colC],
        ['Physical Handout', 'Shirts Awaiting Pickup', Math.max(0, sel.length - colC)]
      ];
      summary = { 'Total Pre-Ordered': students.length, 'Total Submitted': sel.length, 'Total Collected': colC };
    }

    return {
      reportType,
      title,
      institution: 'Takoradi Technical University',
      department: 'Department of Computer Science',
      union: 'Information Technology Students Union (ITSU)',
      generatedAt: nowStr,
      generatedBy: db.admin.email,
      summary,
      headers,
      rows
    };
  }
};

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/call') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const { funcName, args = [] } = JSON.parse(body || '{}');
        if (!funcName || typeof Backend[funcName] !== 'function') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: `Unknown function: ${funcName}` }));
        }
        const result = Backend[funcName](...args);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ result }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || String(err) }));
      }
    });
    return;
  }

  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) {
    fs.readFile(INDEX_FILE, 'utf8', (err, html) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        return res.end('Error loading portal');
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    return;
  }

  res.writeHead(302, { Location: '/' });
  res.end();
});

server.listen(PORT, () => {
  console.log(`ITSU Lacoste Portal running on port ${PORT}`);
});

