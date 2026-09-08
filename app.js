/* ============ Helpers ============ */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const byId = id => document.getElementById(id);
const shuffle = arr => { const a = arr.slice(); for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };
const fmtTime = s => { const m=Math.floor(s/60), ss=s%60; return `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`; };
const download = (fn, txt) => { const blob=new Blob([txt],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=fn; a.click(); setTimeout(()=>URL.revokeObjectURL(url),3000); };

/* ============ State & LocalStorage ============ */
const SAVE_KEY = 'ump_quiz_autosave';
const THEME_KEY = 'ump_quiz_theme';
const FONT_KEY = 'ump_quiz_fontsize';

const state = {
  raw:null, quiz:null, orderMap:[], answers:new Map(), flagged: new Set(),
  started:false, submitted:false, secs:0, totalSecs:600, timer:null,
  current:0, autoShowExp:true, viewFilter:'all', resultViewAll: false,
  mode: 'exam', // 'exam' hoặc 'practice'
  fontSize: 15,
  bankData: null
};

function initTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  const themeBtn = byId('btnThemeToggle');
  if (themeBtn) themeBtn.textContent = savedTheme === 'dark' ? '🌙' : '☀️';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(THEME_KEY, next);
  const themeBtn = byId('btnThemeToggle');
  if (themeBtn) themeBtn.textContent = next === 'dark' ? '🌙' : '☀️';
}

function initFontSize() {
  const savedSize = parseInt(localStorage.getItem(FONT_KEY), 10);
  if (savedSize && savedSize >= 13 && savedSize <= 22) {
    state.fontSize = savedSize;
    applyFontSize();
  }
}

function changeFontSize(delta) {
  state.fontSize = Math.min(22, Math.max(13, state.fontSize + delta));
  localStorage.setItem(FONT_KEY, state.fontSize);
  applyFontSize();
}

function applyFontSize() {
  const qText = byId('qText');
  const qOpts = byId('qOpts');
  if (qText) qText.style.fontSize = `${state.fontSize}px`;
  if (qOpts) qOpts.style.fontSize = `${state.fontSize}px`;
}

