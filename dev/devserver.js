// 시험용 서버: /exec = Shell.gs (흉내 Apps Script), /relay = Relay.gs, /readus/ = GitHub 에 올릴 화면
// 쓰기: cd dev && npm install && node devserver.js   (SEED=1 이면 예시 학생·기록)
// 열기: http://localhost:8891/readus/?s=http%3A%2F%2Flocalhost%3A8891%2Fexec
const express = require('express');
const path = require('path');
const { createGas } = require('./gas-emu');
const PORT = +process.env.PORT || 8891;
const gas = createGas({ selfUrl: 'http://localhost:' + PORT + '/exec', shellPath: process.env.SHELL_PATH ? path.resolve(__dirname, process.env.SHELL_PATH) : path.join(__dirname, '..', 'Shell.gs') });   // SHELL_PATH=옛 껍데기 파일 로 옛 판 학교 흉내
const relay = createGas({ selfUrl: 'http://localhost:' + PORT + '/relay', shellPath: path.join(__dirname, '..', 'Relay.gs') });
relay.props.KAKAO_KEY = 'test-key';
if (process.env.SEED) {
  const g = gas.ctx, t = g.verifyAdminPassword('1234').token;
  g.addStudentsBulk(t, ['김하늘', '이도윤', '박서연', '최지호', '정하린'].map((name, i) => ({ grade: '5', cls: '1', number: String(i + 1), name })));
  const ids = g.getStudentsPublic().map(s => s.id);
  const cb = g.addClassBook(t, { title: '긴긴밤', author: '루리', publisher: '문학동네', due: '2099-12-31' }).id;
  const titles = ['마당을 나온 암탉', '책 먹는 여우', '푸른 사자 와니니', '강아지똥', '만복이네 떡집', '알사탕', '구름빵', '수박 수영장'];
  const rids = titles.map((title, i) => g.addBook(ids[i % ids.length], '', { title, author: '지은이', publisher: '출판사', note: '재미있었다. 또 읽고 싶다. 친구에게 권하고 싶다.' }).rid);
  rids.push(g.addBook(ids[0], '', { title: '긴긴밤', author: '루리', publisher: '문학동네', note: '마음이 따뜻해졌다. 노든이 멋졌다. 끝까지 읽길 잘했다.', classBookId: cb }).rid);
  g.approveBooks(t, rids);
  g.addBook(ids[1], '', { title: '어린 왕자', author: '생텍쥐페리', publisher: '출판사', note: '재미있었다.' });
}
const app = express();
app.use(express.text({ type: '*/*', limit: '2mb' }));
function send(res, out) {
  res.set('Access-Control-Allow-Origin', '*');
  if (out && out._type === 'html') return res.type('html').send(out.content);
  res.type('json').send(out.content);
}
app.get('/exec', (req, res) => send(res, gas.ctx.doGet({ parameter: req.query })));
app.post('/exec', (req, res) => send(res, gas.ctx.doPost({ postData: { contents: req.body } })));
app.get('/relay', (req, res) => send(res, relay.ctx.doGet({ parameter: req.query })));
// 시험 중에는 화면이 로컬 중계기를 쓰도록 relay.json 을 바꿔서 내려줌 (NORELAY=1 이면 중계기 없는 학교 흉내)
app.get('/readus/relay.json', (req, res) => res.json({ relay: process.env.NORELAY ? '' : 'http://localhost:' + PORT + '/relay' }));
app.use('/readus', express.static(path.join(__dirname, '..')));
app.get('/__state', (req, res) => res.json({ props: gas.props, sheets: Object.fromEntries(Object.keys(gas.sheets).map(k => [k, gas.sheets[k]._rows])) }));
app.listen(PORT, () => console.log('dev on ' + PORT));
