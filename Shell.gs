/*************************************************************
 * Read Us! 리더스 — 학교 시트용 껍데기 (Shell.gs)
 * ------------------------------------------------------------
 * 이 파일 하나만 스프레드시트의 Apps Script 에 붙여넣고 웹앱으로 배포하면 됩니다.
 * 화면은 GitHub(musicalpe.github.io/readus)에서 열리고, 이 파일은 뒤에서
 * 학생·읽은 책·학급 도서·설정을 시트에 읽고 쓰는 일만 합니다.
 * 화면이 새 판으로 바뀌어도 이 파일은 그대로 두면 됩니다.
 * (껍데기를 바꿔야 할 때는 화면이 알려줍니다)
 *
 * 배포 설정: 다음 사용자로 실행 = 나, 액세스 권한 = 모든 사용자
 * Made by 음악적체육인
 *************************************************************/
const SHELL_VERSION = 2;                       // 껍데기 판 (화면이 확인함)  2: 학급 이름, 자유 저장칸(extra·선생님만 보는 칸), 내 대기 기록 지우기, 기록 고치기, 책 기록 초기화, 쪽수·덧붙임 칸, 날짜별 권수, 전국판 보고 준비
const APP_URL = 'https://musicalpe.github.io/readus/';

const SHEET_STUDENTS = 'Students';
const SHEET_BOOKS = 'Books';
const SHEET_CLASSBOOKS = 'ClassBooks';
const STUDENTS_HEADER_ = ['ID', 'Grade', 'Class', 'Number', 'Name', 'PasswordHash', 'SortOrder'];
const BOOKS_HEADER_ = ['RecordID', 'Timestamp', 'StudentID', 'Date', 'Title', 'Author', 'Publisher', 'Note', 'Status', 'ClassBookID', 'Cover', 'Memo', 'Pages', 'Extra'];   // Pages·Extra(2판): 쪽수와 덧붙임(JSON) — 새 기능이 껍데기를 안 바꾸고 쓰도록 미리 둔 칸
const CLASSBOOKS_HEADER_ = ['ID', 'Title', 'Author', 'Publisher', 'Due', 'Cover', 'CreatedAt'];
const TOKEN_TTL_SEC = 24 * 60 * 60;            // 선생님 로그인 유지: 하루
const DEFAULT_ADMIN_PASSWORD = '1234';         // 처음 비밀번호 (선생님 화면에서 바로 바꾸세요)
const BOOK_CM = 30;                            // 책 한 권 = 30cm 로 쌓음