function saveProgress() {
  if (!state.started || state.submitted) return;
  const data = {
    raw: state.raw, orderMap: state.orderMap,
    answers: Array.from(state.answers.entries()).map(([k,v]) => [k, Array.from(v)]),
    flagged: Array.from(state.flagged),
    secs: state.secs, totalSecs: state.totalSecs, current: state.current,
    mode: state.mode
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
        state.totalSecs = data.totalSecs || (state.quiz.meta.time_limit_sec || 600);
        state.current = data.current || 0;
        state.mode = data.mode || 'exam';
        setHeaderInfo(`Đang tiếp tục: ${state.quiz.meta.title} (${state.mode === 'practice' ? 'Luyện tập' : 'Thi thử'})`);
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

    if(!q.type) {
      if(q.sample_answer !== undefined || !Array.isArray(q.options)) q.type = 'essay';
      else q.type = (Array.isArray(q.correct) && q.correct.length>1)?'multi':'single';
    }
    if(!['single','multi','essay'].includes(q.type)) throw new Error(`Câu ${q.id}: type phải là single|multi|essay.`);
    if(!q.question) throw new Error(`Câu ${q.id}: thiếu "question".`);

    if(q.type === 'essay') {
      q.options = Array.isArray(q.options) ? q.options : [];
      q.correct = Array.isArray(q.correct) ? q.correct : [];
      if(!q.sample_answer && !q.explanation) q.sample_answer = '(Chưa có đáp án mẫu)';
      if(!Array.isArray(q.grading_criteria)) q.grading_criteria = [];
    } else {
      if(!Array.isArray(q.options) || q.options.length<2) throw new Error(`Câu ${q.id}: cần >=2 options.`);
      if(!Array.isArray(q.correct) || q.correct.length===0) throw new Error(`Câu ${q.id}: thiếu mảng "correct".`);
    }

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
  const questions=json.questions.map(q=>({
    ...q,
    options: Array.isArray(q.options) ? q.options : [],
    correct: Array.isArray(q.correct) ? q.correct : [],
    grading_criteria: Array.isArray(q.grading_criteria) ? q.grading_criteria : []
  }));
  return {meta, questions};
}

/* ============ Import / Loader ============ */
function setHeaderInfo(t){ byId('headerInfo').textContent=t; byId('headerInfo').classList.remove('hide'); }
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
const CUSTOM_BANK_KEY = 'ump_custom_quiz_bank';

function getCustomBank() {
  try {
    const raw = localStorage.getItem(CUSTOM_BANK_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch(e) { return []; }
}

function saveCustomBank(list) {
  try {
    localStorage.setItem(CUSTOM_BANK_KEY, JSON.stringify(list));
  } catch(e) { alert('Bộ nhớ duyệt web đã đầy, không thể lưu thêm đề.'); }
}

byId('btnTemplate').addEventListener('click', ()=> download('de-trac-nghiem-template.json', JSON.stringify({
  meta: { title: "Đề Trắc Nghiệm Mẫu", time_limit_sec: 900, shuffle_questions: true, shuffle_options: true },
  questions: [
    { id: "TN01", type: "single", question: "Nội dung câu hỏi trắc nghiệm 1 đáp án?", options: ["Lựa chọn A", "Lựa chọn B đúng", "Lựa chọn C", "Lựa chọn D"], correct: [1], explanation: "Giải thích chi tiết câu 1..." },
    { id: "TN02", type: "multi", question: "Nội dung câu hỏi nhiều đáp án đúng? (Chọn nhiều)", options: ["Lựa chọn 1", "Lựa chọn 2", "Lựa chọn 3", "Lựa chọn 4"], correct: [0, 2], explanation: "Giải thích câu 2..." }
  ]
}, null, 2)));

if(byId('btnEssayTemplate')) {
  byId('btnEssayTemplate').addEventListener('click', () => download('de-tu-luan-template.json', JSON.stringify({
    meta: { title: "Đề Tự Luận & Điền Khuyết Mẫu", time_limit_sec: 1800, shuffle_questions: false, shuffle_options: false },
    questions: [
      {
        id: "TL01",
        type: "essay",
        question: "Trình bày định nghĩa và cơ chế tác dụng chính của nhóm thuốc Beta-lactam?",
        sample_answer: "- Định nghĩa: Kháng sinh có vòng beta-lactam trong cấu trúc phân tử.\n- Cơ chế: Gắn vào PBP (Penicillin-Binding Proteins), ức chế tổng hợp thành peptidoglycan của tế bào vi khuẩn, làm ly giải tế bào.",
        grading_criteria: [
          "Nêu đúng định nghĩa cấu trúc vòng beta-lactam (0.5 điểm)",
          "Nêu đúng gắn vào PBP (1.0 điểm)",
          "Nêu đúng ức chế tổng hợp peptidoglycan thành vi khuẩn (0.5 điểm)"
        ],
        tags: ["Dược lý", "Tự luận", "Beta-lactam"],
        difficulty: "medium",
        explanation: "Tham khảo giáo trình Dược lý 2 - Chương Kháng sinh."
      },
      {
        id: "TL02",
        type: "essay",
        question: "Điền vào chỗ trống: Phối hợp Amoxicillin với Acid Clavulanic nhằm mục đích ...",
        sample_answer: "ức chế men beta-lactamase, mở rộng phổ kháng khuẩn đối với các chủng vi khuẩn tiết men.",
        grading_criteria: [
          "Nêu được vai trò ức chế beta-lactamase (1.0 điểm)",
          "Nêu được bảo vệ kháng sinh khỏi bị phá hủy / mở rộng phổ (1.0 điểm)"
        ],
        tags: ["Điền khuyết"],
        difficulty: "easy",
        explanation: "Acid clavulanic là chất ức chế tự sát beta-lactamase."
      }
    ]
  }, null, 2)));
}

if(byId('btnSaveToBank')) {
  byId('btnSaveToBank').addEventListener('click', () => {
    if(!state.quiz || !state.raw) return alert('Chưa nạp đề nào! Hãy nạp hoặc dán đề JSON trước khi lưu vào kho.');
    const title = state.quiz.meta?.title || 'Đề tự nạp';
    const customList = getCustomBank();
    const id = 'custom_' + Date.now();
    
    customList.unshift({
      id: id,
      title: title,
      category: 'tuluan_custom',
      data: state.raw,
      createdAt: new Date().toLocaleDateString('vi-VN')
    });
    
    saveCustomBank(customList);
    alert(`✅ Đã lưu đề "${title}" vào Kho đề của bạn thành công!`);
    initQuestionBank();
  });
}

if(byId('btnSample')) {
  byId('btnSample').addEventListener('click', () => {
    const sample = {
      "meta": { "title": "Đề Tổng Hợp (Trắc Nghiệm & Tự Luận)", "time_limit_sec": 900, "shuffle_questions": true, "shuffle_options": true },
      "questions": [
        { "id": "Q1", "type": "single", "question": "Cơ quan nào sau đây là trung tâm của hệ tuần hoàn?", "options": ["Phổi", "Tim", "Gan", "Não"], "correct": [1], "explanation": "Tim bơm máu đi nuôi cơ thể, là trung tâm của hệ tuần hoàn." },
        { "id": "Q2", "type": "multi", "question": "Những nhóm máu nào sau đây có thể truyền cho người nhóm máu AB? (Chọn nhiều)", "options": ["Nhóm máu A", "Nhóm máu B", "Nhóm máu O", "Chỉ nhóm máu AB"], "correct": [0, 1, 2], "explanation": "Người nhóm máu AB là 'người nhận phổ quát', có thể nhận máu từ O, A, B và AB." },
        { "id": "Q3", "type": "essay", "question": "Trình bày 2 nguyên tắc an toàn căn bản khi truyền máu?", "sample_answer": "1. Phải truyền cùng nhóm máu hệ ABO và Rh.\n2. Bắt buộc làm phản ứng chéo tại giường trước khi truyền.", "grading_criteria": ["Đúng nguyên tắc nhóm máu ABO/Rh (1.0đ)", "Làm phản ứng chéo tại giường (1.0đ)"], "explanation": "Tuân thủ quy tắc truyền máu an toàn để tránh tan máu cấp do bất đồng nhóm máu." }
      ]
    };
    loadQuizObject(sample);
  });
}

// Danh mục mặc định dự phòng nếu fetch question-bank.json bị chặn bởi CORS/file://
const FALLBACK_BANK_DATA = {
  folder: "kho-de",
  categories: [
    { "id": "all", "name": "Tất cả đề" },
    { "id": "duocdong", "name": "Dược Động Học" },
    { "id": "lamsang", "name": "Lâm Sàng Nội / Bệnh Học" },
    { "id": "duoclieu", "name": "Nhận Thức Dược Liệu" },
    { "id": "duocly", "name": "Dược Lý" },
    { "id": "hoaduoc", "name": "Hóa Dược & Hóa Học" },
    { "id": "khac", "name": "Khác" }
  ],
  items: [
    { "id": "dd01", "category": "duocdong", "title": "Dược Động HD24 - Đề 1", "file": "dd01.json" },
    { "id": "dd02", "category": "duocdong", "title": "Dược Động HD24 - Đề 2", "file": "dd02.json" },
    { "id": "dd03", "category": "duocdong", "title": "Dược Động HD24 - Đề 3", "file": "dd03.json" },
    { "id": "dd04", "category": "duocdong", "title": "Dược Động HD24 - Đề 4", "file": "dd04.json" },
    { "id": "lsbh01", "category": "lamsang", "title": "Lâm Sàng Nội - Đề 1", "file": "lsbh01.json" },
    { "id": "lsbh02", "category": "lamsang", "title": "Lâm Sàng Nội - Đề 2", "file": "lsbh02.json" },
    { "id": "lsbh03", "category": "lamsang", "title": "Lâm Sàng Nội - Đề 3", "file": "lsbh03.json" },
    { "id": "lsbh04", "category": "lamsang", "title": "Lâm Sàng Nội - Đề 4", "file": "lsbh04.json" },
    { "id": "lsbh05", "category": "lamsang", "title": "Lâm Sàng Nội - Đề 5", "file": "lsbh05.json" },
    { "id": "lsbh06", "category": "lamsang", "title": "Lâm Sàng Nội - Đề 6", "file": "lsbh06.json" },
    { "id": "dly2_01", "category": "duocly", "title": "Dược Lý 2 - Kháng Sinh Beta-Lactam", "file": "dly2_01.json" },
    { "id": "ndl", "category": "duoclieu", "title": "NTDL - Tên Khoa Học & Họ (Hình ảnh)", "file": "ndl.json" },
    { "id": "bpd", "category": "duoclieu", "title": "NTDL - Bộ Phận Dùng (58 Dược liệu)", "file": "bpd.json" },
    { "id": "cd", "category": "duoclieu", "title": "NTDL - Công Dụng (58 Dược liệu)", "file": "cd.json" },
    { "id": "tphh", "category": "duoclieu", "title": "NTDL - Thành Phần Hóa Học (58 Dược liệu)", "file": "tphh.json" },
    { "id": "hduoc1", "category": "hoaduoc", "title": "Hóa Dược 1 - Đề 1", "file": "hduoc1.json" },
    { "id": "hdc01", "category": "hoaduoc", "title": "Hóa Đại Cương & Hữu Cơ - Đề 1", "file": "hdc01.json" },
    { "id": "hdc02", "category": "hoaduoc", "title": "Hóa Đại Cương & Hữu Cơ - Đề 2", "file": "hdc02.json" },
    { "id": "hdc03", "category": "hoaduoc", "title": "Hóa Học Tổng Hợp - Đề 3", "file": "hdc03.json" },
    { "id": "hdc04", "category": "hoaduoc", "title": "Hóa Học Tổng Hợp - Đề 4", "file": "hdc04.json" },
    { "id": "oth1", "category": "khac", "title": "Toán Hình 9 - Đề 1", "file": "oth1.json" }
  ]
};

// Hàm nạp đề từ giá trị option đã chọn (file hoặc custom)
async function loadBankItem(val) {
  if(!val) return;
  const statusDiv = byId('bankStatus');

  // Nếu là đề do người dùng tự lưu (LocalStorage)
  if(val.startsWith('custom:')) {
    const customId = val.replace('custom:', '');
    const customList = getCustomBank();
    const found = customList.find(c => c.id === customId);
    if(found && found.data) {
      loadQuizObject(found.data);
      if(statusDiv) statusDiv.textContent = `✅ Đã tự động nạp đề: ${found.title}`;
      return;
    }
  }

  // 1. Ưu tiên lấy từ bộ nhúng sẵn EMBEDDED_QUIZ_BANK (chạy mượt 100% mọi môi trường)
  if(window.EMBEDDED_QUIZ_BANK && window.EMBEDDED_QUIZ_BANK[val]) {
    const json = window.EMBEDDED_QUIZ_BANK[val];
    loadQuizObject(json);
    if(statusDiv) statusDiv.textContent = `✅ Đã nạp thành công: ${json.meta?.title || val}`;
    return;
  }

  // 2. Nếu không có trong embedded, thử fetch từ server/folder
  const folder = (state.bankData && state.bankData.folder) ? state.bankData.folder : 'kho-de';
  const filePath = `${folder}/${val}`;
  if(statusDiv) statusDiv.textContent = `⏳ Đang tải ${val}...`;

  try {
    const res = await fetch(filePath);
    if(!res.ok) throw new Error(`HTTP error ${res.status}`);
    const json = await res.json();
    loadQuizObject(json);
    if(statusDiv) statusDiv.textContent = `✅ Đã nạp thành công: ${json.meta?.title || val}`;
  } catch(err) {
    if(statusDiv) statusDiv.textContent = `❌ Lỗi khi nạp file "${val}": ${err.message}`;
    alert(`Không thể nạp file "${filePath}". Lỗi: ${err.message}`);
  }
}

// Tải danh mục kho đề từ question-bank.json & kho đề tự nạp
async function initQuestionBank() {
  const bankSelect = byId('bankSelect');
  const catSelect = byId('bankCategorySelect');
  const searchInput = byId('bankSearchInput');
  const statusDiv = byId('bankStatus');

  state.bankData = FALLBACK_BANK_DATA;

  try {
    const res = await fetch('question-bank.json');
    if(res.ok) {
      const liveData = await res.json();
      if(liveData && liveData.items) state.bankData = liveData;
    }
  } catch(e) {
    // Dùng FALLBACK_BANK_DATA đã gán
  }

  const baseCategories = state.bankData.categories || [];
  const baseItems = state.bankData.items || [];

  // Danh mục đề do người dùng tự thêm
  const customList = getCustomBank();
  let allCategories = [...baseCategories];
  if(customList.length > 0) {
    if(!allCategories.some(c => c.id === 'tuluan_custom')) {
      allCategories.push({ id: 'tuluan_custom', name: 'Đề của tôi (Tự nạp)' });
    }
  }

  if(catSelect) {
    catSelect.innerHTML = '';
    allCategories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = (cat.id === 'all' ? '📂 ' : '🏷️ ') + cat.name;
      catSelect.appendChild(opt);
    });
  }

  const renderBankOptions = () => {
    const selectedCat = catSelect ? catSelect.value : 'all';
    const term = (searchInput ? searchInput.value : '').trim().toLowerCase();
    
    bankSelect.innerHTML = '<option value="">-- Chọn đề thi (sẽ tự nạp ngay) --</option>';
    
    // Gộp đề có sẵn và đề tự nạp
    const combinedItems = [
      ...customList.map(c => ({ ...c, isCustom: true })),
      ...baseItems.map(b => ({ ...b, isCustom: false }))
    ];

    const filtered = combinedItems.filter(item => {
      const matchCat = (selectedCat === 'all' || item.category === selectedCat);
      const matchSearch = (!term || item.title.toLowerCase().includes(term));
      return matchCat && matchSearch;
    });

    filtered.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.isCustom ? `custom:${item.id}` : item.file;
      opt.textContent = (item.isCustom ? '⭐ [Của tôi] ' : '') + item.title;
      bankSelect.appendChild(opt);
    });

    if(statusDiv) {
      statusDiv.textContent = `Đang có ${filtered.length}/${combinedItems.length} bộ đề sẵn sàng trong kho.`;
    }
  };

  renderBankOptions();

  // TỰ ĐỘNG NẠP ĐỀ NGAY KHI NGƯỜI DÙNG CHỌN
  bankSelect.onchange = () => {
    if(bankSelect.value) loadBankItem(bankSelect.value);
  };

  if(catSelect) catSelect.onchange = renderBankOptions;
  if(searchInput) searchInput.oninput = renderBankOptions;

  // Tự động nạp đề đầu tiên nếu chưa có đề nào được nạp
  if(!state.quiz && baseItems.length > 0) {
    const firstVal = baseItems[0].file;
    bankSelect.value = firstVal;
    loadBankItem(firstVal);
  }
}

