// ========== 数据层 ==========
const STORAGE_KEY = 'studyroom_data_v1';

const defaultCourses = [
  { id: 'aidm7320', name: 'AIDM7320 传播学基础', examDate: '2026-12-20', enabled: true, note: '闭卷考试，12月20日。' },
  { id: 'aidm7360', name: 'AIDM7360 大数据管理', examDate: '2026-12-09', enabled: true, note: '一张A4 cheat sheet' },
  { id: 'aidm7390', name: 'AIDM7390 数据挖掘', examDate: '2026-12-18', enabled: true, note: '一张A4 cheat sheet' },
  { id: 'aidm7330', name: 'AIDM7330 编程与数据科学', examDate: '2026-12-13', enabled: true, note: 'Takehome考试。' },
  { id: 'comm7020', name: 'COMM7020 传播研究方法', examDate: '2026-12-17', enabled: true, note: '闭卷考试。' }
];

let appData = {
  courses: JSON.parse(JSON.stringify(defaultCourses)),
  tasks: [],
  pomodoro: { 
    running: false, 
    mode: 'countdown', // 'countdown' | 'countup'
    target: 1500,      // 倒计时目标
    current: 1500      // 当前显示的秒数
  },
  records: {},
  pet: { enabled: false, defaultImg: '', focusImg: '', position: null },
  settings: { greeting: '' }
};

let timerInterval = null;
let chartRing = null, chartBar = null, chartTrend = null;
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();

// ========== 工具函数 ==========
function getTodayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function daysUntil(dateStr) {
  if(!dateStr) return 999;
  const exam = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0,0,0,0);
  return Math.ceil((exam - now) / 86400000);
}

function escapeHtml(str) {
  if(!str) return '';
  return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function ensureRecord(dateStr) {
  if (!appData.records[dateStr]) {
    appData.records[dateStr] = { review: '', tasks: [], pom: 0 };
  }
  return appData.records[dateStr];
}

function formatTime(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return m + ':' + s;
}

// ========== 存储 ==========
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
}

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try { 
      const parsed = JSON.parse(raw); 
      appData = Object.assign(appData, parsed);
      
      // 兼容旧版番茄钟数据
      if (appData.pomodoro && !appData.pomodoro.mode) {
        appData.pomodoro = {
          running: appData.pomodoro.running || false,
          mode: 'countdown',
          target: appData.pomodoro.total || 1500,
          current: appData.pomodoro.left || 1500
        };
      }
      if(!appData.records) appData.records = {};
      if(!appData.pet) appData.pet = { enabled: false, defaultImg: '', focusImg: '', position: null };
    } catch(e) { console.warn('数据读取失败'); }
  }
}

// ========== 视图切换 ==========
function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-' + name);
  if(target) target.classList.add('active');
  
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  const tab = document.querySelector(`.nav-tab[data-view="${name}"]`);
  if(tab) tab.classList.add('active');
  
  if (name === 'stats') { renderTrend(); renderHeatmap(); renderCalendar(); }
  if (name === 'home') { renderCharts(); renderAdvice(); }
  if (name === 'plan') renderPlan();
  if (name === 'courses') renderCourseManage();
}

// ========== 时钟 ==========
function updateClock() {
  const d = new Date();
  const tEl = document.getElementById('clockTime');
  const dEl = document.getElementById('clockDate');
  if(tEl) tEl.textContent = String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  if(dEl) dEl.textContent = d.toLocaleDateString('zh-CN', { year:'numeric', month:'long', day:'numeric', weekday:'long' });
}