/************ 주소로 열었을 때: 설치 확인 화면 ************/
function doGet(e) {
  const self = ScriptApp.getService().getUrl();
  const app = APP_URL + '?s=' + encodeURIComponent(self);
  const html =
    '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{font-family:"Malgun Gothic",sans-serif;background:#F4EBDD;margin:0;padding:24px;color:#3E2C20}' +
    '.c{max-width:560px;margin:30px auto;background:#FFFCF6;border-radius:18px;overflow:hidden}' +
    '.h{background:#3E2C20;color:#FFFCF6;padding:22px 24px}.h h1{margin:0 0 4px;font-size:22px}.h p{margin:0;opacity:.9}' +
    '.b{padding:22px 24px;line-height:1.6}a.btn{display:block;text-align:center;background:#3E2C20;color:#FFFCF6;text-decoration:none;font-weight:800;padding:14px;border-radius:12px;font-size:17px;margin:14px 0}' +
    'code{display:block;background:#EFE4D2;padding:10px;border-radius:8px;word-break:break-all;font-size:12px}small{color:#6E5847}</style></head><body>' +
    '<div class="c"><div class="h"><h1>Read Us! 리더스</h1><p>껍데기 설치 완료 · 껍데기 판 ' + SHELL_VERSION + '</p></div><div class="b">' +
    '<p>이 주소는 <b>설치 확인용</b>이에요. 프로그램은 아래 단추로 엽니다. 열린 주소를 <b>즐겨찾기</b>해 두고 학생들에게 알려 주세요.</p>' +
    '<a class="btn" href="' + app + '" target="_top">프로그램 열기</a>' +
    '<small>프로그램 주소</small><code>' + app + '</code>' +
    '</div></div></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('Read Us! 리더스 — 설치 확인')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/************ 화면(GitHub)에서 오는 요청: POST 본문 {"fn":"함수이름","args":[...]} ************/
const RPC_ALLOW_ = [
  'ping', 'getSettings', 'setSettings', 'verifyAdminPassword', 'changeAdminPassword',
  'getStudentsPublic', 'addStudentsBulk', 'updateStudent', 'deleteStudent',
  'getMyBooks', 'addBook', 'rewriteBook', 'getBoard',
  'getAllDataAdmin', 'approveBooks', 'returnBook', 'deleteBook',
  'addClassBook', 'removeClassBook',
  'deleteMyBook', 'updateBookAdmin', 'resetBooks', 'getPrivateAdmin', 'setPrivate', 'natReport'
];
function doPost(e) {
  let out;
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const fn = String(body.fn || '');
    if (RPC_ALLOW_.indexOf(fn) === -1) throw new Error('알 수 없는 요청: ' + fn);
    const g = (typeof globalThis !== 'undefined') ? globalThis : this;
    const f = g[fn];
    if (typeof f !== 'function') throw new Error('이 껍데기에 없는 기능입니다: ' + fn + ' (껍데기를 새 판으로 바꿔 주세요)');
    const args = Array.isArray(body.args) ? body.args : [];
    out = { ok: true, result: f.apply(null, args) };
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function ping() {
  return { shell: SHELL_VERSION, appUrl: APP_URL, self: ScriptApp.getService().getUrl(), title: title_(), bookCm: BOOK_CM };
}

/************ 유틸 ************/
function hashPw_(pw) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(pw), Utilities.Charset.UTF_8);
  return raw.map(function (b) { return (b < 0 ? b + 256 : b).toString(16).padStart(2, '0'); }).join('');
}
function getSS_() { return SpreadsheetApp.getActiveSpreadsheet(); }

// 시트를 찾고, 없으면 머리줄과 함께 만듦. 모든 칸은 '일반 텍스트'로 — 책 제목 "3-1" 이 날짜로 바뀌는 일을 막음
function sheet_(name, header) {
  const ss = getSS_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, sh.getMaxRows(), header.length).setNumberFormat('@');
    sh.appendRow(header);
  } else if (sh.getLastColumn() < header.length) {      // 옛 판에서 만든 시트: 새로 생긴 칸의 머리줄을 덧붙임
    const from = sh.getLastColumn() + 1;
    sh.getRange(1, from, sh.getMaxRows(), header.length - from + 1).setNumberFormat('@');
    sh.getRange(1, from, 1, header.length - from + 1).setValues([header.slice(from - 1)]);
  }
  return sh;
}
function rows_(sh) {
  const n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, sh.getLastColumn()).getValues();
}
// 글자로 바꾸고 앞뒤 빈칸을 뗌 (시트가 숫자·날짜로 바꿔 둔 값도 글자로)
function str_(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  return String(v).trim();
}
// 시트에 쓸 글: 길이를 자르고, 수식으로 읽힐 수 있는 첫 글자(= + - @) 앞에 빈칸을 둠 (읽을 때 str_ 이 다시 뗌)
function clean_(v, max) {
  let s = String(v === null || v === undefined ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  if (s.length > max) s = s.slice(0, max);
  if (/^[=+\-@]/.test(s)) s = ' ' + s;
  return s;
}
function tz_() { return Session.getScriptTimeZone() || 'Asia/Seoul'; }
function today_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }
function isDate_(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s)); }
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/************ 선생님 로그인 ************/
function getAdminHash_() {
  return PropertiesService.getScriptProperties().getProperty('ADMIN_HASH') || hashPw_(DEFAULT_ADMIN_PASSWORD);
}
function verifyAdminPassword(password) {
  if (hashPw_(password) !== getAdminHash_()) return { ok: false, message: '비밀번호가 올바르지 않습니다.' };
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('ADMIN_' + token, '1', 21600);
  const props = PropertiesService.getScriptProperties(), now = Date.now(), all = props.getProperties();
  Object.keys(all).forEach(function (k) { if (k.indexOf('AT_') === 0 && +all[k] < now) props.deleteProperty(k); });   // 지난 로그인 정리
  props.setProperty('AT_' + token, String(now + TOKEN_TTL_SEC * 1000));
  return { ok: true, token: token, isDefault: getAdminHash_() === hashPw_(DEFAULT_ADMIN_PASSWORD) };
}
function changeAdminPassword(token, newPassword) {
  admin_(token);
  const pw = String(newPassword || '').trim();
  if (pw.length < 4) return { ok: false, message: '비밀번호는 4자 이상 입력하세요.' };
  PropertiesService.getScriptProperties().setProperty('ADMIN_HASH', hashPw_(pw));
  return { ok: true };
}
function checkAdminToken_(token) {
  if (!token) return false;
  const cache = CacheService.getScriptCache();
  if (cache.get('ADMIN_' + token)) return true;
  const exp = +(PropertiesService.getScriptProperties().getProperty('AT_' + token) || 0);
  if (exp > Date.now()) { cache.put('ADMIN_' + token, '1', Math.max(1, Math.min(21600, Math.floor((exp - Date.now()) / 1000)))); return true; }
  return false;
}
function admin_(token) { if (!checkAdminToken_(token)) throw new Error('권한이 없습니다. 다시 로그인해 주세요.'); }

