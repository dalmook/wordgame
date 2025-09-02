/* ===== 데이터 로드 ===== */
let DATA = null;
let voices = [];
const state = {
  gradeId: null,
  questions: [],      // 10문장
  answers: [],        // 사용자가 쓴 답
  results: [],        // true/false
  idx: 0,
  score: 0,
  speakCount: 0
};

document.addEventListener('DOMContentLoaded', async () => {
  DATA = await fetch('data.json').then(r=>r.json());
  fillGradeSelect();
  loadVoices();
  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  // UI 엮기
  bindSetup();
  bindPlay();
  bindResult();
  bindHelp();
  updateRecordSummary();
});

/* ===== 공통 ===== */
function $(sel){ return document.querySelector(sel); }
function show(id){ $(id).classList.remove('hidden'); }
function hide(id){ $(id).classList.add('hidden'); }
function nf(txt){
  // 한글 정규화: 공백/마침표/쉼표/느낌표/물음표 제거, NFC 통일
  return (txt||'')
    .normalize('NFC')
    .replace(/[.,!?]/g,'')
    .replace(/\s+/g,'')
    .trim();
}
function clamp(n,min,max){ return Math.max(min, Math.min(max,n)); }

/* ===== 설정 ===== */
function fillGradeSelect(){
  const sel = $('#gradeSelect');
  DATA.grades.forEach(g=>{
    const opt = document.createElement('option');
    opt.value=g.id; opt.textContent = `${g.id} · ${g.title}`;
    sel.appendChild(opt);
  });
}
function loadVoices(){
  voices = speechSynthesis.getVoices().filter(v=> v.lang.startsWith('ko'));
  const sel = $('#voiceSelect');
  sel.innerHTML='';
  const def = document.createElement('option');
  def.value=''; def.textContent = voices.length? '자동(한국어)' : '기본 음성';
  sel.appendChild(def);
  voices.forEach((v,i)=>{
    const o=document.createElement('option');
    o.value=i; o.textContent=`${v.name} (${v.lang})`;
    sel.appendChild(o);
  });
}
function bindSetup(){
  const rate = $('#rate');
  const rateVal = $('#rateVal');
  rate.addEventListener('input', ()=> rateVal.textContent = rate.value+'x');

  $('#btnStart').addEventListener('click', ()=>{
    state.gradeId = $('#gradeSelect').value;
    startSet(state.gradeId);
  });
}

/* ===== 세트 시작 ===== */
function startSet(gradeId){
  const grade = DATA.grades.find(g=> g.id===gradeId);
  if(!grade){ alert('급수 데이터를 찾을 수 없어요.'); return; }

  // 문항 10개 샘플링(원본이 10개면 그대로)
  const pool = [...grade.items];
  const pick = [];
  while(pick.length<10 && pool.length){
    const i = Math.floor(Math.random()*pool.length);
    pick.push(pool.splice(i,1)[0]);
  }

  state.questions = pick;
  state.answers = Array(10).fill('');
  state.results = Array(10).fill(null);
  state.idx = 0;
  state.score = 0;
  state.speakCount = 0;

  hide('#setupCard'); hide('#resultCard'); show('#playCard');
  updatePlayUI();
}

/* ===== 진행/채점 ===== */
function bindPlay(){
  $('#btnSpeak').addEventListener('click', ()=> speakCurrent());
  $('#btnRepeat').addEventListener('click', ()=> speakCurrent(true));
  $('#btnCheck').addEventListener('click', ()=> check());
  $('#btnPrev').addEventListener('click', ()=> move(-1));
  $('#btnNext').addEventListener('click', ()=> move(1));
  $('#answer').addEventListener('keydown', e=>{
    if(e.key==='Enter'){ check(); }
  });
}

function updatePlayUI(){
  $('#qpos').textContent = `${state.idx+1} / 10`;
  $('#progressBar').style.width = `${(state.idx)/10*100}%`;
  $('#score').textContent = state.score;
  $('#answer').value = state.answers[state.idx] || '';
  $('#feedback').innerHTML='';
  $('#answer').focus();
}

function speakCurrent(isRepeat=false){
  if(!('speechSynthesis' in window)) { alert('이 브라우저는 음성합성을 지원하지 않아요.'); return; }
  const text = state.questions[state.idx];
  const u = new SpeechSynthesisUtterance(text);
  const rate = parseFloat($('#rate').value);
  const sel = $('#voiceSelect').value;
  if(sel!==''){ u.voice = voices[parseInt(sel,10)]; }
  u.lang='ko-KR'; u.rate = clamp(rate, .6, 1.4);
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
  if(!isRepeat) state.speakCount++;
}

function check(){
  const user = $('#answer').value;
  state.answers[state.idx] = user;

  const target = state.questions[state.idx];
  const ok = nf(user) === nf(target);

  state.results[state.idx] = ok;
  const delta = ok?10:0;

  // 이미 채점된 문제는 점수 재가산하지 않도록 관리
  const prevAwarded = $('#feedback').dataset.awarded === '1';
  if(!prevAwarded){
    state.score += delta;
    $('#feedback').dataset.awarded = '1';
  }

  $('#feedback').innerHTML = ok
    ? `<div class="ok">정답! +10점 🎉</div>`
    : `<div class="no">아쉬워요. 정답: <b>${target}</b></div>`;

  // 자동 다음
  setTimeout(()=>{
    if(state.idx<9) move(1);
    else finish();
  }, 650);
}