if(byId('btnBankLoad')) {
  byId('btnBankLoad').addEventListener('click', () => {
    const bankSelect = byId('bankSelect');
    if(!bankSelect.value) return alert('Vui lòng chọn một đề trong danh sách!');
    loadBankItem(bankSelect.value);
  });
}

function renderStart(json){
  state.raw=json; state.quiz=normalizeQuiz(json);
  setHeaderInfo(`Đã tải: ${state.quiz.meta.title}`);
  byId('btnStart').disabled=false; byId('btnReset').disabled=false;
}
byId('btnStart').addEventListener('click', ()=>{ if(!state.quiz) return; resetAll(false); computeOrder(); startQuiz(); });
byId('btnReset').addEventListener('click', ()=> resetAll(true));

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
  
  const modeSelect = byId('quizMode');
  state.mode = modeSelect ? modeSelect.value : 'exam';

  renderQuestion(0); renderMatrix(); renderProgressMeta(); applyFilter();
  const minInput=parseInt(byId('minutes').value,10);
  const total=Number.isFinite(minInput)&&minInput>0 ? minInput*60 : (state.quiz.meta.time_limit_sec||600);
  state.totalSecs = total;
  startTimer(total); state.started=true; saveProgress();
}
function resumeQuiz(){
  byId('loader').classList.add('hide'); byId('quizPanel').classList.remove('hide'); byId('resultPanel').classList.add('hide');
  state.submitted=false; state.started=true;
  renderQuestion(state.current); renderMatrix(); renderProgressMeta(); applyFilter();
  startTimer(state.secs, true);
}
function startTimer(seconds, isResume=false){
  clearInterval(state.timer); state.secs = seconds;
  const tick=()=>{
    byId('headerTimer').textContent=fmtTime(state.secs);
    byId('bigTimer').textContent=fmtTime(state.secs);
    const maxTime = state.totalSecs || (state.quiz.meta.time_limit_sec || 600);
    const pct=Math.max(0,Math.min(100,(1-state.secs/maxTime)*100));
    byId('bar').style.width=pct+'%';
    if(state.secs<=0){ clearInterval(state.timer); submitQuiz(true); }
    state.secs--;
  };
  tick(); state.timer=setInterval(tick,1000);
}
function isQuestionAnswered(idx) {
  const ans = state.answers.get(idx);
  if(!ans) return false;
  if(typeof ans === 'string') return ans.trim().length > 0;
  if(ans instanceof Set) return ans.size > 0;
  return false;
}

