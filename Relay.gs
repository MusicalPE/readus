/*************************************************************
 * Read Us! 리더스 — 책 검색 중계기 (Relay.gs)
 * ------------------------------------------------------------
 * 운영자(음악적체육인)만 설치하는 파일입니다. 학교에서는 설치하지 않습니다.
 * 학교 화면이 책 제목을 보내면, 이 중계기가 다음(카카오) 책 검색에 물어보고
 * 제목·지은이·출판사·표지 그림 주소만 돌려줍니다.
 * 검색 열쇠는 이 스크립트의 '스크립트 속성' KAKAO_KEY 에만 넣어 두므로 화면에 드러나지 않습니다.
 *
 * 설치: 빈 Apps Script 에 붙여 넣기 → 프로젝트 설정 → 스크립트 속성에 KAKAO_KEY = (카카오 REST API 키)
 *       → 배포(웹 앱, 다음 사용자로 실행 = 나, 액세스 = 모든 사용자) → 나온 주소를 relay.json 에 적기
 * 검색 결과는 저장하지 않습니다.
 *************************************************************/
const RELAY_VERSION = 1;
const KAKAO_BOOK_URL = 'https://dapi.kakao.com/v3/search/book';
const MAX_PER_MINUTE = 120;      // 1분 동안 받는 검색 수 (모든 학교 합쳐서)

function doGet(e) {
  const q = String((e && e.parameter && e.parameter.q) || '').trim().slice(0, 50);
  let out;
  try {
    if (!q) throw new Error('검색어가 없습니다.');
    const cache = CacheService.getScriptCache(), slot = 'n' + Math.floor(Date.now() / 60000);
    const n = Number(cache.get(slot) || 0);
    if (n >= MAX_PER_MINUTE) throw new Error('지금 검색이 많아요. 잠시 뒤에 다시 해 주세요.');
    cache.put(slot, String(n + 1), 120);
    const key = PropertiesService.getScriptProperties().getProperty('KAKAO_KEY');
    if (!key) throw new Error('중계기에 검색 열쇠가 없습니다.');
    const res = UrlFetchApp.fetch(KAKAO_BOOK_URL + '?target=title&size=8&query=' + encodeURIComponent(q),
      { headers: { Authorization: 'KakaoAK ' + key }, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('책 검색이 잠시 안 돼요. (' + res.getResponseCode() + ')');
    const docs = (JSON.parse(res.getContentText()).documents) || [];
    out = { ok: true, relay: RELAY_VERSION, books: docs.map(function (d) {
      return { title: String(d.title || ''), author: (d.authors || []).join(', '), publisher: String(d.publisher || ''),
        cover: /^https:\/\//.test(String(d.thumbnail || '')) ? String(d.thumbnail) : '' };
    }).filter(function (b) { return b.title; }) };
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