// ========== 首页：科目 & 复习建议 ==========
function renderCourses() {
  const grid = document.getElementById('courseGrid');
  if(!grid) return;
  const enabled = appData.courses.filter(c => c.enabled).sort((a,b) => daysUntil(a.examDate) - daysUntil(b.examDate));

  if (enabled.length === 0) {
    grid.innerHTML = `<div class="empty-hint">
      <p>还没有启用的科目，点击右上角添加</p>
    </div>`;
    return;
  }

  grid.innerHTML = enabled.map(c => {
    const days = daysUntil(c.examDate);
    return `<div class="course-item" data-id="${c.id}">
      <div class="course-item-head">
        <input type="checkbox" class="cb-enable" data-id="${c.id}" checked style="accent-color:var(--primary);">
        <span class="course-name">${escapeHtml(c.name)}</span>
      </div>
      <div class="course-countdown">${days > 0 ? days + ' 天' : '已结束'}</div>
      <div class="course-date">📅 ${c.examDate}</div>
    </div>`;
  }).join('');

  document.querySelectorAll('.cb-enable').forEach(cb => {
    cb.onchange = (e) => {
      e.stopPropagation();
      const c = appData.courses.find(x => x.id === cb.dataset.id);
      if (c) c.enabled = cb.checked;
      save(); renderCourses(); updateProgress(); renderCharts(); renderAdvice();
    };
  });

  document.querySelectorAll('.course-item').forEach(item => {
    item.onclick = () => openCourseDetail(item.dataset.id);
  });

  updateProgress();
}

function updateProgress() {
  const enabled = appData.courses.filter(c => c.enabled);
  const done = enabled.filter(c => daysUntil(c.examDate) <= 0).length;
  const pct = enabled.length ? Math.round(done / enabled.length * 100) : 0;
  const el = document.getElementById('totalProgress');
  if(el) el.textContent = '总进度 ' + pct + '%';
}