/************ 설정 (감상 기준·이름 보이기) ************/
const DEFAULT_SETTINGS_ = {
  rule: { on: true, kind: 'sentence', min: 3,
    questions: ['가장 기억에 남는 장면은 무엇인가요?', '주인공에게 해 주고 싶은 말이 있나요?', '내 생활과 닮은 점이 있었나요?'] },
  showNames: true,         // 현황판에 친구 이름과 권수를 보일지
  className: '',           // 화면에 보일 학급 이름 (비우면 시트 이름)
  extra: {}                // 자유 저장칸: 화면의 새 기능이 껍데기를 바꾸지 않고 설정을 두는 곳 (누구나 읽음)
};
function getSettings() {
  let saved = {};
  try { saved = JSON.parse(PropertiesService.getScriptProperties().getProperty('SETTINGS') || '{}') || {}; } catch (e) { saved = {}; }
  const r = saved.rule || {}, d = DEFAULT_SETTINGS_.rule;
  return {
    rule: {
      on: r.on === undefined ? d.on : !!r.on,
      kind: r.kind === 'char' ? 'char' : 'sentence',
      min: Math.max(1, Math.min(2000, parseInt(r.min, 10) || d.min)),
      questions: Array.isArray(r.questions) ? r.questions.map(function (q) { return str_(q).slice(0, 60); }).filter(String).slice(0, 5) : d.questions
    },
    showNames: saved.showNames === undefined ? DEFAULT_SETTINGS_.showNames : !!saved.showNames,
    className: str_(saved.className).slice(0, 30),
    extra: (saved.extra && typeof saved.extra === 'object' && !Array.isArray(saved.extra)) ? saved.extra : {}
  };
}
// 화면에 보일 학급 이름: 선생님이 정한 이름, 없으면 시트 이름
function title_() { return getSettings().className || getSS_().getName(); }
function merge_(cur, patch, maxLen) {
  Object.keys(patch || {}).forEach(function (k) { if (patch[k] === null) delete cur[k]; else cur[k] = patch[k]; });
  if (JSON.stringify(cur).length > maxLen) throw new Error('설정이 너무 큽니다.');
  return cur;
}
function setSettings(token, patch) {
  admin_(token);
  const cur = getSettings();
  patch = patch || {};
  if (patch.rule) Object.keys(patch.rule).forEach(function (k) { cur.rule[k] = patch.rule[k]; });
  if (patch.showNames !== undefined) cur.showNames = !!patch.showNames;
  if (patch.className !== undefined) cur.className = clean_(patch.className, 30).trim();
  if (patch.extra && typeof patch.extra === 'object') cur.extra = merge_(cur.extra, patch.extra, 8000);
  PropertiesService.getScriptProperties().setProperty('SETTINGS', JSON.stringify(cur));
  return getSettings();
}

