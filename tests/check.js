// 코드 검사 (단순 수정 때도 꼭) — 서버·브라우저 없이 바로 끝남
//   node tests/check.js
// 보는 것: 문법 오류(따옴표·괄호 짝), 화면이 부르는 껍데기 함수가 실제로 있는지,
//          단추·입력칸 id 가 화면에 있는지, 판 번호가 파일마다 같은지
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let bad = 0;
const fail = m => { bad++; console.log('  걸림: ' + m); };
const pass = m => console.log('  통과: ' + m);

// 1. 문법
const shell = read('Shell.gs'), relay = read('Relay.gs'), html = read('index.html');
[['Shell.gs', shell], ['Relay.gs', relay]].forEach(([n, src]) => {
  try { new vm.Script(src, { filename: n }); pass(n + ' 문법'); } catch (e) { fail(n + ' 문법 오류: ' + e.message); }
});
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (!scripts.length) fail('index.html 에 스크립트가 없음');
scripts.forEach((src, i) => { try { new vm.Script(src, { filename: 'index.html#' + i }); pass('index.html 스크립트 문법'); } catch (e) { fail('index.html 스크립트 문법 오류: ' + e.message); } });
if ((html.match(/<script\b/g) || []).length !== (html.match(/<\/script>/g) || []).length) fail('index.html <script> 짝이 안 맞음');
[...html.matchAll(/<script src="([^"]+)"/g)].forEach(m => { if (!/^https?:/.test(m[1]) && !fs.existsSync(path.join(root, m[1]))) fail('불러오는 파일이 저장소에 없음: ' + m[1]); });

// 2. 화면이 부르는 함수가 껍데기에 있고, 허용 목록에도 있는지
const allow = (shell.match(/const RPC_ALLOW_ = \[([\s\S]*?)\];/) || [, ''])[1].match(/'[^']+'/g).map(s => s.slice(1, -1));
const defined = new Set([...shell.matchAll(/^function (\w+)\(/gm)].map(m => m[1]));
const called = new Set([...html.matchAll(/\b(?:rpc|act)\('(\w+)'/g)].map(m => m[1]));
called.forEach(fn => {
  if (!allow.includes(fn)) fail('화면이 부르는 ' + fn + ' 이(가) 껍데기 허용 목록에 없음');
  else if (!defined.has(fn)) fail('화면이 부르는 ' + fn + ' 함수가 껍데기에 없음');
});
allow.forEach(fn => { if (!defined.has(fn)) fail('허용 목록의 ' + fn + ' 함수가 껍데기에 없음'); });
pass('화면이 부르는 껍데기 함수 ' + called.size + '개 확인');

// 3. 화면 코드가 찾는 id 가 실제로 그려지는지 ($('#이름') ↔ id="이름")
const ids = new Set([...html.matchAll(/\bid="([^"' +]+)"/g)].map(m => m[1]));
[...html.matchAll(/\$\('#([\w-]+)'/g)].map(m => m[1]).forEach(id => { if (!ids.has(id)) fail("화면에 없는 id 를 찾음: #" + id); });
// 앞에 붙는 말(prefix)로 만드는 id: 책 찾기 칸 (s/c + q·find·found)
['s', 'c'].forEach(p => { if (!html.includes("searchBox('" + p + "')") || !html.includes("wireSearch('" + p + "'")) fail('책 찾기 칸 ' + p + ' 연결이 빠짐'); });
pass('단추·입력칸 id 확인');

// 4. 판 번호
const appVer = (html.match(/version: '([\d.]+)'/) || [])[1];
const need = +(html.match(/requiredShell: (\d+)/) || [])[1];
const shellVer = +(shell.match(/const SHELL_VERSION = (\d+)/) || [])[1];
const log = JSON.parse(read('changelog.json'));
if (!appVer) fail('index.html 에서 화면 판 번호를 못 찾음');
if (log[0].version !== appVer) fail('changelog.json 맨 위 판(' + log[0].version + ')과 화면 판(' + appVer + ')이 다름');
if (!(shellVer >= need)) fail('껍데기 판(' + shellVer + ')이 화면이 요구하는 판(' + need + ')보다 낮음');
if (!read('README.md').includes('껍데기 ' + shellVer + '판')) fail('README.md 의 껍데기 판 표기가 ' + shellVer + '판이 아님');
pass('판 번호: 화면 ' + appVer + ' · 껍데기 ' + shellVer + '판');

// 4-2. 앱 설치 파일
try { new vm.Script(read('sw.js'), { filename: 'sw.js' }); } catch (e) { fail('sw.js 문법 오류: ' + e.message); }
const mf = JSON.parse(read('manifest.webmanifest'));
mf.icons.concat([{ src: 'icons/icon.svg' }, { src: 'icons/icon-dark.svg' }, { src: 'icons/apple-touch-icon.png' }]).forEach(i => { if (!fs.existsSync(path.join(root, i.src))) fail('아이콘 파일이 없음: ' + i.src); });
pass('앱 설치 파일 (설명 파일·아이콘·서비스 워커)');
const nb = ((html.match(/var BOOKS = \[(.*)\];/) || [])[1] || '').split('],[').length;
for (let i = 1; i <= nb; i++) { const f = 'img/books/b' + String(i).padStart(2, '0') + '.webp'; if (!fs.existsSync(path.join(root, f))) fail('책 그림이 없음: ' + f); }
Object.keys(eval('({' + ((html.match(/var CMP_W = \{(.*)\};/) || [])[1] || '') + '})')).forEach(k => { if (!fs.existsSync(path.join(root, 'img/cmp/' + k + '.webp'))) fail('비교 그림이 없음: ' + k); });
[...html.matchAll(/img: '(\w+)'/g)].forEach(x => { if (!fs.existsSync(path.join(root, 'img/cmp/' + x[1] + '.webp'))) fail('목표가 쓰는 비교 그림이 없음: ' + x[1]); });
if (nb !== 12) fail('책 그림 표가 12권이 아님: ' + nb); else pass('책 그림 12권');
const og = (html.match(/og:image" content="https:\/\/musicalpe\.github\.io\/readus\/([^"?]+)/) || [])[1];
if (!og || !fs.existsSync(path.join(root, og))) fail('카카오톡 썸네일 그림이 없음: ' + og); else pass('카카오톡 썸네일 그림 ' + og);

// 5. 공개 저장소에 들어가면 안 되는 것
JSON.parse(read('relay.json'));
if (/KakaoAK [0-9a-f]{20,}/i.test(relay + html + shell)) fail('검색 열쇠가 코드에 들어 있음');
pass('검색 열쇠가 코드에 없음');

console.log(bad ? '\n코드 검사: ' + bad + '건 걸림 — 올리지 말고 먼저 고치기' : '\n코드 검사: 모두 통과');
process.exit(bad ? 1 : 0);