function renderProgressMeta(){
  const total=state.orderMap.length;
  let answered=0;
  for(let i=0; i<total; i++) {
    if(isQuestionAnswered(i)) answered++;
  }
  byId('sideMeta').textContent = `${answered}/${total} câu`;
}

/* ============ Renderers ============ */
function renderQuestion(qShownIdx){
  const m=state.orderMap[qShownIdx]; const q=state.quiz.questions[m.qIdx];
  const isEssay = q.type === 'essay';
  const isMulti = q.type === 'multi';

  byId('qTitle').textContent = `Câu ${qShownIdx+1}`;
  byId('qMeta').textContent = `${isEssay ? '📝 Tự luận / Trả lời ngắn' : (isMulti ? 'Chọn nhiều' : 'Chọn một')} • ${state.quiz.questions.length} câu`;
  byId('qText').innerHTML = q.question;

  const btnFlag = byId('btnFlag');
  if(state.flagged.has(qShownIdx)) {
    btnFlag.classList.add('btn-flagged'); btnFlag.textContent = '🚩 Đã đánh dấu';
  } else {
    btnFlag.classList.remove('btn-flagged'); btnFlag.textContent = '🚩 Đánh dấu';
  }

  const imgHost=byId('qImage'); imgHost.innerHTML='';
  if(q.image){ 
    const img=new Image(); img.src=q.image; img.className='zoomable-img'; 
    img.style.maxWidth='100%'; img.style.borderRadius='8px';
    img.title = "Bấm để phóng to";
    img.onerror = () => { imgHost.innerHTML = `<div class="muted" style="font-size:13px; font-style:italic;">⚠️ Không tìm thấy ảnh minh họa (${q.image})</div>`; };
    img.addEventListener('click', () => openLightbox(q.image));
    imgHost.appendChild(img); 
  }

  const opts=byId('qOpts'); opts.innerHTML='';
  const isPractice = state.mode === 'practice';

  // NẾU LÀ CÂU TỰ LUẬN
  if(isEssay) {
    const essayWrapper = document.createElement('div');
    essayWrapper.style.display = 'grid';
    essayWrapper.style.gap = '12px';

    const savedText = typeof state.answers.get(qShownIdx) === 'string' ? state.answers.get(qShownIdx) : '';
    const textarea = document.createElement('textarea');
    textarea.rows = 5;
    textarea.placeholder = 'Nhập câu trả lời hoặc dàn ý tự luận của bạn vào đây...';
    textarea.value = savedText;
    textarea.disabled = state.submitted;
    textarea.addEventListener('input', (e) => {
      onEssayInput(qShownIdx, e.target.value);
    });
    essayWrapper.appendChild(textarea);

    // Khu vực đáp án mẫu & đối chiếu
    const sampleBox = document.createElement('div');
    sampleBox.className = 'card pad';
    sampleBox.style.cssText = 'background: var(--surface-subtle); border: 1px solid var(--line); display: none;';
    
    let sampleContent = `<h4 style="margin:0 0 8px 0; color: var(--ok)">📖 Đáp án mẫu & Hướng dẫn chấm:</h4>`;
    if(q.sample_answer) {
      sampleContent += `<div style="white-space: pre-wrap; margin-bottom: 10px; line-height: 1.6;">${q.sample_answer}</div>`;
    }
    if(Array.isArray(q.grading_criteria) && q.grading_criteria.length > 0) {
      sampleContent += `<div style="margin-top: 8px;"><b>Tiêu chí chấm điểm:</b><ul style="margin: 4px 0 0 18px; padding:0;">`;
      q.grading_criteria.forEach(c => sampleContent += `<li>${c}</li>`);
      sampleContent += `</ul></div>`;
    }
    sampleBox.innerHTML = sampleContent;

    // Nút hiển thị đáp án mẫu
    const btnShowSample = document.createElement('button');
    btnShowSample.className = 'btn ghost btn-sm';
    btnShowSample.style.width = 'fit-content';
    btnShowSample.textContent = '👁️ Xem đáp án mẫu & Biểu điểm';
    btnShowSample.addEventListener('click', () => {
      const isHidden = sampleBox.style.display === 'none';
      sampleBox.style.display = isHidden ? 'block' : 'none';
      btnShowSample.textContent = isHidden ? '🙈 Ẩn đáp án mẫu' : '👁️ Xem đáp án mẫu & Biểu điểm';
    });

    if(state.submitted || (isPractice && savedText.trim().length > 0)) {
      sampleBox.style.display = 'block';
      btnShowSample.textContent = '🙈 Ẩn đáp án mẫu';
    }

    essayWrapper.appendChild(btnShowSample);
    essayWrapper.appendChild(sampleBox);
    opts.appendChild(essayWrapper);

  } else {
    // CÂU HỎI TRẮC NGHIỆM THƯỜNG
    const chosenSet = state.answers.get(qShownIdx) instanceof Set ? state.answers.get(qShownIdx) : new Set();
    const hasAnswered = chosenSet.size > 0;

    m.optOrder.forEach((origOptIdx, shownIdx)=>{
      const lab=document.createElement('div'); lab.className='opt';
      lab.addEventListener('click', (e) => {
          if(state.submitted) return;
          if(e.target.closest('.badge') && e.target !== lab) return;
          onSelect(qShownIdx, shownIdx, isMulti);
      });
      if(chosenSet.has(shownIdx)) lab.classList.add('chosen');
      
      if(isPractice && hasAnswered) {
        const isCorrectOpt = q.correct.includes(origOptIdx);
        const isChosenOpt = chosenSet.has(shownIdx);
        if(isCorrectOpt) lab.classList.add('correct');
        if(isChosenOpt && !isCorrectOpt) lab.classList.add('wrong');
      }

      const badge=document.createElement('span'); badge.className='badge'; badge.textContent=String.fromCharCode(65+shownIdx);
      const span=document.createElement('div'); span.innerHTML=q.options[origOptIdx];
      lab.appendChild(badge); lab.appendChild(span); opts.appendChild(lab);
    });
  }

  const exp=byId('qExp'); exp.innerHTML=q.explanation?`💡 <b>Giải thích:</b> ${q.explanation}`:'';
  exp.classList.remove('show');

  if(state.submitted){
    decorateAfterSubmit(qShownIdx);
    if(state.autoShowExp && !checkQuestion(qShownIdx) && q.explanation) exp.classList.add('show');
  } else if(isPractice && q.explanation) {
    const isAnswered = isEssay ? (typeof state.answers.get(qShownIdx) === 'string' && state.answers.get(qShownIdx).trim().length > 0) : ((state.answers.get(qShownIdx) instanceof Set) && state.answers.get(qShownIdx).size > 0);
    if(isAnswered) exp.classList.add('show');
  }

  applyFontSize();
}

