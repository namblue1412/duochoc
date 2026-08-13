/* ============ Helpers ============ */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const byId = id => document.getElementById(id);
const shuffle = arr => { const a = arr.slice(); for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };
const fmtTime = s => { const m=Math.floor(s/60), ss=s%60; return `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`; };
const download = (fn, txt) => { const blob=new Blob([txt],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=fn; a.click(); setTimeout(()=>URL.revokeObjectURL(url),3000); };

/* ============ State & LocalStorage ============ */
const SAVE_KEY = 'ump_quiz_autosave';
const state = {
  raw:null, quiz:null, orderMap:[], answers:new Map(), flagged: new Set(),
  started:false, submitted:false, secs:0, timer:null,
  current:0, autoShowExp:true, viewFilter:'all', resultViewAll: false,
  bank:null
};

function saveProgress() {
  if (!state.started || state.submitted) return;
  const data = {
    raw: state.raw, orderMap: state.orderMap,
    answers: Array.from(state.answers.entries()).map(([k,v]) => [k, Array.from(v)]),
    flagged: Array.from(state.flagged),
    secs: state.secs, current: state.current
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch(e){}
}
function clearProgress() { try { localStorage.removeItem(SAVE_KEY); } catch(e){} }
function checkAndLoadProgress() {
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    if(saved) {
      if(confirm('Phát hiện bài làm chưa hoàn thành trước đó. Bạn có muốn tiếp tục làm không?')) {
        const data = JSON.parse(saved);
        state.raw = data.raw;
        state.quiz = normalizeQuiz(data.raw);
        state.orderMap = data.orderMap;
        state.answers = new Map(data.answers.map(([k,v]) => [Number(k), new Set(v)]));
        state.flagged = new Set(data.flagged || []);
        state.secs = data.secs;
        state.current = data.current;
        setHeaderInfo(`Đang tiếp tục: ${state.quiz.meta.title}`);
        resumeQuiz();
      } else { clearProgress(); }
    }
  } catch(e) { console.error("Lỗi khôi phục:", e); clearProgress(); }
}

/* ============ Validation / Normalize ============ */
function validateQuiz(json){
  if(!json || typeof json!=='object') throw new Error('File JSON không hợp lệ.');
  if(!Array.isArray(json.questions) || json.questions.length===0) throw new Error('Thiếu danh sách "questions".');
  json.meta = json.meta || {};
  if(!json.meta.title) json.meta.title = 'Đề không tên';
  const ids=new Set();
  json.questions.forEach((q,i)=>{
    if(!q || typeof q!=='object') throw new Error(`Câu ${i+1} không hợp lệ.`);
    if(!q.id) throw new Error(`Câu ${i+1}: thiếu "id".`);
    if(ids.has(q.id)) throw new Error(`Trùng id câu hỏi: ${q.id}`);
    ids.add(q.id);
    if(!q.type) q.type = (Array.isArray(q.correct) && q.correct.length>1)?'multi':'single';
    if(!['single','multi'].includes(q.type)) throw new Error(`Câu ${q.id}: type phải là single|multi.`);
    if(!q.question) throw new Error(`Câu ${q.id}: thiếu "question".`);
    if(!Array.isArray(q.options) || q.options.length<2) throw new Error(`Câu ${q.id}: cần >=2 options.`);
    if(!Array.isArray(q.correct) || q.correct.length===0) throw new Error(`Câu ${q.id}: thiếu mảng "correct".`);
    if(q.explanation==null) q.explanation='';
  });
  return json;
}
function normalizeQuiz(json){
  const meta={
    title: json.meta.title || 'Đề không tên',
    time_limit_sec: Number.isInteger(json.meta.time_limit_sec)? json.meta.time_limit_sec : 600,
    shuffle_questions: !!json.meta.shuffle_questions, shuffle_options: !!json.meta.shuffle_options,
  };
  const questions=json.questions.map(q=>({...q}));
  return {meta, questions};
}

/* ============ Import / Loader ============ */
function setHeaderInfo(t){ byId('headerInfo').textContent=t; }
function loadQuizObject(json){
  try{ validateQuiz(json); renderStart(json); }
  catch(e){ alert('Lỗi JSON: '+e.message); console.error(e); }
}
function tryParse(text){
  try{ loadQuizObject(JSON.parse(text)); }
  catch(e){ alert('Lỗi JSON: '+e.message); }
}

byId('fileInput').addEventListener('change', async e=>{ const f=e.target.files[0]; if(!f) return; tryParse(await f.text()); });
const drop=byId('drop');
['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault(); drop.classList.add('drag');}));
['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault(); drop.classList.remove('drag');}));
drop.addEventListener('drop', async e=>{ e.preventDefault(); drop.classList.remove('drag'); const f=e.dataTransfer.files[0]; if(!f) return; tryParse(await f.text()); });
byId('btnParse').addEventListener('click', ()=>{ const t=byId('paste').value.trim(); if(!t) return alert('Dán JSON trước.'); tryParse(t); });
byId('btnTemplate').addEventListener('click', ()=> download('pharma-quiz-template.json', JSON.stringify({meta:{title:"Đề mẫu",time_limit_sec:900,shuffle_questions:true,shuffle_options:true},questions:[{id:"Q1",type:"single",question:"Nội dung câu hỏi",options:["A","B","C","D"],correct:[0],explanation:"Giải thích"}]},null,2)));

function renderStart(json){
  state.raw=json; state.quiz=normalizeQuiz(json);
  setHeaderInfo(`Đã tải: ${state.quiz.meta.title}`);
  byId('btnStart').disabled=false; byId('btnReset').disabled=false;
}
byId('btnStart').addEventListener('click', ()=>{ if(!state.quiz) return; resetAll(); computeOrder(); startQuiz(); });
byId('btnReset').addEventListener('click', ()=> resetAll());

/* ============ Quiz flow ============ */
function computeOrder(){
  const qPol=byId('shuffleQ').value; const wantQ=qPol==='yes'||(qPol==='file'&&state.quiz.meta.shuffle_questions);
  const arr=state.quiz.questions.map((_,i)=>i); const qOrder= wantQ? shuffle(arr): arr;
  state.orderMap = qOrder.map(qIdx=>{
    const q=state.quiz.questions[qIdx];
    const oPol=byId('shuffleO').value; const wantO=oPol==='yes'||(oPol==='file'&&state.quiz.meta.shuffle_options);
    const ord=q.options.map((_,i)=>i);
    return {qIdx, optOrder: wantO? shuffle(ord): ord};
  });
}
function startQuiz(){
  byId('loader').classList.add('hide'); byId('quizPanel').classList.remove('hide'); byId('resultPanel').classList.add('hide'); byId('scorePill').classList.add('hide');
  state.answers.clear(); state.flagged.clear(); state.submitted=false; state.current=0;
  renderQuestion(0); renderMatrix(); renderProgressMeta(); applyFilter();
  const minInput=parseInt(byId('minutes').value,10);
  const total=Number.isFinite(minInput)? Math.max(60,minInput*60) : (state.quiz.meta.time_limit_sec||600);
  startTimer(total); state.started=true; saveProgress();
}
function resumeQuiz(){
  byId('loader').classList.add('hide'); byId('quizPanel').classList.remove('hide'); byId('resultPanel').classList.add('hide');
  state.submitted=false; state.started=true;
  renderQuestion(state.current); renderMatrix(); renderProgressMeta(); applyFilter();
  startTimer(state.secs, true);
}
function startTimer(total, isResume=false){
  clearInterval(state.timer); state.secs = total;
  const tick=()=>{
    byId('headerTimer').textContent=fmtTime(state.secs);
    byId('bigTimer').textContent=fmtTime(state.secs);
    const maxTime = state.quiz.meta.time_limit_sec || 600;
    const pct=Math.max(0,Math.min(100,(1-state.secs/maxTime)*100));
    byId('bar').style.width=pct+'%';
    if(state.secs<=0){ clearInterval(state.timer); submitQuiz(true); }
    state.secs--;
  };
  tick(); state.timer=setInterval(tick,1000);
}
function renderProgressMeta(){
  const total=state.orderMap.length;
  const answered=[...state.answers.values()].filter(s=>s.size>0).length;
  byId('sideMeta').textContent = `${answered}/${total} câu`;
}

/* ============ Renderers ============ */
function renderQuestion(qShownIdx){
  const m=state.orderMap[qShownIdx]; const q=state.quiz.questions[m.qIdx]; const isMulti=q.type==='multi';
  byId('qTitle').textContent = `Câu ${qShownIdx+1}`;
  byId('qMeta').textContent  = `${isMulti?'Chọn nhiều':'Chọn một'} • ${state.quiz.questions.length} câu`;
  byId('qText').innerHTML   = q.question;

  // Render Cờ (Flag)
  const btnFlag = byId('btnFlag');
  if(state.flagged.has(qShownIdx)) {
    btnFlag.classList.add('btn-flagged'); btnFlag.textContent = '🚩 Đã đánh dấu';
  } else {
    btnFlag.classList.remove('btn-flagged'); btnFlag.textContent = '🚩 Đánh dấu';
  }

  // Render Ảnh
  const imgHost=byId('qImage'); imgHost.innerHTML='';
  if(q.image){ 
    const img=new Image(); img.src=q.image; img.className='zoomable-img'; 
    img.style.maxWidth='50%'; img.style.borderRadius='8px';
    img.title = "Bấm để phóng to";
    img.addEventListener('click', () => openLightbox(q.image));
    imgHost.appendChild(img); 
  }

  const opts=byId('qOpts'); opts.innerHTML='';
  const chosenSet=new Set(state.answers.get(qShownIdx)||[]);
  m.optOrder.forEach((origOptIdx, shownIdx)=>{
    const lab=document.createElement('div'); lab.className='opt';
    lab.addEventListener('click', (e) => {
        if(state.submitted) return;
        // Tránh double click nếu click vào badge
        if(e.target.closest('.badge') && e.target !== lab) return;
        onSelect(qShownIdx, shownIdx, isMulti);
    });
    if(chosenSet.has(shownIdx)) lab.classList.add('chosen');
    const badge=document.createElement('span'); badge.className='badge'; badge.textContent=String.fromCharCode(65+shownIdx);
    const span=document.createElement('div'); span.innerHTML=q.options[origOptIdx];
    lab.appendChild(badge); lab.appendChild(span); opts.appendChild(lab);
  });

  const exp=byId('qExp'); exp.innerHTML=q.explanation?`💡 <b>Giải thích:</b> ${q.explanation}`:'';
  exp.classList.remove('show');

  if(state.submitted){
    decorateAfterSubmit(qShownIdx);
    if(state.autoShowExp && !checkQuestion(qShownIdx) && q.explanation) exp.classList.add('show');
  }
}

function renderMatrix(){
  const host=byId('qMatrix'); host.innerHTML='';
  state.orderMap.forEach((m,i)=>{
    const q=state.quiz.questions[m.qIdx]; const isMulti=q.type==='multi';
    const row=document.createElement('div'); row.className='mrow'; row.dataset.q=i;
    
    if(state.flagged.has(i)) row.classList.add('is-flagged');

    const num=document.createElement('div'); num.className='mnum'; num.textContent=String(i+1);
    if(i===state.current){ num.classList.add('current'); row.classList.add('current'); }
    num.addEventListener('click',()=>{ setCurrent(i); scrollRowIntoView(i); });
    row.appendChild(num);

    const mopts=document.createElement('div'); mopts.className='mopts';
    const chosen=new Set(state.answers.get(i)||[]);
    m.optOrder.forEach((orig, shownIdx)=>{
      const label=document.createElement('label'); label.className='mopt';
      const input=document.createElement('input'); input.type=isMulti?'checkbox':'radio'; input.name=`mx_${i}`; input.value=String(shownIdx);
      input.checked = chosen.has(shownIdx);
      input.disabled = state.submitted;
      input.addEventListener('change',()=>{ setCurrent(i); onSelect(i, shownIdx, isMulti); });
      const span=document.createElement('span'); span.textContent=String.fromCharCode(65+shownIdx);
      label.appendChild(input); label.appendChild(span); mopts.appendChild(label);
    });
    row.appendChild(mopts);
    host.appendChild(row);
  });
}
function renderMatrixRow(i){
  const host=byId('qMatrix'); const row=host.querySelector(`.mrow[data-q="${i}"]`); if(!row) return;
  $$('#qMatrix .mrow').forEach(r=>r.classList.remove('current','ok','bad'));
  row.classList.add('current');
  $$('#qMatrix .mnum').forEach(n=>n.classList.remove('current'));
  row.querySelector('.mnum').classList.add('current');
  
  if(state.flagged.has(i)) row.classList.add('is-flagged');
  else row.classList.remove('is-flagged');

  const q=state.quiz.questions[state.orderMap[i].qIdx];
  const chosenSet=new Set(state.answers.get(i)||[]);
  row.querySelectorAll('.mopt').forEach((optLab, idx)=>{
    const input=optLab.querySelector('input');
    input.checked = chosenSet.has(idx);
    if(state.submitted){
      input.disabled = true; const origIdx = mapShownToOrig(i, idx);
      optLab.classList.toggle('correct', q.correct.includes(origIdx));
      optLab.classList.toggle('wrong', input.checked && !q.correct.includes(origIdx));
    }else{
      input.disabled = false; optLab.classList.remove('correct','wrong');
    }
  });
  if(state.submitted){
    const ok = checkQuestion(i); const answered = chosenSet.size>0;
    row.classList.toggle('ok', ok); row.classList.toggle('bad', !ok && answered);
  }
}
function decorateAfterSubmit(qShownIdx){
  const m=state.orderMap[qShownIdx]; const q=state.quiz.questions[m.qIdx];
  const host=byId('qOpts'); const labels=host.querySelectorAll('.opt'); const chosen=[...(state.answers.get(qShownIdx)||[])];
  labels.forEach((lab, shownIdx)=>{
    const origIdx=mapShownToOrig(qShownIdx, shownIdx);
    lab.classList.remove('correct','wrong');
    if(q.correct.includes(origIdx)) lab.classList.add('correct');
    if(chosen.includes(shownIdx) && !q.correct.includes(origIdx)) lab.classList.add('wrong');
  });
}

/* ============ Interactions ============ */
function onSelect(qShownIdx, optShownIdx, isMulti){
  const set = state.answers.get(qShownIdx) || new Set();
  if(isMulti){ if(set.has(optShownIdx)) set.delete(optShownIdx); else set.add(optShownIdx); }
  else { set.clear(); set.add(optShownIdx); }
  state.answers.set(qShownIdx, set);
  renderMatrixRow(qShownIdx); renderProgressMeta(); applyFilter();
  if(qShownIdx===state.current) renderQuestion(qShownIdx);
  saveProgress();
}
function mapShownToOrig(qShownIdx, optShownIdx){ return state.orderMap[qShownIdx].optOrder[optShownIdx]; }
function checkQuestion(qShownIdx){
  const m=state.orderMap[qShownIdx]; const q=state.quiz.questions[m.qIdx];
  const sel=[...(state.answers.get(qShownIdx)||[])].map(i=>mapShownToOrig(qShownIdx,i)).sort((a,b)=>a-b);
  const correct=q.correct.slice().sort((a,b)=>a-b);
  if(sel.length!==correct.length) return false;
  for(let i=0;i<sel.length;i++) if(sel[i]!==correct[i]) return false;
  return true;
}
function setCurrent(i){ state.current=i; renderMatrixRow(i); renderQuestion(i); saveProgress(); }
function scrollRowIntoView(i){ const row=byId('qMatrix').querySelector(`.mrow[data-q="${i}"]`); if(row) row.scrollIntoView({block:'nearest', behavior:'smooth'}); }

byId('btnFlag').addEventListener('click', () => {
    if(state.flagged.has(state.current)) state.flagged.delete(state.current);
    else state.flagged.add(state.current);
    renderMatrixRow(state.current);
    renderQuestion(state.current);
    saveProgress();
});

/* ============ Filter & Submit & PDF ============ */
function applyFilter(){
  const mode = state.viewFilter || 'all';
  const rows = $$('#qMatrix .mrow');
  rows.forEach(row=>{
    const idx = +row.dataset.q;
    const answered = (state.answers.get(idx)||new Set()).size>0;
    const flagged = state.flagged.has(idx);
    let show = true;
    if(mode==='answered') show = answered;
    else if(mode==='unanswered') show = !answered;
    else if(mode==='flagged') show = flagged;
    row.style.display = show ? '' : 'none';
  });
}

function submitQuiz(auto=false){
  if(state.submitted) return; 
  
  // Cảnh báo nếu chưa làm hết (chỉ khi bấm nộp thủ công)
  if(!auto) {
    const answeredCount = [...state.answers.values()].filter(s=>s.size>0).length;
    if(answeredCount < state.orderMap.length) {
      if(!confirm(`⚠️ Bạn còn ${state.orderMap.length - answeredCount} câu chưa làm. Bạn có chắc chắn muốn nộp bài?`)) return;
    }
  }

  state.submitted=true; clearInterval(state.timer); clearProgress(); // Xoá save vì đã nộp bài

  const total=state.orderMap.length; let correct=0; for(let i=0;i<total;i++) if(checkQuestion(i)) correct++;
  const pct= total? Math.round(correct/total*100):0;

  const scoreText = `Điểm: ${correct}/${total} (${pct}%)`;
  byId('scorePill').textContent = scoreText; byId('scorePill').classList.remove('hide');
  byId('resultScoreText').textContent = scoreText;
  byId('printScore').textContent = scoreText;
  byId('printTitle').textContent = `Kết quả thi: ${state.quiz.meta.title}`;

  for(let i=0;i<state.orderMap.length;i++) renderMatrixRow(i);
  decorateAfterSubmit(state.current);

  renderResultList();
  byId('resultPanel').classList.remove('hide');
  applyFilter();
}

function renderResultList() {
  const wr = byId('wrongList'); wr.innerHTML='';
  const container=document.createElement('div'); container.className='qview';
  
  state.orderMap.forEach((m, i)=>{
    const ok=checkQuestion(i); 
    // Lọc: Nếu resultViewAll = false, chỉ hiện câu sai/chưa làm. Nếu true, hiện tất cả.
    if(!state.resultViewAll && ok) return; 

    const q=state.quiz.questions[m.qIdx];
    const box=document.createElement('div'); box.className='card pad';
    box.innerHTML = `<div style="margin-bottom:6px"><b>Câu ${i+1}.</b> ${q.question}</div>`;
    
    if(q.image) {
       box.innerHTML += `<img src="${q.image}" style="max-width:200px; border-radius:8px; margin-bottom:10px; display:block;" />`;
    }

    const ul=document.createElement('ul'); ul.style.margin='0 0 6px 18px'; ul.style.padding='0';
    q.options.forEach((opt, idx)=>{
      const chosenOrig = [...(state.answers.get(i)||[])].map(s=>mapShownToOrig(i,s));
      const isCorrect = q.correct.includes(idx);
      const isChosen = chosenOrig.includes(idx);
      let tag = '·'; let color = '';
      if(isCorrect) { tag = '✓'; color='color: var(--ok); font-weight:bold;'; }
      else if(isChosen) { tag = '✗'; color='color: var(--bad);'; }
      
      const li=document.createElement('li'); 
      li.style.cssText = color;
      li.innerHTML = `<span>${tag}</span> ${opt}`; 
      ul.appendChild(li);
    });
    box.appendChild(ul);
    if(q.explanation){ 
      const ex=document.createElement('div'); ex.className='exp show'; 
      ex.innerHTML=`💡 <b>Giải thích:</b> ${q.explanation}`; box.appendChild(ex); 
    }
    container.appendChild(box);
  });
  
  if(container.childNodes.length === 0) {
    container.innerHTML = `<div class="muted">Tất cả các câu đều đúng! Tuyệt vời!</div>`;
  }
  wr.appendChild(container);
}

byId('btnToggleResultView').addEventListener('click', (e) => {
  state.resultViewAll = !state.resultViewAll;
  e.target.textContent = state.resultViewAll ? "Lọc: Đang xem TẤT CẢ câu hỏi" : "Lọc: Đang xem câu SAI & CHƯA LÀM";
  renderResultList();
});

byId('btnPrint').addEventListener('click', () => { window.print(); });

/* ============ Phím tắt Keyboard ============ */
window.addEventListener('keydown', e => {
  if(byId('helpModal').classList.contains('show') || byId('imageLightbox').classList.contains('show')) return;
  if(!state.started || state.submitted) return;
  
  if(e.key === 'ArrowRight') { byId('btnNext').click(); e.preventDefault(); }
  if(e.key === 'ArrowLeft') { byId('btnPrev').click(); e.preventDefault(); }
  if(e.key === 'Enter') { submitQuiz(false); e.preventDefault(); }
  
  const keyMap = {'a':0,'1':0, 'b':1,'2':1, 'c':2,'3':2, 'd':3,'4':3, 'e':4,'5':4, 'f':5,'6':5};
  const key = e.key.toLowerCase();
  if(keyMap[key] !== undefined) {
     const optIdx = keyMap[key];
     const opts = $$('#qOpts .opt');
     if(opts[optIdx]) { opts[optIdx].click(); e.preventDefault(); }
  }
});

/* ============ Buttons & Modals ============ */
byId('btnSubmit').addEventListener('click', ()=> submitQuiz(false));
byId('btnPrev').addEventListener('click', ()=> setCurrent(Math.max(0, state.current-1)));
byId('btnNext').addEventListener('click', ()=> setCurrent(Math.min(state.orderMap.length-1, state.current+1)));
byId('btnReview').addEventListener('click', ()=>{
  state.autoShowExp=!state.autoShowExp;
  const q=state.orderMap[state.current]; if(!q) return;
  const e=byId('qExp');
  if(state.autoShowExp && state.submitted && !checkQuestion(state.current) && (state.quiz.questions[q.qIdx].explanation)) e.classList.add('show');
  else e.classList.remove('show');
});
byId('btnNew').addEventListener('click', ()=>{ if(confirm('Thoát bài thi hiện tại và làm đề mới?')) resetAll(); });
byId('btnRedoResult').addEventListener('click', ()=> {
  state.submitted=false; state.answers.clear(); state.flagged.clear();
  computeOrder(); renderQuestion(0); renderMatrix(); renderProgressMeta(); applyFilter();
  byId('resultPanel').classList.add('hide'); byId('scorePill').classList.add('hide');
  startTimer(state.quiz.meta.time_limit_sec || 600);
});
byId('filterGroup').addEventListener('click', e=>{
  const b=e.target.closest('.chip'); if(!b) return;
  $$('#filterGroup .chip').forEach(c=>c.classList.remove('active'));
  b.classList.add('active'); state.viewFilter=b.dataset.filter; applyFilter();
});

const helpModal=byId('helpModal');
byId('btnHelp').addEventListener('click', ()=> helpModal.classList.add('show'));
byId('helpClose').addEventListener('click', ()=> helpModal.classList.remove('show'));

const lightbox=byId('imageLightbox'); const lbImg=byId('lightboxImg');
function openLightbox(src) { lbImg.src = src; lightbox.classList.add('show'); }
byId('closeLightbox').addEventListener('click', ()=> lightbox.classList.remove('show'));
lightbox.addEventListener('click', e=> { if(e.target===lightbox) lightbox.classList.remove('show'); });

window.addEventListener('keydown', e=>{ 
  if(e.key==='Escape'){ helpModal.classList.remove('show'); lightbox.classList.remove('show'); } 
});

/* ============ Reset All ============ */
function resetAll(){
  clearInterval(state.timer); state.started=false; state.submitted=false;
  state.answers.clear(); state.flagged.clear(); state.orderMap=[]; state.current=0;
  clearProgress();
  byId('loader').classList.remove('hide'); byId('quizPanel').classList.add('hide');
  byId('resultPanel').classList.add('hide'); byId('scorePill').classList.add('hide');
  byId('headerTimer').textContent='00:00'; byId('bigTimer').textContent='00:00'; byId('bar').style.width='0%';
  setHeaderInfo(state.quiz?`Đã tải: ${state.quiz.meta.title}`:'Chưa tải đề');
}

/* ============ Khởi chạy kho đề và khôi phục ============ */
setHeaderInfo('Chưa tải đề');
window.addEventListener('load', checkAndLoadProgress);
