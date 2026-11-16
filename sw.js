/* 리더스 서비스 워커 — 홈 화면·바탕화면에 앱으로 설치할 수 있게 함
   · 같은 출처 파일(화면·아이콘): 인터넷 먼저, 안 되면 기억해 둔 것 (늘 최신 화면을 씀)
   · 학교 시트(구글)·책 검색 요청은 손대지 않음 — 기록은 늘 학교 시트로 바로 감 */
var C = 'readus-shell';
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) {
  var req = e.request, u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== self.location.origin) return;
  // 화면(html)과 바뀌는 파일은 브라우저가 들고 있는 사본을 쓰지 않고 늘 새로 확인 — 올린 판이 바로 보이게
  var fresh = req.mode === 'navigate' || /\.(html|js|json|webmanifest)$/.test(u.pathname) || /\/$/.test(u.pathname);
  e.respondWith(fetch(fresh ? new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : req).then(function (r) {
    if (r.ok && !/\.json$/.test(u.pathname)) { var copy = r.clone(); caches.open(C).then(function (c) { c.put(req, copy); }); }
    return r;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then(function (m) { return m || Response.error(); });
  }));
});