function renderMatrix(){
  const host=byId('qMatrix'); host.innerHTML='';
  state.orderMap.forEach((m,i)=>{
    const q=state.quiz.questions[m.qIdx];
    const isEssay = q.type === 'essay';
    const isMulti = q.type === 'multi';
    const row=document.createElement('div'); row.className='mrow'; row.dataset.q=i;
    
    if(state.flagged.has(i)) row.classList.add('is-flagged');

    const num=document.createElement('div'); num.className='mnum'; num.textContent=String(i+1);
    if(i===state.current){ num.classList.add('current'); row.classList.add('current'); }
    num.addEventListener('click',()=>{ setCurrent(i); scrollRowIntoView(i); });
    row.appendChild(num);

    const mopts=document.createElement('div'); mopts.className='mopts';
    
    if(isEssay) {
      const essayBadge = document.createElement('span');
      essayBadge.className = 'pill';
      essayBadge.style.fontSize = '11px';
      essayBadge.style.padding = '2px 8px';
      const ans = state.answers.get(i);
      const isDone = typeof ans === 'string' && ans.trim().length > 0;
      essayBadge.textContent = isDone ? '✍️ Đã viết' : '📝 Tự luận';
      mopts.appendChild(essayBadge);
    } else {
      const chosen = state.answers.get(i) instanceof Set ? state.answers.get(i) : new Set();
      m.optOrder.forEach((orig, shownIdx)=>{
        const label=document.createElement('label'); label.className='mopt';
        const input=document.createElement('input'); input.type=isMulti?'checkbox':'radio'; input.name=`mx_${i}`; input.value=String(shownIdx);
        input.checked = chosen.has(shownIdx);
        input.disabled = state.submitted;
        input.addEventListener('change',()=>{ setCurrent(i); onSelect(i, shownIdx, isMulti); });
        const span=document.createElement('span'); span.textContent=String.fromCharCode(65+shownIdx);
        label.appendChild(input); label.appendChild(span); mopts.appendChild(label);
      });
    }

    row.appendChild(mopts);
    host.appendChild(row);
  });
}

