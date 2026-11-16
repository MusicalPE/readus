# 전체 시험 (기능을 고쳤을 때) — 가짜 학교 시트로 화면을 실제로 띄워 흐름을 밟아 봄
#   cd dev && npm install        (처음 한 번)
#   python3 tests/full.py
# 밟는 흐름: 연결 → 선생님 로그인 → 학생 등록 → 학급 도서(책 찾기) → 학생 기록(감상 기준 안내) →
#            승인·다시 써 오기 → 현황판 → 감상 고쳐 쓰기 → 이름 가리기 → 학생 비밀번호
import os, subprocess, sys, time, urllib.request, json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(os.environ.get('PORT', '8893'))
BASE = f'http://localhost:{PORT}'
URL = f'{BASE}/readus/?s=' + urllib.request.quote(f'{BASE}/exec', safe='')
steps, errors = [], []

def ok(name, cond, extra=''):
    steps.append((name, bool(cond)))
    print(('  통과: ' if cond else '  걸림: ') + name + (' — ' + extra if extra and not cond else ''))

srv = subprocess.Popen(['node', 'devserver.js'], cwd=os.path.join(ROOT, 'dev'), env=dict(os.environ, PORT=str(PORT)), stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
try:
    for _ in range(50):
        try: urllib.request.urlopen(BASE + '/__state', timeout=1); break
        except Exception: time.sleep(0.2)
    else:
        print(srv.stderr.read().decode()[:500]); sys.exit('시험 서버가 뜨지 않음 (cd dev && npm install 했는지 확인)')

    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': 1200, 'height': 900})
        pg.on('pageerror', lambda e: errors.append('JS: ' + str(e)))
        pg.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' and 'fonts.g' not in m.text and 'favicon' not in m.text and 'ERR_' not in m.text else None)
        pg.on('dialog', lambda d: d.accept())
        pg.add_init_script('window.print = function () { window.__printed = (window.__printed || 0) + 1; };')
        posts = []; pg.on('request', lambda r: posts.append(r.url) if r.method == 'POST' and r.url.endswith('/exec') else None)
        def toast(): return pg.locator('#toast').inner_text()
        def state(): return json.load(urllib.request.urlopen(BASE + '/__state'))['sheets']

        # 1. 연결·빈 현황판
        pg.goto(URL); pg.wait_for_selector('h1.headline')
        ok('처음 화면: 0권으로 열림', '0권' in pg.inner_text('h1.headline'))
        ok('학급 이름 표시', '햇살초' in pg.inner_text('#cls'))

        # 1-2. 접속 QR
        pg.click('#qr'); pg.wait_for_selector('.qrimg')
        dark = pg.evaluate("(document.querySelector('.qrimg path').getAttribute('d').match(/M/g) || []).length")
        ok('접속 QR 이 그려짐', dark > 300 and '들어오기' in pg.inner_text('.qrbox'), f'점 {dark}개')
        import re as _re
        ok('QR 주소는 학생 화면으로 바로 감', pg.evaluate('studentLink()').endswith('#student') and 'exec' in urllib.request.unquote(pg.evaluate('studentLink()')))
        pg.click('#qrx'); ok('QR 닫기', pg.locator('.shade').count() == 0)

        # 2. 선생님 로그인 (틀린 비밀번호 → 맞는 비밀번호)
        pg.click('[data-go=admin]'); pg.fill('#apw', '0000'); pg.click('#lg button[type=submit]'); pg.wait_for_timeout(300)
        ok('틀린 비밀번호는 막힘', '올바르지' in toast())
        pg.fill('#apw', '1234'); pg.click('#lg button[type=submit]'); pg.wait_for_selector('.menu')
        ok('선생님 로그인 → 메뉴 9개', pg.locator('.mi').count() == 9)

        # 3. 학생 등록
        pg.click('[data-tab=register]'); pg.fill('#bt', '5 1 1 김하늘\n5\t1\t2\t이도윤\n5,1,3,박서연'); pg.click('#bulk button[type=submit]')
        pg.wait_for_selector('table.t tbody tr:nth-child(3)')
        ok('학생 3명 등록 (빈칸·탭·쉼표)', pg.locator('table.t tbody tr').count() == 3)

        # 4. 학급 도서 — 책 찾기로 고르기
        pg.click('[data-tab=class]'); pg.fill('#cq', '알사탕'); pg.click('#cfind'); pg.wait_for_selector('#cfound .found')
        pg.locator('#cfound .found').first.click()
        ok('책 찾기로 제목·지은이·출판사 채움', pg.input_value('#ct') == '알사탕' and pg.input_value('#ca') == '백희나' and pg.input_value('#cp') == '책읽는곰')
        pg.fill('#cd', '2099-12-31'); pg.click('#cbf button[type=submit]'); pg.wait_for_selector('#cbl .cb')
        ok('학급 도서 등록', '3명 중' in pg.inner_text('#cbl') and '아직 안 읽은 친구 3명' in pg.inner_text('#cbl'))
        ok('표지 그림 주소 저장', state()['ClassBooks'][1][5] == 'https://example.com/cover.jpg')
        pg.locator('#cbl .cvbtn').first.click(); pg.wait_for_selector('#cvi')
        ok('표지를 누르면 크게 보기', '알사탕' in pg.inner_text('.qrbox') and pg.get_attribute('#cvi', 'alt') == '알사탕 표지')
        ok('큰 그림 주소 만들기', pg.evaluate("bigCover('https://search1.kakaocdn.net/thumb/R120x174.q85/?fname=http%3A%2F%2Ft1.daumcdn.net%2Fa')") == 'https://search1.kakaocdn.net/thumb/R480x696.q85/?fname=http%3A%2F%2Ft1.daumcdn.net%2Fa' and pg.evaluate("bigCover('https://example.com/cover.jpg')") == 'https://example.com/cover.jpg')
        pg.click('#cvx'); ok('크게 보기 닫기', pg.locator('.shade').count() == 0)

        # 5. 학생 기록 — 감상 기준 안내 (막지 않음)
        pg.click('[data-go=home]'); pg.wait_for_selector('h1.headline'); pg.click('[data-go=student]'); pg.wait_for_selector('.name')
        pg.locator('.name', has_text='김하늘').click(); pg.wait_for_selector('#rec')
        pg.fill('#t', '=1+1 수식 같은 제목'); pg.fill('#a', '지은이'); pg.fill('#n', '재미있었다.'); pg.click('#rec button[type=submit]')
        pg.wait_for_selector('#more')
        ok('감상이 짧으면 안내 창', '3문장 이상' in pg.inner_text('.sheet') and '지금은 1문장' in pg.inner_text('.sheet') and pg.locator('.q').count() == 3)
        pg.click('#more'); pg.wait_for_timeout(100)
        ok('"조금 더 써 볼게요" → 창 닫히고 저장 안 됨', pg.locator('.shade').count() == 0 and len(state().get('Books', [[]])) <= 1)
        pg.fill('#n', '잎싹이 용감했다. 나도 포기하지 않겠다. 친구에게 권하고 싶다.'); pg.click('#rec button[type=submit]')
        pg.wait_for_selector('.pill.wait'); pg.wait_for_timeout(200)
        ok('기준을 채우면 바로 저장 (승인 대기)', len(state()['Books']) == 2 and state()['Books'][1][8] == 'pending')
        ok('수식 같은 제목도 글자로 보임', '=1+1 수식 같은 제목' in pg.inner_text('#app'))
        # 다른 학생: 학급 도서 + 이대로 보내기
        pg.click('#out'); pg.wait_for_selector('.name'); pg.locator('.name', has_text='이도윤').click(); pg.wait_for_selector('[data-cb]')
        pg.click('[data-cb]'); ok('학급 도서 단추가 제목을 채움', pg.input_value('#t') == '알사탕')
        pg.fill('#n', '달았다.'); pg.click('#rec button[type=submit]'); pg.wait_for_selector('#asis'); pg.click('#asis'); pg.wait_for_selector('.pill.wait')
        pg.wait_for_timeout(200)
        ok('"이대로 보낼게요" → 저장됨', len(state()['Books']) == 3 and state()['Books'][2][9] != '')

        # 6. 승인·다시 써 오기
        pg.click('[data-go=home]'); pg.wait_for_selector('h1.headline')
        ok('승인 전에는 책탑에 안 쌓임', '0권' in pg.inner_text('h1.headline'))
        pg.click('[data-go=admin]'); pg.wait_for_selector('[data-rid]')
        ok('승인 대기 2건, 짧은 감상 표시 1건', pg.locator('[data-rid]').count() == 2 and pg.locator('text=기준보다 짧음').count() == 1)
        pg.locator('[data-rid]').first.locator('[data-ed]').click(); pg.fill('#edt', '마당을 나온 암탉'); pg.click('#edf button[type=submit]')
        pg.wait_for_function("document.querySelector('[data-rid] strong').textContent === '마당을 나온 암탉'")
        ok('승인 화면에서 기록 고치기', state()['Books'][1][4] == '마당을 나온 암탉')
        pg.locator('[data-rid]').first.locator('[data-ok]').click(); pg.wait_for_function("document.querySelectorAll('[data-rid]').length === 1")
        pg.locator('[data-rid]').first.locator('[data-back]').click(); pg.fill('#memo', '어떤 점이 좋았는지 더 써 볼까요?'); pg.click('#bk button[type=submit]')
        pg.wait_for_function("document.querySelectorAll('[data-rid]').length === 0")
        ok('한 권 승인, 한 권 다시 써 오기', [r[8] for r in state()['Books'][1:]] == ['approved', 'returned'])

        # 7. 현황판
        pg.click('[data-go=home]'); pg.wait_for_selector('.tower svg')
        ok('현황판: 1권 · 0.3m', '1권 · 0.3m' in pg.inner_text('h1.headline'))
        ok('다음 목표: 교실 천장까지 9권', '교실 천장까지 9권' in pg.inner_text('#app'))
        ok('책탑 그림과 비교 그림', pg.locator('.tower svg').count() == 2 and pg.locator('.tower svg').first.locator('rect').count() >= 1)
        ok('친구들이 쌓은 책에 이름과 권수', '김하늘' in pg.inner_text('.side') and '1권' in pg.inner_text('.side'))
        ok('학급 도서 진행(아직 0명)', '3명 중 0명' in pg.inner_text('.side'))

        # 8. 감상 고쳐 쓰기 → 모두 승인
        pg.click('[data-go=student]'); pg.wait_for_selector('[data-rw]')
        ok('돌려받은 기록에 선생님 말', '어떤 점이 좋았는지' in pg.inner_text('#app'))
        pg.click('[data-rw]'); pg.fill('#rwn', '사탕을 먹으면 마음의 소리가 들렸다. 나도 듣고 싶다. 동동이가 친구를 사귀어서 좋았다.'); pg.click('#rwf button[type=submit]')
        pg.wait_for_function("!document.querySelector('[data-rw]')")
        pg.click('[data-go=home]'); pg.wait_for_selector('h1.headline'); pg.click('[data-go=admin]'); pg.wait_for_selector('#all'); pg.click('#all')
        pg.wait_for_function("document.querySelectorAll('[data-rid]').length === 0")
        pg.click('[data-go=home]'); pg.wait_for_selector('.tower svg')
        ok('고쳐 쓴 기록 승인 → 2권 · 0.6m', '2권 · 0.6m' in pg.inner_text('h1.headline'))
        ok('학급 도서 진행 1명', '3명 중 1명' in pg.inner_text('.side'))

        # 8-2. 독서 기록 보기·인쇄
        pg.click('[data-go=admin]'); pg.wait_for_selector('.menu'); pg.click('[data-tab=records]'); pg.wait_for_selector('#rsel')
        ok('독서 기록: 우리 반 전체 표', pg.locator('#pane table.t tbody tr').count() == 3 and '1권' in pg.inner_text('#pane'))
        pg.locator('[data-see]').first.click(); pg.wait_for_selector('[data-rec]')
        ok('독서 기록: 학생별 기록과 감상', '마당을 나온 암탉' in pg.inner_text('#pane') and '잎싹이 용감했다' in pg.inner_text('#pane'))
        pg.click('#rprint'); pg.wait_for_timeout(200)
        ok('독서기록장 인쇄 (한 학생)', pg.evaluate('window.__printed') == 1 and pg.locator('#print section').count() == 1 and '김하늘의 독서기록장' in pg.evaluate("document.querySelector('#print').textContent"))
        pg.select_option('#rsel', ''); pg.wait_for_selector('[data-see]'); pg.click('#rprint'); pg.wait_for_timeout(200)
        ok('독서기록장 인쇄 (우리 반 전체, 학생마다 한 쪽)', pg.locator('#print section').count() == 3)
        pg.click('[data-go=home]'); pg.wait_for_selector('.tower svg')

        # 9. 설정: 감상 기준 글자 수, 이름 가리기
        pg.click('[data-go=admin]'); pg.wait_for_selector('.menu'); pg.click('[data-tab=rule]')
        pg.select_option('#rk', 'char'); pg.fill('#rm', '30'); pg.click('#rf button[type=submit]'); pg.wait_for_timeout(400)
        pg.click('[data-tab=rule]'); ok('감상 기준 저장 (글자 수 30)', pg.input_value('#rm') == '30' and pg.input_value('#rk') == 'char')
        pg.click('[data-tab=board]'); pg.wait_for_selector('#sn'); pg.click('#bq'); pg.wait_for_selector('.qrimg'); ok('선생님 메뉴에서도 QR 크게 보기', True); pg.click('#qrx')
        pg.uncheck('#sn'); pg.wait_for_timeout(500)
        pg.click('[data-go=home]'); pg.wait_for_selector('.tower svg')
        ok('이름 가리기: 현황판에 이름 없음', '김하늘' not in pg.inner_text('#app') and '2권' in pg.inner_text('h1.headline'))

        # 10. 학생 비밀번호
        pg.click('[data-go=admin]'); pg.wait_for_selector('.menu'); pg.click('[data-tab=students]')
        pg.locator('table.t tbody tr').first.locator('[data-pw]').click(); pg.fill('#np', '4321'); pg.click('#spw button[type=submit]'); pg.wait_for_timeout(400)
        pg.click('[data-go=home]'); pg.wait_for_selector('h1.headline'); pg.click('[data-go=student]'); pg.wait_for_selector('#out'); pg.click('#out'); pg.wait_for_selector('.name')
        pg.locator('.name', has_text='김하늘').click(); pg.wait_for_selector('#pw'); pg.fill('#pw', '0000'); pg.click('#pwf button[type=submit]'); pg.wait_for_timeout(400)
        ok('틀린 학생 비밀번호는 막힘', '맞지 않습니다' in toast() and pg.locator('#rec').count() == 0)
        pg.fill('#pw', '4321'); pg.click('#pwf button[type=submit]'); pg.wait_for_selector('#rec')
        ok('맞는 비밀번호로 들어감', '김하늘' in pg.inner_text('#app'))

        # 10-2. 선생님 메뉴: 업데이트 내역, 비밀번호 바꾸기, 로그아웃
        pg.click('[data-go=home]'); pg.wait_for_selector('h1.headline'); pg.click('[data-go=admin]'); pg.wait_for_selector('.menu')
        ok('선생님 메뉴는 기록 승인부터', pg.locator('.mi[aria-current=page]').inner_text().startswith('기록 승인'))
        n0 = len(posts); pg.click('[data-tab=students]'); pg.click('[data-tab=rule]'); pg.click('[data-tab=board]'); pg.wait_for_selector('#sn'); pg.wait_for_timeout(200)
        ok('메뉴를 눌러도 시트에 다시 묻지 않음 (바로 바뀜)', len(posts) == n0, f'요청 {len(posts) - n0}번')
        pg.click('[data-tab=log]'); pg.wait_for_selector('#logl details')
        ok('업데이트 내역 표시', pg.locator('#logl details').count() >= 1)
        pg.click('[data-tab=pw]'); pg.fill('#npw', 'abcd'); pg.click('#pf button[type=submit]'); pg.wait_for_timeout(400)
        pg.click('#lo'); pg.wait_for_selector('h1.headline'); pg.click('[data-go=admin]'); pg.fill('#apw', '1234'); pg.click('#lg button[type=submit]'); pg.wait_for_timeout(300)
        ok('비밀번호를 바꾸면 옛 비밀번호는 막힘', pg.locator('.menu').count() == 0)
        pg.fill('#apw', 'abcd'); pg.click('#lg button[type=submit]'); pg.wait_for_selector('.menu')
        ok('새 비밀번호로 로그인', pg.locator('.mi').count() == 9)
        pg.click('[data-go=home]'); pg.wait_for_selector('h1.headline'); pg.click('[data-go=student]'); pg.wait_for_selector('#rec')

        # 10-3. 껍데기 2판 기능: 학급 이름, 승인 전 기록 지우기, 기록 고치기, 저장칸, 초기화
        def call(fn, *args):
            req = urllib.request.Request(BASE + '/exec', data=json.dumps({'fn': fn, 'args': list(args)}).encode(), method='POST')
            return json.load(urllib.request.urlopen(req))
        pg.fill('#t', '다른 책'); ok('학급 도서가 아닌 제목에는 표시 없음', pg.locator('#cbnote .pill').count() == 0)
        pg.fill('#t', '알 사탕 (빅북)'); ok('학급 도서와 같은 제목이면 자동으로 함께 읽는 책', pg.locator('#cbnote .pill').count() == 1)
        pg.fill('#n', '지울 기록이다. 잘못 올렸다. 다시 올릴 것이다. 그래서 지운다. 정말이다.'); pg.click('#rec button[type=submit]')
        pg.wait_for_selector('[data-dm]'); n1 = len(state()['Books'])
        ok('자동으로 이어진 기록에 학급 도서 번호가 저장됨', state()['Books'][-1][9] == state()['ClassBooks'][1][0])
        pg.fill('#sq', '알사탕'); pg.click('#sfind'); pg.wait_for_selector('#sfound .found'); pg.locator('#sfound .found').first.click()
        ok('이미 기록한 학급 도서는 다시 이어지지 않음', pg.input_value('#t') == '알사탕' and pg.locator('#cbnote .pill').count() == 0)
        pg.fill('#t', ''); pg.click('[data-dm]'); pg.wait_for_function("!document.querySelector('[data-dm]')")
        ok('학생이 승인 전 기록을 지움', len(state()['Books']) == n1 - 1)
        pg.click('[data-go=home]'); pg.wait_for_selector('h1.headline'); pg.click('[data-go=admin]'); pg.wait_for_selector('.menu'); pg.click('[data-tab=board]')
        pg.fill('#cn', '우리학교 독서기록장'); pg.click('#cnf button[type=submit]'); pg.wait_for_function("document.querySelector('#cls').textContent === '우리학교 독서기록장'")
        pg.click('[data-go=home]'); pg.wait_for_selector('h1.headline')
        ok('학급 이름을 정하면 화면 이름이 바뀜', pg.inner_text('#cls') == '우리학교 독서기록장')
        tok = call('verifyAdminPassword', 'abcd')['result']['token']
        rid = state()['Books'][1][0]
        call('updateBookAdmin', tok, rid, {'title': '고친 제목', 'pages': 120, 'extra': {'star': 5}})
        row = state()['Books'][1]
        ok('선생님이 기록을 고침 (제목·쪽수·덧붙임)', row[4] == '고친 제목' and row[12] == '120' and json.loads(row[13]) == {'star': 5})
        ok('전국판 보고는 설정 전에는 꺼져 있음', call('natReport')['result'] == {'ok': False, 'off': True})
        ok('선생님만 보는 저장칸은 로그인 없이 못 읽음', call('getPrivateAdmin', 'x')['ok'] is False)
        call('setPrivate', tok, {'nat': {'on': True, 'key': 'k1', 'collector': 'https://script.google.com/macros/s/abc/exec', 'name': '햇살초'}})
        ok('저장칸 쓰기·읽기, 설정하면 보고가 나감', call('getPrivateAdmin', tok)['result']['nat']['key'] == 'k1' and call('natReport')['result']['ok'] is True and 'k1' not in json.dumps(call('getSettings')) + json.dumps(call('getBoard')))
        call('setSettings', tok, {'extra': {'theme': 'wood'}})
        ok('자유 저장칸과 날짜별 권수', call('getSettings')['result']['extra'] == {'theme': 'wood'} and sum(call('getBoard')['result']['days'].values()) == 2)
        pg.click('[data-go=admin]'); pg.wait_for_selector('.menu'); pg.click('[data-tab=pw]'); pg.click('#rs'); pg.fill('#rsw', '아니'); pg.click('#rsf button[type=submit]'); pg.wait_for_timeout(200)
        ok('초기화는 "지우기"를 적어야 함', len(state()['Books']) > 1)
        pg.fill('#rsw', '지우기'); pg.click('#rsf button[type=submit]'); pg.wait_for_function("!document.querySelector('.shade')"); pg.wait_for_timeout(300)
        ok('책 기록 초기화 (학생·학급 도서는 남음)', len(state()['Books']) == 1 and len(state()['Students']) == 4 and len(state()['ClassBooks']) == 2)
        # 10-4. 목표 축하: 10권(3m)이 되면 교실 천장
        sid2 = state()['Students'][2][0]
        rids = [call('addBook', sid2, '', {'title': f'책 {i}', 'note': '가'})['result']['rid'] for i in range(10)]
        pg.click('[data-go=home]'); pg.wait_for_selector('h1.headline'); pg.wait_for_timeout(800)
        ok('승인 전에는 축하가 뜨지 않음', pg.locator('#celt').count() == 0)
        call('approveBooks', tok, rids); pg.reload(); pg.wait_for_selector('#celt')
        ok('목표에 닿으면 축하', '교실 천장에 닿았어요' in pg.inner_text('.qrbox') and '10권' in pg.inner_text('.qrbox') and '학교 4층' in pg.inner_text('.qrbox'))
        pg.click('#celx'); pg.reload(); pg.wait_for_selector('.tower svg'); pg.wait_for_timeout(900)
        ok('축하는 한 번만', pg.locator('#celt').count() == 0)
        pg.click('#inst'); pg.wait_for_selector('#insx'); ok('앱으로 설치하기 안내', '홈 화면' in pg.inner_text('.qrbox')); pg.click('#insx')
        ok('설치 설명 파일이 열림', json.load(urllib.request.urlopen(BASE + '/readus/manifest.webmanifest'))['short_name'] == '리더스')
        pg.click('[data-go=student]'); pg.wait_for_selector('.name'); pg.locator('.name', has_text='김하늘').click(); pg.wait_for_selector('#pw'); pg.fill('#pw', '4321'); pg.click('#pwf button[type=submit]'); pg.wait_for_selector('#rec')

        # 11. 새로 고쳐도 이어지는지, 좁은 화면
        pg.reload(); pg.wait_for_selector('.name, #rec')
        pg.set_viewport_size({'width': 390, 'height': 844}); pg.goto(URL + '#home'); pg.wait_for_selector('.tower svg')
        ok('휴대폰 너비에서 옆으로 넘치지 않음', pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'))
        pg.screenshot(path=os.path.join(ROOT, 'tests', 'home-phone.png'))
        pg.set_viewport_size({'width': 1200, 'height': 900}); pg.goto(URL + '#home'); pg.wait_for_selector('.tower svg'); pg.wait_for_timeout(600)
        pg.screenshot(path=os.path.join(ROOT, 'tests', 'home.png'))
        pg.click('[data-go=admin]'); pg.wait_for_selector('.menu'); pg.wait_for_timeout(300); pg.screenshot(path=os.path.join(ROOT, 'tests', 'admin.png'))
        pg.set_viewport_size({'width': 390, 'height': 844}); pg.wait_for_timeout(200)
        ok('선생님 메뉴도 휴대폰 너비에서 넘치지 않음', pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'))
        b.close()
finally:
    srv.terminate()

bad = [n for n, c in steps if not c]
print('\nJS 에러: ' + ('없음' if not errors else str(len(errors)) + '건'))
for e in errors[:10]: print('  ' + e)
print(f'전체 시험: {len(steps) - len(bad)}/{len(steps)} 통과' + ('' if not bad else ' — 걸린 것: ' + ', '.join(bad)))
sys.exit(1 if bad or errors else 0)
