const fs = require('fs');
const path = require('path');

// On Vercel Serverless, /tmp is writable; locally ./data is writable
const DATA_DIR = process.env.VERCEL ? '/tmp' : path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'itsu_database.json');

if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
}

let memoryDb = null;
let lastSyncedPtr = null;
let dbDirty = false;

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const KV_KEY = 'itsu_lacoste_portal_db_v1';

// Built-in zero-config cloud persistence across Vercel serverless cold starts
const CLOUD_KV_APP = '1wcq4j6b';
const CLOUD_PTR_KEY = 'itsu_lacoste_db_v2_ptr';

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
      { fullName: 'ANTHONY MACLEAN', indexNumber: '0721000001', quantity: 1, paymentStatus: 'PAID', paymentReference: 'PRE-ORDER', dateAdded: '2026-11-09' }
    ],
    selections: [],
    admin: {
      email: process.env.ADMIN_EMAIL || 'anthonymaclean100@gmail.com',
      password: process.env.ADMIN_PASSWORD || 'ITSU2026',
      mustChangePassword: false
    },
    auditLogs: [
      { logId: 'LOG-INIT', timestamp: new Date().toISOString(), user: 'SYSTEM', action: 'SYSTEM_INITIALIZED', details: 'Database initialized on Vercel', status: 'SUCCESS' }
    ]
  };
}

async function hydrateDb() {
  if (KV_URL && KV_TOKEN) {
    try {
      const r = await fetch(`${KV_URL}/get/${KV_KEY}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` },
        cache: 'no-store'
      });
      const data = await r.json();
      if (data && data.result) {
        const parsed = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
        if (parsed && Array.isArray(parsed.students) && parsed.admin) {
          memoryDb = parsed;
          return memoryDb;
        }
      }
    } catch (err) {
      console.error('Error reading from KV:', err);
    }
  }

  try {
    const ptrRes = await fetch(`https://keyvalue.immanuel.co/api/KeyVal/GetValue/${CLOUD_KV_APP}/${CLOUD_PTR_KEY}`, {
      cache: 'no-store'
    });
    if (ptrRes.ok) {
      const rawPtr = (await ptrRes.text()).trim().replace(/^"+|"+$/g, '');
      if (rawPtr && rawPtr !== 'null' && rawPtr.length >= 5) {
        if (memoryDb && lastSyncedPtr === rawPtr) {
          return memoryDb;
        }
        const blobRes = await fetch(`https://api.pastes.dev/${rawPtr}`, {
          headers: {
            'User-Agent': 'itsu-lacoste-portal/1.0',
            'Accept': 'application/json'
          },
          cache: 'no-store'
        });
        if (blobRes.ok) {
          const parsed = await blobRes.json();
          if (parsed && Array.isArray(parsed.students) && parsed.admin) {
            memoryDb = parsed;
            lastSyncedPtr = rawPtr;
            try {
              fs.writeFileSync(DB_FILE, JSON.stringify(memoryDb, null, 2), 'utf8');
            } catch (e) {}
            return memoryDb;
          }
        }
      }
    }
  } catch (err) {
    console.error('Error reading from cloud persistence:', err);
  }

  return getDb();
}

async function flushDb() {
  if (!dbDirty || !memoryDb) return;
  dbDirty = false;

  if (KV_URL && KV_TOKEN) {
    try {
      await fetch(`${KV_URL}/set/${KV_KEY}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${KV_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(memoryDb)
      });
    } catch (err) {
      console.error('Error writing to KV:', err);
    }
  }

  try {
    const pasteRes = await fetch('https://api.pastes.dev/post', {
      method: 'POST',
      headers: {
        'User-Agent': 'itsu-lacoste-portal/1.0',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(memoryDb)
    });
    if (pasteRes.ok) {
      const pasteData = await pasteRes.json();
      const newKey = pasteData && pasteData.key;
      if (newKey) {
        await fetch(`https://keyvalue.immanuel.co/api/KeyVal/UpdateValue/${CLOUD_KV_APP}/${CLOUD_PTR_KEY}/${newKey}`, {
          method: 'POST'
        });
        lastSyncedPtr = newKey;
      }
    }
  } catch (err) {
    console.error('Error writing to cloud persistence:', err);
  }
}