/************ 학생 ************/
function students_() {
  return rows_(sheet_(SHEET_STUDENTS, STUDENTS_HEADER_)).map(function (r) {
    return { id: str_(r[0]), grade: str_(r[1]), cls: str_(r[2]), number: str_(r[3]), name: str_(r[4]), hash: str_(r[5]), order: Number(r[6]) || 0 };
  }).filter(function (s) { return s.id; }).sort(function (a, b) {
    return (Number(a.grade) - Number(b.grade)) || (Number(a.cls) - Number(b.cls)) || (Number(a.number) - Number(b.number)) || (a.order - b.order);
  });
}
function pub_(s) { return { id: s.id, grade: s.grade, cls: s.cls, number: s.number, name: s.name, lock: !!s.hash }; }
function getStudentsPublic() { return students_().map(pub_); }
function addStudentsBulk(token, list) {
  admin_(token);
  if (!Array.isArray(list)) throw new Error('학생 목록이 비어 있습니다.');
  return withLock_(function () {
    const sh = sheet_(SHEET_STUDENTS, STUDENTS_HEADER_);
    let n = 0, order = sh.getLastRow();
    list.slice(0, 500).forEach(function (o) {
      const name = clean_(o && o.name, 20);
      if (!name) return;
      const pw = String((o && o.password) || '').trim();
      sh.appendRow([Utilities.getUuid().slice(0, 8), clean_(o.grade, 3), clean_(o.cls, 3), clean_(o.number, 3), name, pw ? hashPw_(pw) : '', String(order++)]);
      n++;
    });
    return { ok: true, added: n };
  });
}
function findRow_(sh, id) {
  const rows = rows_(sh);
  for (let i = 0; i < rows.length; i++) if (str_(rows[i][0]) === String(id)) return i + 2;
  return 0;
}
function updateStudent(token, id, o) {
  admin_(token);
  return withLock_(function () {
    const sh = sheet_(SHEET_STUDENTS, STUDENTS_HEADER_), row = findRow_(sh, id);
    if (!row) throw new Error('학생을 찾을 수 없습니다.');
    o = o || {};
    if (o.grade !== undefined) sh.getRange(row, 2).setValue(clean_(o.grade, 3));
    if (o.cls !== undefined) sh.getRange(row, 3).setValue(clean_(o.cls, 3));
    if (o.number !== undefined) sh.getRange(row, 4).setValue(clean_(o.number, 3));
    if (o.name !== undefined && clean_(o.name, 20)) sh.getRange(row, 5).setValue(clean_(o.name, 20));
    if (o.password !== undefined) { const pw = String(o.password || '').trim(); sh.getRange(row, 6).setValue(pw ? hashPw_(pw) : ''); }
    return { ok: true };
  });
}
function deleteRowsWhere_(sh, pred) {
  const rows = rows_(sh);
  let n = 0;
  for (let i = rows.length - 1; i >= 0; i--) if (pred(rows[i])) { sh.deleteRow(i + 2); n++; }
  return n;
}
function deleteStudent(token, id) {
  admin_(token);
  return withLock_(function () {
    const n = deleteRowsWhere_(sheet_(SHEET_STUDENTS, STUDENTS_HEADER_), function (r) { return str_(r[0]) === String(id); });
    const b = deleteRowsWhere_(sheet_(SHEET_BOOKS, BOOKS_HEADER_), function (r) { return str_(r[2]) === String(id); });
    return { ok: true, students: n, books: b };
  });
}
// 학생 확인: 비밀번호를 정해 둔 학생은 비밀번호가 맞아야 함
function student_(id, pw) {
  const s = students_().filter(function (x) { return x.id === String(id); })[0];
  if (!s) throw new Error('학생을 찾을 수 없습니다.');
  if (s.hash && hashPw_(String(pw || '').trim()) !== s.hash) throw new Error('비밀번호가 맞지 않습니다.');
  return s;
}