function move(dir){
  state.idx = clamp(state.idx + dir, 0, 9);
  $('#feedback').dataset.awarded = '0';
  updatePlayUI();
}

function finish(){
  $('#progressBar').style.width = '100%';
  hide('#playCard'); show('#resultCard');

  $('#finalScore').textContent = state.score;
  $('#badge').textContent = badgeText(state.score);
  confetti();

  // 결과 상세
  const list = $('#detailList'); list.innerHTML='';
  state.questions.forEach((q,i)=>{
    const div = document.createElement('div');
    div.className='detail-item';
    const ok = state.results[i]===true;
    div.innerHTML = `
      <div class="n">${i+1}</div>
      <div class="ans">${ok?'✅':'❌'} <b>${q}</b><br>
        <small>내 답: ${state.answers[i] ? escapeHtml(state.answers[i]) : '<i>(미입력)</i>'}</small>
      </div>`;
    list.appendChild(div);
  });

  // 기록 저장
  saveRecord(state.gradeId, state.score);
  updateRecordSummary();         // 홈 카드 요약 갱신(다음 번 시작 대비)
  $('#savedRecord').innerHTML = recordBlock(state.gradeId);
}

function badgeText(score){
  if(score===100) return '완벽해요! 금메달 🥇';
  if(score>=90) return '아주 잘했어요! 은메달 🥈';
  if(score>=70) return '좋아요! 동메달 🥉';
  if(score>=50) return '조금만 더! 파이팅 💪';
  return '처음이 가장 어려워요. 다음엔 더 잘할 수 있어요 🌱';
}

/* ===== 결과 화면 버튼 ===== */
function bindResult(){
  $('#btnRetry').addEventListener('click', ()=>{
    startSet(state.gradeId);
  });
  $('#btnHome').addEventListener('click', ()=>{
    hide('#playCard'); hide('#resultCard'); show('#setupCard');
    updateRecordSummary();
  });
}

/* ===== 도움말 ===== */
function bindHelp(){
  const dlg = $('#helpDialog');
  $('#btnHelp').addEventListener('click', ()=> dlg.showModal());
  $('#btnCloseHelp').addEventListener('click', ()=> dlg.close());
}

/* ===== 로컬 기록 ===== */
const STORAGE_KEY='dictationRecords.v1';

function readStore(){
  try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'); }
  catch(e){ return {}; }
}
function writeStore(obj){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}
function saveRecord(gradeId, score){
  const db = readStore();
  const now = new Date().toISOString();
  if(!db[gradeId]) db[gradeId] = {plays:0, high:0, last:0, history:[]};
  db[gradeId].plays += 1;
  db[gradeId].last = score;
  db[gradeId].high = Math.max(db[gradeId].high, score);
  db[gradeId].history.unshift({at:now, score});
  db[gradeId].history = db[gradeId].history.slice(0,50); // 최근 50회
  writeStore(db);
}
function recordBlock(gradeId){
  const db = readStore();
  const r = db[gradeId];
  if(!r) return '';
  return `📚 <b>${gradeId}</b> — 시도: ${r.plays}회 · 최고점: ${r.high}점 · 최근: ${r.last}점`;
}
function updateRecordSummary(){
  const selVal = $('#gradeSelect').value || (DATA?.grades?.[0]?.id ?? '');
  $('#recordSummary').innerHTML = recordBlock(selVal) || '아직 기록이 없어요. 오늘 첫 도전 어때요? 🌟';
  $('#gradeSelect').addEventListener('change', ()=>{
    $('#recordSummary').innerHTML = recordBlock($('#gradeSelect').value) || '';
  });
}

/* ===== 유틸 ===== */
function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

/* ===== 간단 폭죽 ===== */
function confetti(){
  const canvas = document.getElementById('confetti');
  const ctx = canvas.getContext('2d');
  let W = canvas.width = window.innerWidth;
  let H = canvas.height = window.innerHeight;
  const parts = Array.from({length:120}).map(()=> ({
    x: Math.random()*W, y: -20, r: 2+Math.random()*4, v: 2+Math.random()*4,
    a: Math.random()*Math.PI*2
  }));
  let t=0, id;
  function step(){
    ctx.clearRect(0,0,W,H);
    parts.forEach(p=>{
      p.y += p.v; p.x += Math.cos(p.a); p.a += 0.03;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle = `hsl(${(t+p.x)%360} 80% 60%)`; ctx.fill();
    });
    t+=4;
    if(++t<200) id=requestAnimationFrame(step);
    else cancelAnimationFrame(id);
  }
  step();
  setTimeout(()=>{ ctx.clearRect(0,0,W,H); }, 2400);
                                             }