function renderAdvice() {
  const wrap = document.getElementById('reviewAdviceList');
  if (!wrap) return;
  const enabled = appData.courses.filter(c => c.enabled && daysUntil(c.examDate) >= 0);
  if (enabled.length === 0) {
    wrap.innerHTML = `<p style="color:var(--text-light);font-size:13px;">暂无需要复习的科目。</p>`;
    return;
  }
  let totalWeight = 0;
  const weights = enabled.map(c => {
    const days = daysUntil(c.examDate);
    const w = 1 / Math.pow(days + 1, 2); 
    totalWeight += w;
    return { course: c, weight: w };
  });
  weights.sort((a,b) => b.weight - a.weight);

  wrap.innerHTML = weights.map(item => {
    const pct = Math.round((item.weight / totalWeight) * 100);
    return `<div class="advice-item">
      <div class="advice-head">
        <span style="font-weight:500;">${escapeHtml(item.course.name)}</span>
        <span style="color:var(--primary);font-weight:600;">${pct}%</span>
      </div>
      <div class="advice-bar-bg"><div class="advice-bar-fill" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');
}

// ========== 计划 & 科目管理 ==========
function renderPlan() {
  const list = document.getElementById('planList');
  if(!list) return;
  const enabled = appData.courses.filter(c => c.enabled).sort((a,b) => daysUntil(a.examDate) - daysUntil(b.examDate));
  if (enabled.length === 0) { list.innerHTML = `<div class="empty-hint">暂无启用的科目</div>`; return; }
  list.innerHTML = enabled.map(c => `
    <div class="course-item" style="margin-bottom:12px; cursor:default;">
      <div class="course-item-head" style="justify-content:space-between;">
        <span class="course-name">${escapeHtml(c.name)}</span>
        <span style="color:var(--primary);font-size:13px;">${daysUntil(c.examDate)} 天后</span>
      </div>
      <div style="font-size:13px;color:var(--text-light);margin-top:8px;white-space:pre-line;">${escapeHtml(c.note)}</div>
    </div>
  `).join('');
}

function renderCourseManage() {
  const list = document.getElementById('courseManageList');
  if(!list) return;
  if(appData.courses.length === 0) { list.innerHTML = `<p style="color:var(--text-light);font-size:14px;">暂无科目</p>`; return; }
  list.innerHTML = appData.courses.map(c => {
    const days = daysUntil(c.examDate);
    return `<div class="course-item" style="margin-bottom:10px; cursor:default;">
      <div class="course-item-head">
        <input type="checkbox" class="cb-manage" data-id="${c.id}" ${c.enabled ? 'checked' : ''} style="accent-color:var(--primary);cursor:pointer;">
        <div style="flex:1;">
          <div class="course-name">${escapeHtml(c.name)}</div>
          <div class="course-date">📅 ${c.examDate} · ${days > 0 ? days + '天后' : '已结束'}</div>
        </div>
        <button class="btn-link btn-del" data-id="${c.id}" style="color:#d9534f;">删除</button>
      </div>
    </div>`;
  }).join('');

  document.querySelectorAll('.cb-manage').forEach(cb => {
    cb.onchange = () => {
      const c = appData.courses.find(x => x.id === cb.dataset.id);
      if (c) c.enabled = cb.checked;
      save(); renderCourses(); renderAdvice();
    };
  });

  document.querySelectorAll('.btn-del').forEach(btn => {
    btn.onclick = () => {
      if(confirm('确定删除该科目吗？')) {
        appData.courses = appData.courses.filter(c => c.id !== btn.dataset.id);
        save(); renderCourseManage(); renderCourses(); renderAdvice();
      }
    }
  });
}

// ========== 任务 ==========
function renderTasks() {
  const list = document.getElementById('taskList');
  if(!list) return;
  if (appData.tasks.length === 0) { list.innerHTML = '<div class="empty-hint small">纸页空白，记一件小事吧</div>'; return; }
  
  list.innerHTML = appData.tasks.map((t, i) => `
    <div class="task-item ${t.done ? 'done' : ''}">
      <input type="checkbox" data-i="${i}" ${t.done ? 'checked' : ''} class="task-cb">
      <span class="task-text">${escapeHtml(t.title)}</span>
      <span class="task-min">${t.min}min</span>
    </div>
  `).join('');

  document.querySelectorAll('.task-cb').forEach(cb => {
    cb.onchange = () => {
      const idx = cb.dataset.i;
      appData.tasks[idx].done = cb.checked;
      const today = getTodayStr();
      const rec = ensureRecord(today);
      const task = appData.tasks[idx];
      const exist = rec.tasks.find(x => x.title === task.title && x.min === task.min);
      if (exist) { exist.done = task.done; } else { rec.tasks.push({ title: task.title, min: task.min, done: task.done }); }
      save(); renderTasks(); renderCharts();
    };
  });
}

function addTask() {
  const titleEl = document.getElementById('taskInput');
  const minEl = document.getElementById('taskMin');
  if(!titleEl || !minEl) return;
  const title = titleEl.value.trim();
  const min = parseInt(minEl.value) || 30;
  if (!title) return;
  appData.tasks.push({ title, min, done: false });
  titleEl.value = '';
  save(); renderTasks(); renderCharts();
}

// ========== 强大的番茄钟 & 专注模式 ==========
function renderPomodoro() {
  const p = appData.pomodoro;
  const timeStr = formatTime(p.current);
  
  // 1. 同步首页卡片
  const hTime = document.getElementById('pomTime');
  const hStatus = document.getElementById('pomStatus');
  const hBtn = document.getElementById('pomStart');
  if (hTime) hTime.textContent = timeStr;
  if (hStatus) hStatus.textContent = p.running ? '专注中...' : '准备就绪';
  if (hBtn) hBtn.textContent = p.running ? '专注中' : '开始专注';
  
  // 2. 同步全屏界面
  const bTime = document.getElementById('timerBigTime');
  const bBtn = document.getElementById('timerToggleBtn');
  if (bTime) bTime.textContent = timeStr;
  if (bBtn) bBtn.textContent = p.running ? '暂停' : '开始专注';
  
  document.querySelectorAll('.timer-mode-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.mode === p.mode);
  });

  // 3. 同步桌宠
  const petClock = document.getElementById('petClock');
  if (petClock) {
    if (p.running) { petClock.style.display = 'block'; petClock.textContent = timeStr; } 
    else { petClock.style.display = 'none'; }
  }

  // 更新图表和桌宠图片
  renderCharts();
  renderPet();
}

function startTimer() {
  if (appData.pomodoro.running) return;
  appData.pomodoro.running = true;
  save();
  
  timerInterval = setInterval(() => {
    const p = appData.pomodoro;
    if (p.mode === 'countdown') {
      p.current--;
      if (p.current <= 0) {
        p.current = 0;
        p.running = false;
        clearInterval(timerInterval);
        alert('倒计时结束！专注完成！');
        recordPomodoroTime(p.target / 60); // 记录目标分钟数
      }
    } else {
      p.current++;
    }
    
    if (!p.running) clearInterval(timerInterval);
    if (p.current % 10 === 0) save();
    renderPomodoro();
  }, 1000);
  
  renderPomodoro();
}

function pauseTimer() {
  const p = appData.pomodoro;
  if (!p.running) return;
  p.running = false;
  clearInterval(timerInterval);
  
  if (p.mode === 'countup') {
    recordPomodoroTime(p.current / 60);
    p.current = 0;
  } else {
    recordPomodoroTime((p.target - p.current) / 60);
    p.current = p.target;
  }
  
  save(); renderPomodoro();
}

function resetTimer() {
  clearInterval(timerInterval);
  const p = appData.pomodoro;
  p.running = false;
  p.current = p.mode === 'countdown' ? p.target : 0;
  save(); renderPomodoro();
}

function recordPomodoroTime(minutes) {
  if (minutes <= 0) return;
  const today = getTodayStr();
  const rec = ensureRecord(today);
  rec.pom = (rec.pom || 0) + Math.floor(minutes);
  save();
}

// ========== 图表 ==========
function renderCharts() {
  if (typeof Chart === 'undefined') return;

  const done = appData.tasks.filter(t => t.done).length;
  const total = appData.tasks.length;
  const ctx1 = document.getElementById('chartRing');
  if (ctx1) {
    if (chartRing) chartRing.destroy();
    chartRing = new Chart(ctx1, {
      type: 'doughnut',
      data: {
        labels: ['已完成', '未完成'],
        datasets: [{ data: [done, total - done || 1], backgroundColor: ['#c88b75', '#f0d9ce'], borderWidth: 0 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '65%',
        plugins: { title: { display: true, text: '今日任务完成率', color: '#4a3728', font:{size:13} }, legend: { position: 'bottom', labels:{boxWidth:12} } }
      }
    });
  }

  const p = appData.pomodoro;
  let used = p.mode === 'countdown' ? Math.floor((p.target - p.current) / 60) : Math.floor(p.current / 60);
  if (used < 0) used = 0;
  const ctx2 = document.getElementById('chartBar');
  if (ctx2) {
    if (chartBar) chartBar.destroy();
    chartBar = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: ['本次专注'],
        datasets: [{ label: '已专注(分)', data: [used], backgroundColor: '#c88b75' }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { title: { display: true, text: '当前专注时长', color: '#4a3728', font:{size:13} }, legend: { display: false } },
        scales: { x: { grid:{display:false} }, y: { beginAtZero: true, grid:{color:'rgba(232,220,200,0.5)'} } }
      }
    });
  }
}

function renderTrend() {
  if (typeof Chart === 'undefined') return;
  const labels = [], data = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    labels.push((d.getMonth()+1) + '/' + d.getDate());
    data.push((appData.records[k] && appData.records[k].pom) || 0);
  }
  const ctx = document.getElementById('chartTrend');
  if(!ctx) return;
  if (chartTrend) chartTrend.destroy();
  chartTrend = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ label: '专注分钟', data, borderColor: '#c88b75', backgroundColor: '#f0d9ce', fill: true, tension: 0.3, pointBackgroundColor:'#c88b75' }] },
    options: { responsive: true, maintainAspectRatio: false, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true, grid:{color:'rgba(232,220,200,0.5)'}},x:{grid:{display:false}}} }
  });
}

function renderHeatmap() {
  const wrap = document.getElementById('heatmap');
  if(!wrap) return;
  wrap.innerHTML = '';
  for (let i = 27; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    const rec = appData.records[k];
    const cell = document.createElement('div');
    cell.className = 'heat-cell';
    if (rec && (rec.pom > 0 || (rec.tasks && rec.tasks.some(t => t.done)))) cell.classList.add('active');
    if (rec && rec.pom > 30) cell.classList.add('more');
    cell.title = k;
    wrap.appendChild(cell);
  }
}

// ========== 日历打卡 ==========
function renderCalendar() {
  const titleEl = document.getElementById('calTitle');
  const grid = document.getElementById('calGrid');
  const sumEl = document.getElementById('calSummary');
  if(!titleEl || !grid) return;

  titleEl.textContent = calYear + '年 ' + (calMonth + 1) + '月';
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const todayStr = getTodayStr();

  let html = '';
  for (let i = 0; i < firstDay; i++) html += '<div class="cal-day other"></div>';
  
  let doneCount = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = calYear + '-' + String(calMonth+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    const rec = appData.records[ds];
    const isDone = rec && (rec.pom > 0 || (rec.tasks && rec.tasks.some(t => t.done)));
    if (isDone) doneCount++;
    const cls = 'cal-day' + (isDone ? ' done' : '') + (ds === todayStr ? ' today' : '');
    html += `<div class="${cls}" data-date="${ds}">${d}</div>`;
  }
  grid.innerHTML = html;
  if(sumEl) sumEl.textContent = '本月打卡 ' + doneCount + ' 天';

  document.querySelectorAll('.cal-day[data-date]').forEach(el => {
    el.onclick = () => {
      const ds = el.dataset.date;
      const rec = appData.records[ds];
      const pomText = rec ? `专注 ${rec.pom} 分钟` : '无专注记录';
      const taskText = rec && rec.tasks ? `完成任务 ${rec.tasks.filter(t=>t.done).length} 项` : '无任务记录';
      openModal(ds + ' 记录', `<p style="color:var(--text-light);font-size:14px;line-height:1.8;">${pomText}<br>${taskText}</p>`);
    };
  });
}

// ========== 弹窗与设置 ==========
function openModal(title, bodyHtml) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalOverlay').classList.add('show');
}
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('show');
}

function openCourseDetail(id) {
  const c = appData.courses.find(x => x.id === id);
  if (!c) return;
  const days = daysUntil(c.examDate);
  openModal(c.name, `
    <p style="margin-bottom:12px;font-size:14px;">📅 考试日期：${c.examDate}（${days > 0 ? '还剩 ' + days + ' 天' : '已结束'}）</p>
    <div style="white-space:pre-line; line-height:1.8; color:var(--text); font-size:14px;">${escapeHtml(c.note)}</div>
  `);
}

function openReviewModal() {
  const today = getTodayStr();
  const rec = ensureRecord(today);
  openModal('📝 今日复盘', `
    <textarea id="reviewText" placeholder="写下今天的收获和感受...">${escapeHtml(rec.review || '')}</textarea>
    <button class="btn-primary" id="btnSaveReview" style="width:100%;margin-top:12px;">保存复盘</button>
  `);
  document.getElementById('btnSaveReview').onclick = () => {
    rec.review = document.getElementById('reviewText').value;
    save(); closeModal(); renderCalendar(); renderHeatmap();
  };
}

function openSettingsModal() {
  openModal('⚙ 偏好设置', `
    <label class="form-label">顶部问候称呼</label>
    <input id="setGreet" value="${escapeHtml(appData.settings.greeting || '')}" placeholder="例如：同学">
    <label class="form-label" style="margin-top:12px;">桌宠挂件</label>
    <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;font-size:14px;">
      <input type="checkbox" id="setPet" ${appData.pet.enabled ? 'checked' : ''} style="width:auto;margin:0;">
      启用右下角桌宠
    </label>
    <label class="form-label">默认状态图</label>
    <input type="file" id="petDefaultFile" accept="image/*">
    <label class="form-label">专注状态图</label>
    <input type="file" id="petFocusFile" accept="image/*">
    <div style="display:flex;gap:8px;margin-top:20px;flex-wrap:wrap;">
      <button class="btn-primary" id="btnSaveSettings" style="flex:1;">保存</button>
      <button class="btn-default" id="btnExport">导出</button>
      <button class="btn-default" id="btnImport">导入</button>
      <button class="btn-default btn-danger" id="btnClear">清空</button>
    </div>
  `);

  document.getElementById('btnSaveSettings').onclick = () => {
    appData.settings.greeting = document.getElementById('setGreet').value;
    appData.pet.enabled = document.getElementById('setPet').checked;
    save(); updateGreeting(); renderPet(); closeModal();
  };
  document.getElementById('petDefaultFile').onchange = (e) => readImg(e, 'defaultImg');
  document.getElementById('petFocusFile').onchange = (e) => readImg(e, 'focusImg');
  document.getElementById('btnExport').onclick = () => {
    const blob = new Blob([JSON.stringify(appData, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'studyroom_backup.json'; a.click();
  };
  document.getElementById('btnImport').onclick = () => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.json';
    i.onchange = e => {
      const r = new FileReader();
      r.onload = ev => { try { appData = JSON.parse(ev.target.result); save(); location.reload(); } catch(err) { alert('格式错误'); } };
      r.readAsText(e.target.files[0]);
    };
    i.click();
  };
  document.getElementById('btnClear').onclick = () => {
    if (confirm('确定清空所有数据？')) { localStorage.removeItem(STORAGE_KEY); location.reload(); }
  };
}

function readImg(e, key) {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = ev => { appData.pet[key] = ev.target.result; save(); renderPet(); };
  r.readAsDataURL(f);
}

function openAddCourseModal() {
  openModal('新增科目', `
    <label class="form-label">科目名称</label>
    <input id="newCourseName" placeholder="例如：COMM7020">
    <label class="form-label">考试日期</label>
    <input id="newCourseDate" type="date">
    <label class="form-label">备注/考点</label>
    <textarea id="newCourseNote" placeholder="考试形式、复习范围..."></textarea>
    <button class="btn-primary" id="btnSaveCourse" style="width:100%;margin-top:8px;">保存科目</button>
  `);
  document.getElementById('btnSaveCourse').onclick = () => {
    const name = document.getElementById('newCourseName').value.trim();
    const date = document.getElementById('newCourseDate').value;
    const note = document.getElementById('newCourseNote').value.trim();
    if (!name || !date) { alert('请填写名称和日期'); return; }
    appData.courses.push({ id: 'c_' + Date.now(), name, examDate: date, enabled: true, note });
    save(); renderCourses(); renderCourseManage(); renderAdvice(); closeModal();
  };
}

// ========== 问候语 & 桌宠 ==========
function updateGreeting() {
  const el = document.getElementById('greetingText');
  if(el) el.textContent = '🌙 夜色渐深' + (appData.settings.greeting ? '，' + appData.settings.greeting : '') + '，慢慢学';
}

function renderPet() {
  const w = document.getElementById('petWidget');
  const img = document.getElementById('petImg');
  if (!w || !img) return;
  
  if (!appData.pet.enabled || (!appData.pet.defaultImg && !appData.pet.focusImg)) {
    w.classList.remove('show');
    return;
  }
  w.classList.add('show');
  
  if (appData.pomodoro.running && appData.pet.focusImg) img.src = appData.pet.focusImg;
  else if (appData.pet.defaultImg) img.src = appData.pet.defaultImg;
}

// 桌宠拖拽逻辑
function initPetDrag() {
  const pet = document.getElementById('petWidget');
  if (!pet) return;
  
  if (appData.pet.position) {
    pet.style.left = appData.pet.position.left;
    pet.style.top = appData.pet.position.top;
    pet.style.right = 'auto';
    pet.style.bottom = 'auto';
  }

  let isDragging = false;
  let startX, startY, initialLeft, initialTop;

  pet.addEventListener('mousedown', (e) => {
    if(e.target.tagName === 'IMG' || e.target.classList.contains('pet-widget')) {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      
      const rect = pet.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      
      e.preventDefault(); 
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    
    let newLeft = initialLeft + dx;
    let newTop = initialTop + dy;
    
    const maxX = window.innerWidth - pet.offsetWidth;
    const maxY = window.innerHeight - pet.offsetHeight;
    newLeft = Math.max(0, Math.min(newLeft, maxX));
    newTop = Math.max(0, Math.min(newTop, maxY));
    
    pet.style.left = newLeft + 'px';
    pet.style.top = newTop + 'px';
    pet.style.right = 'auto';
    pet.style.bottom = 'auto';
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      appData.pet.position = { left: pet.style.left, top: pet.style.top };
      save();
    }
  });
}

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', () => {
  load();
  if (!appData.tasks) appData.tasks = [];
  if (!appData.records) appData.records = {};
  if (!appData.pet) appData.pet = { enabled: false, defaultImg: '', focusImg: '', position: null };
  if (!appData.settings) appData.settings = { greeting: '' };

  updateGreeting();
  updateClock();
  setInterval(updateClock, 1000);
  
  renderCourses();
  renderAdvice();
  renderTasks();
  renderPomodoro();
  renderPet();
  renderCharts();
  initPetDrag();

  document.querySelectorAll('.nav-tab').forEach(t => {
    t.onclick = () => switchView(t.dataset.view);
  });

  document.getElementById('btnReview').onclick = openReviewModal;
  document.getElementById('btnSettings').onclick = openSettingsModal;
  document.getElementById('btnAddCourseHome').onclick = openAddCourseModal;
  document.getElementById('btnAddCourseManage').onclick = openAddCourseModal;
  document.getElementById('btnQuickTask').onclick = () => {
    const box = document.getElementById('quickAddBox');
    box.style.display = box.style.display === 'none' ? 'flex' : 'none';
  };
  document.getElementById('btnAddTask').onclick = addTask;
  document.getElementById('gotoStats').onclick = () => switchView('stats');
  document.getElementById('homeStatsCard').onclick = () => switchView('stats');
  document.getElementById('calPrev').onclick = () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(); };
  document.getElementById('calNext').onclick = () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar(); };
  document.getElementById('modalClose').onclick = closeModal;
  document.getElementById('modalOverlay').onclick = (e) => { if (e.target.id === 'modalOverlay') closeModal(); };

  // 番茄钟相关
  document.getElementById('homePomCard').onclick = (e) => {
    if (e.target.tagName !== 'BUTTON') {
      document.getElementById('timerOverlay').classList.add('show');
      renderPomodoro();
    }
  };
  
  document.getElementById('timerCloseBtn').onclick = () => {
    document.getElementById('timerOverlay').classList.remove('show');
  };

  document.getElementById('timerToggleBtn').onclick = () => {
    if (appData.pomodoro.running) pauseTimer(); else startTimer();
  };
  
  document.querySelectorAll('.timer-mode-tab').forEach(tab => {
    tab.onclick = () => {
      if (appData.pomodoro.running) {
        if(!confirm('正在计时中，切换模式将重新计时，确定吗？')) return;
      }
      resetTimer();
      appData.pomodoro.mode = tab.dataset.mode;
      appData.pomodoro.current = appData.pomodoro.mode === 'countdown' ? appData.pomodoro.target : 0;
      renderPomodoro();
    };
  });

  document.getElementById('timerMinus').onclick = () => {
    const p = appData.pomodoro;
    if (p.running || p.mode !== 'countdown') return;
    p.target = Math.max(60, p.target - 300); 
    p.current = p.target;
    renderPomodoro();
  };
  document.getElementById('timerPlus').onclick = () => {
    const p = appData.pomodoro;
    if (p.running || p.mode !== 'countdown') return;
    p.target += 300; 
    p.current = p.target;
    renderPomodoro();
  };

  document.getElementById('pomStart').onclick = (e) => {
    e.stopPropagation();
    if (appData.pomodoro.running) pauseTimer(); else startTimer();
  };
  document.getElementById('pomReset').onclick = (e) => {
    e.stopPropagation();
    resetTimer();
  };
});
// 你之前的代码全部保留，只需在文件最末尾加上下面这段：

// ✅ 全局暴露打开全屏的方法，供 HTML 直接调用
window.openTimerOverlay = function() {
  const overlay = document.getElementById('timerOverlay');
  if (overlay) {
    overlay.classList.add('show');
    renderPomodoro(); // 每次打开时强制同步一次最新时间
  }
};