function renderMatrixRow(i){
  const host=byId('qMatrix'); const row=host.querySelector(`.mrow[data-q="${i}"]`); if(!row) return;
  $$('#qMatrix .mrow').forEach(r=>r.classList.remove('current'));
  row.classList.add('current');
  $$('#qMatrix .mnum').forEach(n=>n.classList.remove('current'));
  row.querySelector('.mnum').classList.add('current');
  
  if(state.flagged.has(i)) row.classList.add('is-flagged');
  else row.classList.remove('is-flagged');

  const q=state.quiz.questions[state.orderMap[i].qIdx];
  const isEssay = q.type === 'essay';

  if(isEssay) {
    const badge = row.querySelector('.mopts .pill');
    const ans = state.answers.get(i);
    const isDone = typeof ans === 'string' && ans.trim().length > 0;
    if(badge) badge.textContent = isDone ? '✍️ Đã viết' : '📝 Tự luận';
    if(state.submitted) {
      row.classList.toggle('ok', isDone);
      row.classList.toggle('bad', !isDone);
    }
  } else {
    const chosenSet = state.answers.get(i) instanceof Set ? state.answers.get(i) : new Set();
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
function onEssayInput(qShownIdx, text) {
  state.answers.set(qShownIdx, text);
  renderMatrixRow(qShownIdx);
  renderProgressMeta();
  applyFilter();
  saveProgress();
}

function onSelect(qShownIdx, optShownIdx, isMulti){
  const currentVal = state.answers.get(qShownIdx);
  const set = (currentVal instanceof Set) ? currentVal : new Set();
  if(isMulti){ if(set.has(optShownIdx)) set.delete(optShownIdx); else set.add(optShownIdx); }
  else { set.clear(); set.add(optShownIdx); }
  state.answers.set(qShownIdx, set);
  renderMatrixRow(qShownIdx); renderProgressMeta(); applyFilter();
  if(qShownIdx===state.current) renderQuestion(qShownIdx);
  saveProgress();
}
function mapShownToOrig(qShownIdx, optShownIdx){ 
  if(!state.orderMap[qShownIdx] || !state.orderMap[qShownIdx].optOrder) return optShownIdx;
  return state.orderMap[qShownIdx].optOrder[optShownIdx]; 
}
function checkQuestion(qShownIdx){
  const m=state.orderMap[qShownIdx]; const q=state.quiz.questions[m.qIdx];
  if(q.type === 'essay') {
    const text = typeof state.answers.get(qShownIdx) === 'string' ? state.answers.get(qShownIdx).trim() : '';
    return text.length > 0; // Câu tự luận: chỉ cần đã làm là tính hoàn thành
  }
  const chosen = state.answers.get(qShownIdx);
  const sel=[...(chosen instanceof Set ? chosen : [])].map(i=>mapShownToOrig(qShownIdx,i)).sort((a,b)=>a-b);
  const correct=(q.correct||[]).slice().sort((a,b)=>a-b);
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
    const answered = isQuestionAnswered(idx);
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
  if(!auto) {
    let answeredCount = 0;
    for(let i=0; i<state.orderMap.length; i++) {
      if(isQuestionAnswered(i)) answeredCount++;
    }
    if(answeredCount < state.orderMap.length) {
      if(!confirm(`⚠️ Bạn còn ${state.orderMap.length - answeredCount} câu chưa làm. Bạn có chắc chắn muốn nộp bài?`)) return;
    }
  }

  state.submitted=true; clearInterval(state.timer); clearProgress(); 

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
    if(!state.resultViewAll && ok) return; 

    const q=state.quiz.questions[m.qIdx];
    const isEssay = q.type === 'essay';
    const box=document.createElement('div'); box.className='card pad';
    box.innerHTML = `<div style="margin-bottom:6px"><b>Câu ${i+1}.</b> ${q.question} <span class="pill" style="font-size:11px;">${isEssay?'Tự luận':'Trắc nghiệm'}</span></div>`;
    
    if(q.image) {
       box.innerHTML += `<img src="${q.image}" style="max-width:200px; border-radius:8px; margin-bottom:10px; display:block;" />`;
    }

    if(isEssay) {
      const userAns = typeof state.answers.get(i) === 'string' ? state.answers.get(i).trim() : '';
      box.innerHTML += `
        <div style="margin: 8px 0; padding: 10px; background: var(--surface-subtle); border-radius: 8px; border-left: 3px solid ${userAns ? 'var(--ok)' : 'var(--bad)'};">
          <b>Bài làm của bạn:</b>
          <div style="white-space: pre-wrap; margin-top: 4px; font-style: ${userAns ? 'normal' : 'italic'}; color: ${userAns ? 'var(--text)' : 'var(--muted)'};">${userAns || '(Chưa làm câu này)'}</div>
        </div>
      `;

      if(q.sample_answer) {
        box.innerHTML += `
          <div style="margin: 8px 0; padding: 10px; background: rgba(34, 197, 94, 0.08); border-radius: 8px; border-left: 3px solid var(--ok);">
            <b style="color: var(--ok);">Đáp án mẫu:</b>
            <div style="white-space: pre-wrap; margin-top: 4px; line-height: 1.5;">${q.sample_answer}</div>
          </div>
        `;
      }
      if(Array.isArray(q.grading_criteria) && q.grading_criteria.length > 0) {
        let critList = `<div style="margin-top: 6px; font-size: 13px;"><b>Tiêu chí chấm điểm:</b><ul style="margin: 2px 0 0 16px; padding:0;">`;
        q.grading_criteria.forEach(c => critList += `<li>${c}</li>`);
        critList += `</ul></div>`;
        box.innerHTML += critList;
      }
    } else {
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
    }

    if(q.explanation){ 
      const ex=document.createElement('div'); ex.className='exp show'; 
      ex.innerHTML=`💡 <b>Giải thích / Ghi chú:</b> ${q.explanation}`; box.appendChild(ex); 
    }
    container.appendChild(box);
  });
  
  if(container.childNodes.length === 0) {
    container.innerHTML = `<div class="muted">Tất cả các câu đều đạt! Tuyệt vời!</div>`;
  }
  wr.appendChild(container);
}