/************ 읽은 책 ************/
function books_() {
  return rows_(sheet_(SHEET_BOOKS, BOOKS_HEADER_)).map(function (r) {
    return { rid: str_(r[0]), ts: str_(r[1]), sid: str_(r[2]), date: str_(r[3]), title: str_(r[4]), author: str_(r[5]), publisher: str_(r[6]),
      note: str_(r[7]), status: str_(r[8]) || 'pending', classBookId: str_(r[9]), cover: str_(r[10]), memo: str_(r[11]), pages: Number(str_(r[12])) || 0, extra: str_(r[13]) };
  }).filter(function (b) { return b.rid; });
}
function classBooks_() {
  return rows_(sheet_(SHEET_CLASSBOOKS, CLASSBOOKS_HEADER_)).map(function (r) {
    return { id: str_(r[0]), title: str_(r[1]), author: str_(r[2]), publisher: str_(r[3]), due: str_(r[4]), cover: str_(r[5]) };
  }).filter(function (c) { return c.id; });
}
function pages_(v) { const n = Math.floor(Number(v)); return (n > 0 && n < 100000) ? String(n) : ''; }
function extra_(v) { if (!v || typeof v !== 'object') return ''; let t = ''; try { t = JSON.stringify(v); } catch (e) { t = ''; } return (t.length <= 1000 && t !== '{}') ? t : ''; }
function cover_(u) { u = String(u || '').trim(); return /^https:\/\/[^\s"'<>]{1,400}$/.test(u) ? u : ''; }   // 표지는 https 그림 주소만

// 학생 화면: 내 기록 + 학급 도서(내가 읽었는지)
function getMyBooks(id, pw) {
  const s = student_(id, pw);
  const mine = books_().filter(function (b) { return b.sid === s.id; });
  const all = books_(), total = students_().length;
  const cbs = classBooks_().map(function (c) {
    const readers = {};
    all.forEach(function (b) { if (b.classBookId === c.id && b.status === 'approved') readers[b.sid] = 1; });
    const my = mine.filter(function (b) { return b.classBookId === c.id && b.status !== 'returned'; })[0];
    c.read = Object.keys(readers).length; c.total = total; c.my = my ? my.status : '';
    return c;
  });
  return {
    student: pub_(s),
    approved: mine.filter(function (b) { return b.status === 'approved'; }).length,
    pending: mine.filter(function (b) { return b.status === 'pending'; }).length,
    books: mine.reverse().slice(0, 200).map(function (b) { delete b.sid; delete b.ts; return b; }),
    classBooks: cbs
  };
}
function addBook(id, pw, o) {
  const s = student_(id, pw);
  o = o || {};
  const title = clean_(o.title, 100);
  if (!title) throw new Error('책 제목을 적어 주세요.');
  return withLock_(function () {
    let cbid = '';
    if (o.classBookId) { cbid = classBooks_().some(function (c) { return c.id === String(o.classBookId); }) ? String(o.classBookId) : ''; }
    const rid = Utilities.getUuid().slice(0, 12);
    sheet_(SHEET_BOOKS, BOOKS_HEADER_).appendRow([rid, Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm'), s.id, today_(), title,
      clean_(o.author, 60), clean_(o.publisher, 60), clean_(o.note, 2000), 'pending', cbid, cover_(o.cover), '', pages_(o.pages), extra_(o.extra)]);
    return { ok: true, rid: rid };
  });
}
// 선생님이 '다시 써 오기'로 돌려준 기록(또는 아직 승인 전 기록)의 감상을 고쳐 다시 보냄
function rewriteBook(id, pw, rid, note) {
  const s = student_(id, pw);
  return withLock_(function () {
    const sh = sheet_(SHEET_BOOKS, BOOKS_HEADER_), row = findRow_(sh, rid);
    if (!row) throw new Error('기록을 찾을 수 없습니다.');
    const r = sh.getRange(row, 1, 1, BOOKS_HEADER_.length).getValues()[0];
    if (str_(r[2]) !== s.id) throw new Error('내 기록이 아닙니다.');
    if (str_(r[8]) === 'approved') throw new Error('이미 승인된 기록입니다.');
    sh.getRange(row, 8).setValue(clean_(note, 2000));
    sh.getRange(row, 9).setValue('pending');
    return { ok: true };
  });
}

// 학생이 아직 승인받지 않은 자기 기록을 지움 (잘못 올렸을 때)
function deleteMyBook(id, pw, rid) {
  const s = student_(id, pw);
  return withLock_(function () {
    const n = deleteRowsWhere_(sheet_(SHEET_BOOKS, BOOKS_HEADER_), function (r) { return str_(r[0]) === String(rid) && str_(r[2]) === s.id && str_(r[8]) !== 'approved'; });
    if (!n) throw new Error('지울 수 없는 기록입니다. (이미 승인되었거나 없는 기록)');
    return { ok: true };
  });
}

/************ 현황판 (누구나) ************/
function getBoard() {
  const st = students_(), set = getSettings(), all = books_();
  const ok = all.filter(function (b) { return b.status === 'approved'; });
  const cnt = {};
  ok.forEach(function (b) { cnt[b.sid] = (cnt[b.sid] || 0) + 1; });
  const classBooks = classBooks_().map(function (c) {
    const readers = {};
    ok.forEach(function (b) { if (b.classBookId === c.id) readers[b.sid] = 1; });
    c.read = Object.keys(readers).length; c.total = st.length;
    return c;
  });
  const byId = {};
  st.forEach(function (s) { byId[s.id] = s; });
  const valid = ok.filter(function (b) { return byId[b.sid]; });
  const days = {};
  valid.forEach(function (b) { if (isDate_(b.date)) days[b.date] = (days[b.date] || 0) + 1; });
  return {
    title: title_(), bookCm: BOOK_CM, total: valid.length, students: st.length, days: days,
    showNames: set.showNames,
    ranks: set.showNames ? st.map(function (s) { return { name: s.name, count: cnt[s.id] || 0 }; }).sort(function (a, b) { return b.count - a.count; }) : null,
    recent: valid.slice(-40).reverse().map(function (b) { return { title: b.title, name: set.showNames ? byId[b.sid].name : '' }; }),
    classBooks: classBooks
  };
}

/************ 선생님 화면 ************/
function getAllDataAdmin(token) {
  admin_(token);
  return { students: students_().map(pub_), books: books_(), classBooks: classBooks_(), settings: getSettings(), sheetUrl: getSS_().getUrl(), sheetName: getSS_().getName(), shell: SHELL_VERSION };
}
function setStatus_(rids, status, memo) {
  return withLock_(function () {
    const sh = sheet_(SHEET_BOOKS, BOOKS_HEADER_), rows = rows_(sh), want = {};
    (Array.isArray(rids) ? rids : [rids]).forEach(function (r) { want[String(r)] = 1; });
    let n = 0;
    rows.forEach(function (r, i) {
      if (!want[str_(r[0])]) return;
      sh.getRange(i + 2, 9).setValue(status);
      sh.getRange(i + 2, 12).setValue(clean_(memo || '', 200));
      n++;
    });
    return { ok: true, changed: n };
  });
}
function approveBooks(token, rids) { admin_(token); return setStatus_(rids, 'approved', ''); }
function returnBook(token, rid, memo) { admin_(token); return setStatus_([rid], 'returned', memo); }
function deleteBook(token, rid) {
  admin_(token);
  return withLock_(function () {
    return { ok: true, deleted: deleteRowsWhere_(sheet_(SHEET_BOOKS, BOOKS_HEADER_), function (r) { return str_(r[0]) === String(rid); }) };
  });
}
// 선생님이 기록을 고침 (제목 오타 등). 넘겨준 항목만 바뀜
function updateBookAdmin(token, rid, o) {
  admin_(token);
  o = o || {};
  return withLock_(function () {
    const sh = sheet_(SHEET_BOOKS, BOOKS_HEADER_), row = findRow_(sh, rid);
    if (!row) throw new Error('기록을 찾을 수 없습니다.');
    if (o.title !== undefined && clean_(o.title, 100)) sh.getRange(row, 5).setValue(clean_(o.title, 100));
    if (o.author !== undefined) sh.getRange(row, 6).setValue(clean_(o.author, 60));
    if (o.publisher !== undefined) sh.getRange(row, 7).setValue(clean_(o.publisher, 60));
    if (o.note !== undefined) sh.getRange(row, 8).setValue(clean_(o.note, 2000));
    if (o.date !== undefined && isDate_(o.date)) sh.getRange(row, 4).setValue(String(o.date));
    if (o.cover !== undefined) sh.getRange(row, 11).setValue(cover_(o.cover));
    if (o.pages !== undefined) sh.getRange(row, 13).setValue(pages_(o.pages));
    if (o.extra !== undefined) sh.getRange(row, 14).setValue(extra_(o.extra));
    return { ok: true };
  });
}
// 책 기록 모두 지우기 (새 학년 시작). 학생 명단·학급 도서·설정은 그대로
function resetBooks(token) {
  admin_(token);
  return withLock_(function () {
    return { ok: true, deleted: deleteRowsWhere_(sheet_(SHEET_BOOKS, BOOKS_HEADER_), function () { return true; }) };
  });
}
function addClassBook(token, o) {
  admin_(token);
  o = o || {};
  const title = clean_(o.title, 100);
  if (!title) throw new Error('책 제목을 적어 주세요.');
  const due = isDate_(o.due) ? String(o.due) : '';
  return withLock_(function () {
    const id = Utilities.getUuid().slice(0, 8);
    sheet_(SHEET_CLASSBOOKS, CLASSBOOKS_HEADER_).appendRow([id, title, clean_(o.author, 60), clean_(o.publisher, 60), due, cover_(o.cover), today_()]);
    return { ok: true, id: id };
  });
}
// 학급 도서에서 빼기 — 아이들이 이미 쓴 기록은 그대로 남고, 학급 도서 표시만 사라짐
function removeClassBook(token, id) {
  admin_(token);
  return withLock_(function () {
    return { ok: true, deleted: deleteRowsWhere_(sheet_(SHEET_CLASSBOOKS, CLASSBOOKS_HEADER_), function (r) { return str_(r[0]) === String(id); }) };
  });
}

/************ 선생님만 보는 저장칸 (열쇠처럼 화면에 드러나면 안 되는 설정) ************/
function private_() {
  try { const o = JSON.parse(PropertiesService.getScriptProperties().getProperty('PRIVATE') || '{}'); return (o && typeof o === 'object') ? o : {}; } catch (e) { return {}; }
}
function getPrivateAdmin(token) { admin_(token); return private_(); }
function setPrivate(token, patch) {
  admin_(token);
  const cur = merge_(private_(), (patch && typeof patch === 'object') ? patch : {}, 8000);
  PropertiesService.getScriptProperties().setProperty('PRIVATE', JSON.stringify(cur));
  return cur;
}

/************ 전국판 보고 (준비) ************
 * 아직 전국판(Read Up!)은 없습니다. 나중에 껍데기를 바꾸지 않고 참여할 수 있도록 길만 만들어 둡니다.
 * 선생님만 보는 저장칸의 nat = { on, key, collector, name, showName } 이 채워져 있을 때만 보냅니다.
 * 보내는 내용은 이 껍데기가 정합니다: 가린 이름·권수 같은 요약뿐이고 감상 글은 보내지 않습니다.
 * 참여 열쇠(key)는 화면에 내보내지 않습니다.
 */
function natMask_(n) { n = String(n || ''); return n ? n.charAt(0) + n.slice(1).replace(/./g, '○') : ''; }
function natReport() {
  const nat = private_().nat || {};
  if (!nat.on || !nat.key || !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(String(nat.collector || ''))) return { ok: false, off: true };
  const cache = CacheService.getScriptCache();
  if (cache.get('NAT_SENT')) return { ok: true, skipped: true };       // 10분에 한 번만
  cache.put('NAT_SENT', '1', 600);
  const b = getBoard(), st = students_(), cnt = {};
  books_().forEach(function (x) { if (x.status === 'approved') cnt[x.sid] = (cnt[x.sid] || 0) + 1; });
  const payload = {
    v: 1, shell: SHELL_VERSION, key: String(nat.key), name: str_(nat.name).slice(0, 30), showName: !!nat.showName,
    registered: st.length, total: b.total, bookCm: BOOK_CM, days: b.days,
    students: st.map(function (s) { return { k: hashPw_('ru-student|' + nat.key + '|' + s.id).slice(0, 10), n: natMask_(s.name), g: s.grade, c: cnt[s.id] || 0 }; })
  };
  const res = UrlFetchApp.fetch(String(nat.collector), { method: 'post', contentType: 'text/plain;charset=utf-8', payload: JSON.stringify({ fn: 'report', args: [payload] }), muteHttpExceptions: true });
  return { ok: res.getResponseCode() === 200 };
}