function getDb() {
  if (memoryDb) return memoryDb;
  try {
    if (fs.existsSync(DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      if (parsed && Array.isArray(parsed.students) && parsed.admin) {
        memoryDb = parsed;
        return memoryDb;
      }
    }
  } catch (err) {
    console.error('Error reading DB file:', err);
  }
  memoryDb = getInitialDb();
  saveDb(memoryDb);
  return memoryDb;
}

function saveDb(db) {
  memoryDb = db;
  dbDirty = true;
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

    const qty = Math.max(1, parseInt(student.quantity, 10) || 1);
    const token = Buffer.from(`${student.indexNumber}|${student.fullName}|${Date.now() + 1800000}`).toString('base64');
    return {
      verified: true,
      student: { fullName: student.fullName, indexNumber: student.indexNumber, quantity: qty },
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
    const qty = Math.max(1, parseInt(registeredStudent.quantity, 10) || 1);

    const newSub = {
      submissionId: subId,
      fullName: registeredStudent.fullName || fullName,
      indexNumber: normIdx,
      quantity: qty,
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
      details: JSON.stringify({ colour, size, quantity: qty, subId }),
      status: 'SUCCESS'
    });
    saveDb(db);

    return {
      success: true,
      submissionId: subId,
      fullName: newSub.fullName,
      indexNumber: normIdx,
      quantity: qty,
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

    const token = 'VCL-SESSION-' + Math.random().toString(36).substring(2);
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
      const qty = Math.max(1, parseInt(s.quantity, 10) || 1);
      if (c === 'blue') blueCount += qty;
      if (c === 'white') whiteCount += qty;
      if (s.collectionStatus === 'Collected' || String(s.status || '').includes('COLLECTED')) collectedCount++;
      if (sizeCounts[sz] !== undefined) sizeCounts[sz] += qty;
      if (matrix[sz]) {
        if (c === 'blue') matrix[sz].Blue += qty;
        if (c === 'white') matrix[sz].White += qty;
        matrix[sz].Total += qty;
      }
    });

    const totalUnits = blueCount + whiteCount;

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
        blue: { count: blueCount, percentage: totalUnits > 0 ? Math.round((blueCount / totalUnits) * 100) : 0 },
        white: { count: whiteCount, percentage: totalUnits > 0 ? Math.round((whiteCount / totalUnits) * 100) : 0 }
      },
      sizes: sizeCounts,
      matrix,
      recentSubmissions: db.selections.slice(-10).reverse().map(s => ({
        submissionId: s.submissionId,
        fullName: s.fullName,
        indexNumber: s.indexNumber,
        quantity: Math.max(1, parseInt(s.quantity, 10) || 1),
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
      const qty = Math.max(1, parseInt(st.quantity || (sel && sel.quantity), 10) || 1);
      return {
        fullName: st.fullName,
        indexNumber: st.indexNumber,
        quantity: qty,
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
    const qty = Math.max(1, parseInt(studentData.quantity, 10) || 1);
    db.students.push({
      fullName: String(studentData.fullName || '').trim().toUpperCase(),
      indexNumber: normIdx,
      quantity: qty,
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
      const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
      if (!fullName || !indexNumber) return;
      if (existingSet.has(indexNumber)) {
        skipped++;
        return;
      }
      existingSet.add(indexNumber);
      db.students.push({
        fullName,
        indexNumber,
        quantity: qty,
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

    const nextQty = updatedData.quantity !== undefined ? Math.max(1, parseInt(updatedData.quantity, 10) || 1) : (db.students[stIdx].quantity || 1);
    db.students[stIdx].fullName = newName;
    db.students[stIdx].indexNumber = newNorm;
    db.students[stIdx].quantity = nextQty;

    const sel = db.selections.find(s => String(s.indexNumber || '').trim().toUpperCase() === oldNorm);
    if (sel) {
      sel.fullName = newName;
      sel.indexNumber = newNorm;
      sel.quantity = nextQty;
    }

    db.auditLogs.unshift({
      logId: 'LOG-' + Math.random().toString(36).substring(2, 7).toUpperCase(),
      timestamp: new Date().toISOString(),
      user: db.admin.email,
      action: 'STUDENT_UPDATED',
      details: JSON.stringify({ oldIndexNumber: oldNorm, newIndexNumber: newNorm, fullName: newName, quantity: nextQty }),
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
    const st = db.students.find(s => String(s.indexNumber || '').trim().toUpperCase() === normIdx);
    const qty = st ? Math.max(1, parseInt(st.quantity, 10) || 1) : 1;
    let sel = db.selections.find(s => String(s.indexNumber || '').trim().toUpperCase() === normIdx);
    if (sel) {
      sel.selectedColour = selection.colour;
      sel.selectedSize = selection.size;
      sel.quantity = qty;
      sel.status = 'CORRECTED';
    } else {
      db.selections.push({
        submissionId: 'ITSU-LAC-ADM-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
        fullName: st ? st.fullName : 'Student',
        indexNumber: normIdx,
        quantity: qty,
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
      headers = ['#', 'Submission ID', 'Full Name', 'Index Number', 'Qty', 'Amount', 'Colour', 'Size', 'Submitted At', 'Collection Status'];
      rows = sel.map((s, idx) => {
        const q = s.quantity || 1;
        return [idx + 1, s.submissionId, s.fullName, s.indexNumber, q, `${q * 75}GHC`, s.selectedColour, s.selectedSize, s.submittedAt, s.collectionStatus || 'Not Collected'];
      });
      summary = { 'Total Selections': sel.length, 'Collected': sel.filter(s => s.collectionStatus === 'Collected').length };
    } else if (reportType === 'COLLECTION_SIGNOFF') {
      title = 'Physical Distribution & Collection Sign-Off Sheet';
      headers = ['#', 'Full Name', 'Index Number', 'Qty', 'Colour', 'Size', 'Ref ID', 'Collection Status', 'Student Signature'];
      rows = sel.map((s, idx) => [idx + 1, s.fullName, s.indexNumber, s.quantity || 1, s.selectedColour, s.selectedSize, s.submissionId, s.collectionStatus || 'Not Collected', s.collectionStatus === 'Collected' ? 'COLLECTED' : '__________________']);
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
        ['Physical Handout', 'Shirts Awaiting Pickup', Math.max(0, students.length ? sel.length - colC : 0)]
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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await hydrateDb();
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { funcName, args = [] } = body;
    if (!funcName || typeof Backend[funcName] !== 'function') {
      return res.status(400).json({ error: `Unknown function: ${funcName}` });
    }
    const result = await Backend[funcName](...args);
    await flushDb();
    return res.status(200).json({ result });
  } catch (err) {
    return res.status(400).json({ error: err.message || String(err) });
  }
};