byId('btnToggleResultView').addEventListener('click', (e) => {
  state.resultViewAll = !state.resultViewAll;
  e.target.textContent = state.resultViewAll ? "Lọc: Đang xem TẤT CẢ câu hỏi" : "Lọc: Đang xem câu SAI & CHƯA LÀM";
  renderResultList();
});

byId('btnPrint').addEventListener('click', () => { window.print(); });

/* ============ Hướng dẫn mới & Phím tắt ============ */
const guideOverlay = byId('guideOverlay');
const toggleGuide = () => guideOverlay.classList.toggle('active');

byId('btnHelp').addEventListener('click', toggleGuide);
byId('closeGuide').addEventListener('click', () => guideOverlay.classList.remove('active'));
guideOverlay.addEventListener('click', e => { if(e.target === guideOverlay) guideOverlay.classList.remove('active'); });

// Copy Prompt AI nhanh
byId('btnCopyPrompt').addEventListener('click', () => {
  const promptText = byId('promptText').innerText;
  navigator.clipboard.writeText(promptText).then(() => {
    const btn = byId('btnCopyPrompt');
    btn.textContent = "✅ Đã Copy vào bộ nhớ tạm!";
    btn.style.background = "#fff";
    setTimeout(() => {
      btn.textContent = "📋 Copy Prompt";
      btn.style.background = "var(--ok)";
    }, 2500);
  });
});

