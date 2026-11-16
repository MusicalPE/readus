/* 리더스 미리보기(?demo) — 설치 없이 둘러보는 지어낸 학급
   · 학교 시트 대신, 껍데기(Shell.gs)를 이 브라우저 안에서 그대로 돌린다. (dev/gas-emu.js 를 브라우저용으로 옮긴 것)
   · 학생 이름과 감상은 모두 지어낸 것이고, 눌러 본 내용은 저장되지 않는다. 새로 고치면 처음 상태로 돌아간다. */
(function () {
  'use strict';
  /* ---- 작은 SHA-256 (동기) ---- */
  function sha256Bytes(str) {
    var K = [], H = [], i, j, isPrime = function (n) { for (var f = 2; f * f <= n; f++) if (n % f === 0) return false; return true; }, frac = function (x) { return ((x - Math.floor(x)) * 4294967296) | 0; };
    for (i = 2; K.length < 64; i++) if (isPrime(i)) { if (H.length < 8) H.push(frac(Math.pow(i, 1 / 2))); K.push(frac(Math.pow(i, 1 / 3))); }
    var bytes = Array.from(new TextEncoder().encode(String(str))), l = bytes.length * 8;
    bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
    for (i = 7; i >= 0; i--) bytes.push(i > 3 ? 0 : (l >>> (i * 8)) & 255);
    var rr = function (v, n) { return (v >>> n) | (v << (32 - n)); };
    for (var o = 0; o < bytes.length; o += 64) {
      var w = [];
      for (i = 0; i < 16; i++) w[i] = (bytes[o + i * 4] << 24) | (bytes[o + i * 4 + 1] << 16) | (bytes[o + i * 4 + 2] << 8) | bytes[o + i * 4 + 3];
      for (i = 16; i < 64; i++) { var s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0; }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var t1 = (h + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0, t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H = [(H[0] + a) | 0, (H[1] + b) | 0, (H[2] + c) | 0, (H[3] + d) | 0, (H[4] + e) | 0, (H[5] + f) | 0, (H[6] + g) | 0, (H[7] + h) | 0];
    }
    var out = [];
    for (i = 0; i < 8; i++) for (j = 3; j >= 0; j--) { var v = (H[i] >>> (j * 8)) & 255; out.push(v > 127 ? v - 256 : v); }
    return out;
  }
  /* ---- 가짜 시트 ---- */
  function makeSheet(name) {
    var rows = [];
    var sh = {
      getName: function () { return name; }, getLastRow: function () { return rows.length; }, getMaxRows: function () { return 1000; },
      getLastColumn: function () { return rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0); },
      appendRow: function (arr) { rows.push(arr.slice()); },
      insertColumnBefore: function (c) { rows.forEach(function (r) { r.splice(c - 1, 0, ''); }); },
      deleteRow: function (r) { rows.splice(r - 1, 1); }, deleteRows: function (r, n) { rows.splice(r - 1, n); },
      getDataRange: function () { return sh.getRange(1, 1, Math.max(rows.length, 1), Math.max(sh.getLastColumn(), 1)); },
      getRange: function (r, c, nr, nc) {
        nr = nr || 1; nc = nc || 1;
        var get = function (i, j) { var row = rows[r - 1 + i], v = row ? row[c - 1 + j] : undefined; return v === undefined || v === null ? '' : v; };
        var set = function (i, j, v) { while (rows.length < r + i) rows.push([]); var row = rows[r - 1 + i]; while (row.length < c + j) row.push(''); row[c - 1 + j] = v; };
        return {
          getValue: function () { return get(0, 0); }, setValue: function (v) { set(0, 0, v); }, setNumberFormat: function () {},
          getValues: function () { if (!rows.length) return [[]]; var out = []; for (var i = 0; i < nr; i++) { var rr = []; for (var j = 0; j < nc; j++) rr.push(get(i, j)); out.push(rr); } return out; },
          setValues: function (vals) { vals.forEach(function (rr, i) { rr.forEach(function (v, j) { set(i, j, v); }); }); }
        };
      }
    };
    return sh;
  }
  /* ---- 시계: 지난 기록을 채울 때만 뒤로 돌린다 ---- */
  var offset = 0, RealDate = Date;
  function FakeDate(a) { return arguments.length ? new (Function.prototype.bind.apply(RealDate, [null].concat([].slice.call(arguments))))() : new RealDate(RealDate.now() + offset); }
  FakeDate.now = function () { return RealDate.now() + offset; }; FakeDate.prototype = RealDate.prototype; FakeDate.parse = RealDate.parse; FakeDate.UTC = RealDate.UTC;
  var pad = function (n) { return String(n).padStart(2, '0'); }, uid = 0;
  function gas(title) {
    var sheets = {}, props = {}, cache = {};
    var ss = { getName: function () { return title; }, getUrl: function () { return 'https://docs.google.com/spreadsheets/d/READUS-DEMO/edit'; }, getSheetByName: function (n) { return sheets[n] || null; }, insertSheet: function (n) { return (sheets[n] = makeSheet(n)); }, getSheets: function () { return Object.keys(sheets).map(function (k) { return sheets[k]; }); } };
    return {
      Date: FakeDate,
      SpreadsheetApp: { getActiveSpreadsheet: function () { return ss; } },
      PropertiesService: { getScriptProperties: function () { return { getProperty: function (k) { return k in props ? props[k] : null; }, setProperty: function (k, v) { props[k] = String(v); }, deleteProperty: function (k) { delete props[k]; }, getProperties: function () { return Object.assign({}, props); } }; } },
      CacheService: { getScriptCache: function () { return { get: function (k) { return cache[k] || null; }, put: function (k, v) { cache[k] = String(v); }, remove: function (k) { delete cache[k]; }, removeAll: function (ks) { ks.forEach(function (k) { delete cache[k]; }); } }; } },
      Utilities: {
        getUuid: function () { uid++; var h = sha256Bytes('readus-demo-' + uid + '-' + Math.random()).map(function (b) { return ((b + 256) % 256).toString(16).padStart(2, '0'); }).join(''); return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20, 32); },
        DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
        computeDigest: function (alg, s) { return sha256Bytes(s); },
        formatDate: function (d, tz, f) { d = new RealDate(d); return f.replace('yyyy', d.getFullYear()).replace('MM', pad(d.getMonth() + 1)).replace('dd', pad(d.getDate())).replace('HH', pad(d.getHours())).replace('mm', pad(d.getMinutes())).replace('ss', pad(d.getSeconds())); }
      },
      Session: { getScriptTimeZone: function () { return 'Asia/Seoul'; } },
      ContentService: { MimeType: { JSON: 'json' }, createTextOutput: function (t) { return { content: t, setMimeType: function () { return this; }, getContent: function () { return this.content; } }; } },
      HtmlService: { createHtmlOutput: function (h) { return { content: h, setTitle: function () { return this; }, addMetaTag: function () { return this; }, getContent: function () { return this.content; } }; } },
      ScriptApp: { getService: function () { return { getUrl: function () { return 'https://script.google.com/macros/s/READUS-DEMO/exec'; } }; } },
      UrlFetchApp: { fetch: function () { throw new Error('미리보기에서는 바깥으로 요청을 보내지 않아요.'); } },
      LockService: { getScriptLock: function () { return { waitLock: function () {}, tryLock: function () { return true; }, releaseLock: function () {} }; } },
      Logger: { log: function () {} }
    };
  }

  /* ---- 지어낸 학급 ---- */
  var NAMES = ['강태윤', '한지우', '오세린', '배준서', '임하늘', '문도윤', '서가온', '채은호', '노아린', '표민재', '길서우', '양도현', '선유나', '마은성', '도하람', '진예준', '우시현', '방다온', '현재이', '탁민서'];
  var BOOKS = [
    ['마당을 나온 암탉', '황선미', '사계절'], ['책 먹는 여우', '프란치스카 비어만', '주니어김영사'], ['푸른 사자 와니니', '이현', '창비'], ['강아지똥', '권정생', '길벗어린이'],
    ['만복이네 떡집', '김리리', '비룡소'], ['알사탕', '백희나', '책읽는곰'], ['수박 수영장', '안녕달', '창비'], ['샬롯의 거미줄', 'E. B. 화이트', '시공주니어'],
    ['잘못 뽑은 반장', '이은재', '주니어김영사'], ['5번 레인', '은소홀', '문학동네'], ['꽃들에게 희망을', '트리나 폴러스', '시공주니어'], ['아낌없이 주는 나무', '셸 실버스타인', '시공주니어'],
    ['몽실 언니', '권정생', '창비'], ['초정리 편지', '배유안', '창비'], ['불량한 자전거 여행', '김남중', '창비'], ['고양이 해결사 깜냥', '홍민정', '창비'],
    ['이상한 과자 가게 전천당', '히로시마 레이코', '길벗스쿨'], ['한밤중 달빛 식당', '이분희', '비룡소'], ['책과 노니는 집', '이영서', '문학동네'], ['프린들 주세요', '앤드루 클레먼츠', '사계절'],
    ['내 이름은 삐삐 롱스타킹', '아스트리드 린드그렌', '시공주니어'], ['찰리와 초콜릿 공장', '로알드 달', '시공주니어'], ['화요일의 두꺼비', '러셀 에릭슨', '사계절'], ['가방 들어주는 아이', '고정욱', '사계절'],
    ['까막눈 삼디기', '원유순', '웅진주니어'], ['엄마 사용법', '김성진', '창비'], ['축구왕 이채연', '유우석', '창비'], ['기호 3번 안석뽕', '진형민', '창비'],
    ['해리엇', '한윤섭', '문학동네'], ['장수탕 선녀님', '백희나', '책읽는곰'], ['이파라파 냐무냐무', '이지은', '사계절'], ['팥빙수의 전설', '이지은', '웅진주니어'],
    ['나쁜 어린이 표', '황선미', '이마주'], ['무기 팔지 마세요!', '위기철', '청년사'], ['수상한 아파트', '박현숙', '북멘토'], ['마법의 설탕 두 조각', '미하엘 엔데', '소년한길']
  ];
  var S1 = ['처음에는 조금 어려웠는데 읽을수록 재미있었다.', '주인공이 포기하지 않는 모습이 가장 기억에 남는다.', '친구가 추천해 줘서 읽었는데 생각보다 훨씬 좋았다.', '마지막 장면에서 마음이 뭉클했다.', '그림과 글이 잘 어울려서 금방 읽었다.', '제목만 보고 골랐는데 내용이 전혀 달라서 놀랐다.'];
  var S2 = ['나라면 그렇게 하지 못했을 것 같다.', '주인공에게 잘했다고 말해 주고 싶다.', '나도 비슷한 일이 있어서 주인공 마음을 알 것 같았다.', '동생에게도 읽어 주고 싶다.', '읽고 나서 우리 가족이 떠올랐다.', '친구와 다퉜던 일이 생각나서 먼저 사과하고 싶어졌다.'];
  var S3 = ['다음에는 같은 작가의 다른 책도 읽어 보고 싶다.', '우리 반 친구들에게 권하고 싶은 책이다.', '한 번 더 읽으면 새로운 것이 보일 것 같다.', '작은 일도 끝까지 해 보자고 다짐했다.', '뒷이야기가 궁금해서 직접 써 보고 싶다.', '용기는 큰 것이 아니라는 걸 알게 되었다.'];
  var BOOK_LIST = BOOKS.map(function (b) { return { title: b[0], author: b[1], publisher: b[2], cover: '' }; });

  var api = null, allow = null, DEMO_PW = 'readus-demo-open';
  function note(i) { return S1[i % 6] + ' ' + S2[(i * 5 + 1) % 6] + ' ' + S3[(i * 7 + 2) % 6]; }
  function build(src) {
    var env = gas('햇살초 5학년 1반');
    var names = []; src.replace(/^function (\w+)\(/gm, function (m, n) { names.push(n); });
    var keys = Object.keys(env);
    var make = new Function(keys.join(','), src + '\nreturn { RPC_ALLOW_: RPC_ALLOW_, fns: {' + names.map(function (n) { return n + ':' + n; }).join(',') + '} };');
    var got = make.apply(null, keys.map(function (k) { return env[k]; }));
    var g = got.fns; allow = got.RPC_ALLOW_;
    var DAY = 86400000, t = g.verifyAdminPassword('1234').token;
    offset = -36 * DAY;
    g.addStudentsBulk(t, NAMES.map(function (name, i) { return { grade: '5', cls: '1', number: String(i + 1), name: name }; }));
    g.setSettings(t, { extra: { grade: '5' } });
    var ids = g.getStudentsPublic().map(function (s) { return s.id; });
    // 학생마다 읽은 권수가 다르게 (많이 읽는 친구, 이제 시작한 친구)
    var per = [9, 7, 6, 6, 5, 5, 5, 4, 4, 4, 4, 3, 3, 3, 3, 2, 2, 2, 1, 0], queue = [], k = 0;
    ids.forEach(function (id, si) { for (var n = 0; n < per[si]; n++) { queue.push({ id: id, book: BOOKS[(si * 5 + n * 7) % BOOKS.length], n: k++ }); } });
    queue.sort(function (a, b) { return ((a.n * 37) % 78) - ((b.n * 37) % 78); });
    var rids = [];
    queue.forEach(function (q, i) {
      offset = -Math.round((34 - 33 * i / queue.length)) * DAY - (i % 5) * 3600000;
      rids.push(g.addBook(q.id, '', { title: q.book[0], author: q.book[1], publisher: q.book[2], note: note(q.n) }).rid);
    });
    offset = -12 * DAY;
    var cb1 = g.addClassBook(t, { title: '긴긴밤', author: '루리', publisher: '문학동네', due: fmt(RealDate.now() + 9 * DAY) }).id;
    ids.slice(0, 13).forEach(function (id, i) {
      offset = -(10 - (i % 8)) * DAY;
      rids.push(g.addBook(id, '', { title: '긴긴밤', author: '루리', publisher: '문학동네', classBookId: cb1, note: ['노든이 혼자 남았을 때 정말 슬펐다. 그래도 끝까지 걸어가는 모습이 멋졌다. 나도 힘들 때 포기하지 않고 싶다.', '치쿠와 윔보가 알을 지키는 장면이 기억에 남는다. 가족이 아니어도 서로 돌볼 수 있다는 걸 알았다. 친구에게 더 잘해 주고 싶다.', '어린 펭귄이 바다를 찾아가는 마지막이 좋았다. 긴긴밤이라는 제목이 왜 붙었는지 알 것 같다. 한 번 더 읽고 싶다.'][i % 3] }).rid);
    });
    offset = -3 * DAY;
    g.addClassBook(t, { title: '푸른 사자 와니니', author: '이현', publisher: '창비', due: fmt(RealDate.now() + 23 * DAY) });
    g.approveBooks(t, rids);
    // 승인을 기다리는 기록과, 다시 써 오라고 돌려준 기록
    offset = -1 * DAY;
    g.addBook(ids[1], '', { title: '5번 레인', author: '은소홀', publisher: '문학동네', note: '수영 시합에서 지고도 다시 일어서는 나루가 대단했다. 나도 줄넘기 대회에서 떨어졌을 때가 생각났다. 결과보다 내가 얼마나 했는지가 중요하다는 걸 배웠다.' });
    g.addBook(ids[6], '', { title: '프린들 주세요', author: '앤드루 클레먼츠', publisher: '사계절', note: '펜을 프린들이라고 부르자는 생각이 재미있었다. 선생님이 사실은 닉을 응원하고 있었다는 게 놀라웠다. 나도 새로운 말을 하나 만들어 보고 싶다.' });
    var back = g.addBook(ids[18], '', { title: '화요일의 두꺼비', author: '러셀 에릭슨', publisher: '사계절', note: '재미있었다.' }).rid;
    g.returnBook(t, back, '어떤 장면이 재미있었는지 두세 문장으로 더 적어 볼까요?');
    offset = 0;
    g.addBook(ids[10], '', { title: '한밤중 달빛 식당', author: '이분희', publisher: '비룡소', note: '나쁜 기억을 내고 음식을 먹는 식당이 신기했다. 하지만 기억이 없어지면 나도 없어지는 것 같아서 무서웠다. 슬픈 기억도 내 것이라는 걸 알았다.' });
    g.changeAdminPassword(t, DEMO_PW);   // 처음 비밀번호 안내가 뜨지 않게
    api = g;
  }
  function fmt(ms) { var d = new RealDate(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  var ready = null;
  function load() {
    if (!ready) ready = fetch('Shell.gs', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('미리보기를 준비하지 못했어요.'); return r.text(); }).then(build);
    return ready;
  }
  window.READUS_DEMO = {
    // 화면의 rpc 를 대신 받는다. 선생님 비밀번호는 무엇을 넣어도 들어가진다.
    call: function (fn, args) {
      return load().then(function () {
        if (allow.indexOf(fn) === -1 || typeof api[fn] !== 'function') throw new Error('알 수 없는 요청: ' + fn);
        if (fn === 'verifyAdminPassword') return api.verifyAdminPassword(DEMO_PW);
        if (fn === 'changeAdminPassword') return { ok: true };   // 미리보기에서는 비밀번호를 바꾸지 않음
        return JSON.parse(JSON.stringify(api[fn].apply(null, args || [])));
      });
    },
    // 책 찾기: 바깥 검색 대신 미리 넣어 둔 어린이 책 목록에서 찾는다.
    search: function (q) {
      q = String(q || '').replace(/\s+/g, '');
      var hit = BOOK_LIST.concat([{ title: '긴긴밤', author: '루리', publisher: '문학동네', cover: '' }]).filter(function (b) { return (b.title + b.author).replace(/\s+/g, '').indexOf(q) >= 0; });
      return hit.slice(0, 8);
    }
  };
})();