window.addEventListener('keydown', e => {
  // Bỏ qua nếu người dùng đang nhập text
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

  const lightbox = byId('imageLightbox');

  // Bấm ESC để đóng modal
  if (e.key === 'Escape') {
    guideOverlay.classList.remove('active');
    if (lightbox) lightbox.classList.remove('show');
    return;
  }

  // Phím ? (Shift + /) để bật/tắt bảng Hướng dẫn
  if (e.key === '?') {
    toggleGuide();
    return;
  }

  // Khóa phím tắt làm bài khi đang hiện hướng dẫn/lightbox
  if (guideOverlay.classList.contains('active') || (lightbox && lightbox.classList.contains('show'))) return;
  if (!state.started || state.submitted) return;
  
  // Phím F: Đánh dấu cờ (Flag)
  if (e.key.toLowerCase() === 'f') {
    byId('btnFlag').click();
    e.preventDefault();
    return;
  }

  if(e.key === 'ArrowRight') { byId('btnNext').click(); e.preventDefault(); }
  if(e.key === 'ArrowLeft') { byId('btnPrev').click(); e.preventDefault(); }
  if(e.key === 'Enter') { submitQuiz(false); e.preventDefault(); }
  
  // Phím chọn đáp án: 1-5 hoặc A-E
  const keyMap = {'a':0,'1':0, 'b':1,'2':1, 'c':2,'3':2, 'd':3,'4':3, 'e':4,'5':4};
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
  if(state.autoShowExp && (state.submitted || state.mode === 'practice') && (state.quiz.questions[q.qIdx].explanation)) e.classList.add('show');
  else e.classList.remove('show');
});
byId('btnNew').addEventListener('click', ()=>{ if(confirm('Thoát bài thi hiện tại và làm đề mới?')) resetAll(true); });

byId('btnRedoResult').addEventListener('click', ()=> {
  state.submitted=false; state.answers.clear(); state.flagged.clear();
  computeOrder(); renderQuestion(0); renderMatrix(); renderProgressMeta(); applyFilter();
  byId('resultPanel').classList.add('hide'); byId('scorePill').classList.add('hide');
  startTimer(state.totalSecs || (state.quiz.meta.time_limit_sec || 600));
});

// Tính năng mới: Làm lại các câu sai
if(byId('btnRedoWrong')) {
  byId('btnRedoWrong').addEventListener('click', () => {
    const wrongOrderIndices = [];
    for(let i=0; i<state.orderMap.length; i++) {
      if(!checkQuestion(i)) wrongOrderIndices.push(i);
    }
    if(wrongOrderIndices.length === 0) {
      return alert('🎉 Chúc mừng! Bạn không làm sai câu nào để làm lại.');
    }
    
    // Thu hẹp danh sách câu hỏi chỉ gồm các câu sai
    const newQuestions = wrongOrderIndices.map(i => state.quiz.questions[state.orderMap[i].qIdx]);
    const filteredQuiz = {
      meta: {
        ...state.quiz.meta,
        title: `${state.quiz.meta.title} (Làm lại ${wrongOrderIndices.length} câu sai)`
      },
      questions: newQuestions
    };

    loadQuizObject(filteredQuiz);
    startQuiz();
  });
}

// Cỡ chữ A- / A+
if(byId('btnFontDec')) byId('btnFontDec').addEventListener('click', () => changeFontSize(-1));
if(byId('btnFontInc')) byId('btnFontInc').addEventListener('click', () => changeFontSize(1));

// Nút đổi giao diện Sáng / Tối
if(byId('btnThemeToggle')) byId('btnThemeToggle').addEventListener('click', toggleTheme);

byId('filterGroup').addEventListener('click', e=>{
  const b=e.target.closest('.chip'); if(!b) return;
  $$('#filterGroup .chip').forEach(c=>c.classList.remove('active'));
  b.classList.add('active'); state.viewFilter=b.dataset.filter; applyFilter();
});

// Xử lý đóng mở Modal Hình Ảnh (Lightbox)
function openLightbox(src) { 
    if(!byId('lightboxImg') || !byId('imageLightbox')) return;
    byId('lightboxImg').src = src; 
    byId('imageLightbox').classList.add('show'); 
}
if(byId('closeLightbox')){
  byId('closeLightbox').addEventListener('click', ()=> byId('imageLightbox').classList.remove('show'));
  byId('imageLightbox').addEventListener('click', e=> { if(e.target===byId('imageLightbox')) byId('imageLightbox').classList.remove('show'); });
}

/* ============ Reset All ============ */
function resetAll(hard = false){
  clearInterval(state.timer); state.started=false; state.submitted=false;
  state.answers.clear(); state.flagged.clear(); state.orderMap=[]; state.current=0;
  clearProgress();
  byId('loader').classList.remove('hide'); byId('quizPanel').classList.add('hide');
  byId('resultPanel').classList.add('hide'); byId('scorePill').classList.add('hide');
  byId('headerTimer').textContent='00:00'; byId('bigTimer').textContent='00:00'; byId('bar').style.width='0%';
  if(hard) {
    state.raw=null; state.quiz=null;
    byId('btnStart').disabled = true; byId('btnReset').disabled = true;
    setHeaderInfo('Chưa tải đề');
  }
}

/* ============ Khởi chạy lúc load trang ============ */
setHeaderInfo('Chưa tải đề');
initTheme();
initFontSize();
initQuestionBank();
window.addEventListener('load', checkAndLoadProgress);

