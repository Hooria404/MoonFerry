// ========== 数据层 ==========
const STORAGE_KEY = 'studyroom_data_v1';
const SCHEMA_VERSION = 2;

const defaultCourses = [
  { id: 'aidm7320', name: 'AIDM7320 传播学基础', examDate: '2026-12-04', examTime: '', format: '半开卷', chapters: '', enabled: true, note: '两张a4或者一张a3，半开卷考试，12月20日交final项目。' },
  { id: 'aidm7360', name: 'AIDM7360 大数据管理', examDate: '2026-12-09', examTime: '', format: '半开卷', chapters: '', enabled: true, note: '一张A4 cheat sheet' },
  { id: 'aidm7390', name: 'AIDM7390 数据挖掘', examDate: '2026-12-18', examTime: '', format: '半开卷', chapters: '', enabled: true, note: '一张A4 cheat sheet' },
  { id: 'aidm7330', name: 'AIDM7330 编程与数据科学', examDate: '2026-12-13', examTime: '', format: 'Take-home', chapters: '', enabled: true, note: 'Takehome考试。' },
  { id: 'comm7020', name: 'COMM7020 传播研究方法', examDate: '2026-12-17', examTime: '', format: '闭卷', chapters: '', enabled: true, note: '闭卷考试。' }
];

// 兼容旧数据：补齐编辑字段
function normalizeCourses() {
  if (!Array.isArray(appData.courses)) appData.courses = [];
  appData.courses.forEach((c, i) => {
    if (!c.id) c.id = 'c_' + Date.now() + '_' + i;
    if (typeof c.name !== 'string') c.name = '未命名科目';
    if (typeof c.examDate !== 'string') c.examDate = '';
    if (typeof c.examTime !== 'string') c.examTime = '';
    if (typeof c.format !== 'string') c.format = '';
    if (typeof c.chapters !== 'string') c.chapters = '';
    if (typeof c.note !== 'string') c.note = '';
    if (typeof c.enabled !== 'boolean') c.enabled = true;
  });
}

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
let ballInterval = null;
let toastTimer = null;
let chartRing = null, chartBar = null, chartTrend = null;
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();

// ========== 工具函数 ==========
// 统一按“本地日期”生成 key（不要用 toISOString，那是 UTC，凌晨会被算到前一天）
function dateKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function getTodayStr() {
  return dateKey(new Date());
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

// 轻提示 toast
function showToast(msg) {
  let t = document.getElementById('appToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'appToast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  void t.offsetWidth; // 触发 reflow，保证 transition 生效
  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
}

function ensureRecord(dateStr) {
  if (!appData.records[dateStr]) {
    appData.records[dateStr] = { review: '', tasks: [], pom: 0 };
  }
  return appData.records[dateStr];
}

function getTodayTasks() {
  return appData.tasks.filter(task => (task.date || getTodayStr()) === getTodayStr());
}

function getRecordFocus(dateStr) {
  const record = appData.records[dateStr];
  return record ? Math.max(0, Number(record.pom) || 0) : 0;
}

// 统一的“某天是否学习”判断（单一数据源）
function isStudiedOnDate(dateStr) {
  if (getRecordFocus(dateStr) > 0) return true;
  return appData.tasks.some(t => t.date === dateStr && t.done);
}

function getLearningStreak() {
  let streak = 0;
  const date = new Date();
  if (!isStudiedOnDate(getTodayStr())) date.setDate(date.getDate() - 1);
  while (true) {
    const key = date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0');
    if (!isStudiedOnDate(key)) break;
    streak++;
    date.setDate(date.getDate() - 1);
  }
  return streak;
}

function renderDashboardMetrics() {
  const tasks = getTodayTasks();
  const done = tasks.filter(t => t.done).length;
  const focus = getRecordFocus(getTodayStr());
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  set('todayFocusMetric', focus + ' 分钟');
  set('todayTaskMetric', done + '/' + tasks.length);
  set('streakMetric', getLearningStreak() + ' 天');
  set('focusEncouragement', focus >= 60 ? '今天已经很棒了' : focus > 0 ? '专注正在发生' : '每一分钟都算数');
  set('taskEncouragement', tasks.length ? (done === tasks.length ? '今天的清单完成啦' : '一步一步来就好') : '写下今天的一件小事');
  const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
  set('taskProgressLabel', '今日进度 ' + pct + '%');
  set('taskProgressCount', done + '/' + tasks.length + ' 项');
  const fill = document.getElementById('taskProgressFill');
  if (fill) fill.style.width = pct + '%';
}

function formatTime(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return m + ':' + s;
}

// ========== 存储 ==========
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
  } catch (error) {
    console.error('保存失败：浏览器本地存储空间可能不足。', error);
    alert('暂时无法保存数据，请导出备份或清理浏览器存储空间后重试。');
  }
}

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try { 
      const parsed = JSON.parse(raw); 
      appData = Object.assign(appData, parsed);
      
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
      if(!appData.settings) appData.settings = { greeting: '' };
      if(!Array.isArray(appData.tasks)) appData.tasks = [];
      if(!Array.isArray(appData.focusSessions)) appData.focusSessions = [];
      
      appData.tasks.forEach((task, index) => {
        if (!task.id) task.id = 'task_' + Date.now() + '_' + index;
        if (!task.date) task.date = getTodayStr();
        if (typeof task.done !== 'boolean') task.done = false;
        if (!Number.isFinite(Number(task.min))) task.min = 30;
      });
      if (appData.pomodoro && appData.pomodoro.running) appData.pomodoro.running = false;
    } catch(e) { console.warn('数据读取失败'); }
  } else {
    if(!Array.isArray(appData.focusSessions)) appData.focusSessions = [];
  }
  normalizeCourses();
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
// 章节文本压成一行，用于列表缩略展示
function shortChapters(text, max) {
  if (!text) return '';
  const oneLine = String(text).replace(/\s*\n+\s*/g, ' / ').trim();
  const limit = max || 30;
  return oneLine.length > limit ? oneLine.slice(0, limit) + '…' : oneLine;
}

function courseMetaLine(c, withDays) {
  const days = daysUntil(c.examDate);
  const parts = [];
  if (c.examDate) parts.push('📅 ' + c.examDate);
  if (c.examTime) parts.push('🕐 ' + c.examTime);
  if (withDays !== false) parts.push(days > 0 ? days + ' 天后' : (days === 0 ? '今天考试' : '已结束'));
  return parts.join(' · ');
}

function courseTagsHtml(c, chapterLimit) {
  const tags = [];
  if (c.format) tags.push(`<span class="fmt-badge">${escapeHtml(c.format)}</span>`);
  if (c.chapters) tags.push(`<span class="chapter-chip">范围：${escapeHtml(shortChapters(c.chapters, chapterLimit || 30))}</span>`);
  return tags.length ? `<div class="course-tags">${tags.join('')}</div>` : '';
}

function renderCourses() {
  const grid = document.getElementById('courseGrid');
  if(!grid) return;
  const enabled = appData.courses.filter(c => c.enabled).sort((a,b) => daysUntil(a.examDate) - daysUntil(b.examDate));

  if (enabled.length === 0) {
    grid.innerHTML = `<div class="empty-hint"><p>还没有启用的科目，点击右上角添加</p></div>`;
    return;
  }

  grid.innerHTML = enabled.map(c => {
    const days = daysUntil(c.examDate);
    const countdown = c.examDate ? (days > 0 ? days + ' 天' : '已结束') : '待定';
    return `<div class="course-item" data-id="${c.id}" title="点击查看并编辑">
      <div class="course-item-head">
        <input type="checkbox" class="cb-enable" data-id="${c.id}" checked style="accent-color:var(--primary);">
        <span class="course-name">${escapeHtml(c.name)}</span>
      </div>
      <div class="course-countdown">${countdown}</div>
      <div class="course-date">📅 ${c.examDate}${c.examTime ? ' · ' + escapeHtml(c.examTime) : ''}</div>
      ${courseTagsHtml(c, 20)}
    </div>`;
  }).join('');

  document.querySelectorAll('.cb-enable').forEach(cb => {
    cb.onchange = (e) => {
      e.stopPropagation();
      const c = appData.courses.find(x => x.id === cb.dataset.id);
      if (c) c.enabled = cb.checked;
      save(); renderCourses(); updateProgress(); renderCharts(); renderAdvice(); renderPlan(); renderCourseManage();
    };
    cb.onclick = (e) => e.stopPropagation();
  });

  document.querySelectorAll('#courseGrid .course-item').forEach(item => {
    item.onclick = (e) => {
      if (e.target.closest('input')) return;
      openCourseDetail(item.dataset.id);
    };
  });

  updateProgress();
}

function updateProgress() {
  const enabled = appData.courses.filter(c => c.enabled);
  const done = enabled.filter(c => daysUntil(c.examDate) <= 0).length;
  const pct = enabled.length ? Math.round(done / enabled.length * 100) : 0;
  const el = document.getElementById('totalProgress');
  if(el) el.textContent = '已完成考试 ' + pct + '%';
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
    <div class="course-item" style="margin-bottom:12px; cursor:pointer;" data-plan-id="${c.id}">
      <div class="course-item-head" style="justify-content:space-between;">
        <span class="course-name">${escapeHtml(c.name)}</span>
        <span class="course-actions">
          <span style="color:var(--primary);font-size:13px;">${daysUntil(c.examDate) > 0 ? daysUntil(c.examDate) + ' 天后' : (daysUntil(c.examDate) === 0 ? '今天考试' : '考试已结束')}</span>
          <button class="btn-chip btn-plan-edit" data-id="${c.id}">✎ 编辑</button>
        </span>
      </div>
      <div class="course-date" style="margin-top:4px;">${courseMetaLine(c, false)}</div>
      ${courseTagsHtml(c, 60)}
      ${c.note ? `<div style="font-size:13px;color:var(--text-light);margin-top:8px;white-space:pre-line;">${escapeHtml(c.note)}</div>` : ''}
    </div>
  `).join('');

  list.querySelectorAll('.btn-plan-edit').forEach(btn => {
    btn.onclick = (e) => { e.stopPropagation(); openCourseFormModal(btn.dataset.id); };
  });
  list.querySelectorAll('[data-plan-id]').forEach(item => {
    item.onclick = (e) => { if (!e.target.closest('button')) openCourseDetail(item.dataset.planId); };
  });
}

function refreshCourseViews() {
  renderCourses();
  renderCourseManage();
  renderAdvice();
  renderPlan();
  renderCalendar();
  updateProgress();
}

function renderCourseManage() {
  const list = document.getElementById('courseManageList');
  if(!list) return;
  if(appData.courses.length === 0) { list.innerHTML = `<p style="color:var(--text-light);font-size:14px;">暂无科目</p>`; return; }
  list.innerHTML = `<div class="manage-hint">点一下整行、或点右侧「✎ 编辑」，就能改日期、时间、考试形式、章节范围等全部内容。</div>` +
  appData.courses.map(c => {
    return `<div class="course-item course-row" data-id="${c.id}">
      <div class="course-item-head">
        <input type="checkbox" class="cb-manage" data-id="${c.id}" ${c.enabled ? 'checked' : ''} aria-label="是否启用该科目" style="accent-color:var(--primary);cursor:pointer;">
        <div class="course-main">
          <div class="course-name">${escapeHtml(c.name)}</div>
          <div class="course-date">${courseMetaLine(c)}</div>
          ${courseTagsHtml(c, 36)}
        </div>
        <div class="course-actions">
          <button class="btn-chip btn-edit" data-id="${c.id}">✎ 编辑</button>
          <button class="btn-chip ghost btn-del" data-id="${c.id}">删除</button>
        </div>
      </div>
    </div>`;
  }).join('');

  const rows = list.querySelectorAll('.course-row');
  rows.forEach(row => {
    row.onclick = (e) => {
      if (e.target.closest('button') || e.target.closest('input')) return;
      openCourseFormModal(row.dataset.id);
    };
  });

  list.querySelectorAll('.cb-manage').forEach(cb => {
    cb.onclick = (e) => e.stopPropagation();
    cb.onchange = () => {
      const c = appData.courses.find(x => x.id === cb.dataset.id);
      if (c) c.enabled = cb.checked;
      save(); renderCourses(); renderAdvice(); renderPlan(); renderCourseManage(); updateProgress();
    };
  });

  list.querySelectorAll('.btn-edit').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      openCourseFormModal(btn.dataset.id);
    };
  });

  list.querySelectorAll('.btn-del').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      if(confirm('确定删除该科目吗？')) {
        appData.courses = appData.courses.filter(c => c.id !== btn.dataset.id);
        save(); renderCourses(); renderCourseManage(); renderAdvice(); renderPlan(); renderCalendar(); updateProgress();
        showToast('科目已删除');
      }
    };
  });
}

// ========== 任务 ==========
function renderTasks() {
  const list = document.getElementById('taskList');
  if (!list) return;
  const tasks = getTodayTasks();
  if (tasks.length === 0) {
    list.innerHTML = '<div class="empty-hint small task-empty"><span>🌿</span><p>今天还没有安排任务</p><small>先写下一件想完成的小事吧，不必给自己太大压力。</small></div>';
  } else {
    list.innerHTML = tasks.map(t => `
      <div class="task-item ${t.done ? 'done' : ''}" data-id="${escapeHtml(t.id)}">
        <input type="checkbox" data-id="${escapeHtml(t.id)}" ${t.done ? 'checked' : ''} class="task-cb" aria-label="完成任务">
        <span class="task-text">${escapeHtml(t.title)}</span>
        <span class="task-min">${Math.max(1, Number(t.min) || 30)} min</span>
        <button class="task-delete" data-id="${escapeHtml(t.id)}" aria-label="删除任务" title="删除任务">×</button>
      </div>
    `).join('');
  }

  list.querySelectorAll('.task-cb').forEach(cb => {
    cb.onchange = () => {
      const task = appData.tasks.find(t => t.id === cb.dataset.id);
      if (!task) return;
      task.done = cb.checked;
      save();
      renderTasks();
      renderDashboardMetrics();
      renderCharts();
      renderCalendar();
      renderHeatmap();
    };
  });
  list.querySelectorAll('.task-delete').forEach(btn => {
    btn.onclick = () => {
      const task = appData.tasks.find(t => t.id === btn.dataset.id);
      if (!task) return;
      if (!confirm('要从今天的清单中移除这项任务吗？')) return;
      appData.tasks = appData.tasks.filter(t => t.id !== task.id);
      save();
      renderTasks();
      renderDashboardMetrics();
      renderCharts();
    };
  });
  renderDashboardMetrics();
}

function addTask() {
  const titleEl = document.getElementById('taskInput');
  const minEl = document.getElementById('taskMin');
  if (!titleEl || !minEl) return;
  const title = titleEl.value.trim();
  const min = Math.max(1, Math.min(1440, parseInt(minEl.value, 10) || 30));
  if (!title) {
    titleEl.focus();
    return;
  }
  appData.tasks.push({ id: 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), title, min, done: false, date: getTodayStr() });
  titleEl.value = '';
  minEl.value = '30';
  save();
  renderTasks();
  renderCharts();
  titleEl.focus();
}

// ========== 专注计时与历史记录 ==========

function updatePomodoroDigits() {
  const p = appData.pomodoro;
  const timeStr = formatTime(Math.max(0, p.current));

  const homeTime = document.getElementById('pomTime');
  const bigTime = document.getElementById('timerBigTime');
  const petClock = document.getElementById('petClock');

  if (homeTime) homeTime.textContent = timeStr;
  if (bigTime) bigTime.textContent = timeStr;
  if (petClock) petClock.textContent = timeStr;
}

function renderPomodoro() {
  const p = appData.pomodoro;

  updatePomodoroDigits();

  const homeStatus = document.getElementById('pomStatus');
  const homeBtn = document.getElementById('pomStart');

  if (homeStatus) {
    homeStatus.textContent = p.running
      ? '正在专注…'
      : (p.sessionSeconds > 0 ? '本次已暂停' : '准备就绪');
  }

  if (homeBtn) {
    homeBtn.textContent = p.running
      ? '暂停一下'
      : (p.sessionSeconds > 0 ? '继续专注' : '开始专注');
  }

  const toggleBtn = document.getElementById('timerToggleBtn');

  if (toggleBtn) {
    toggleBtn.textContent = p.running
      ? '暂停'
      : (p.sessionSeconds > 0 ? '继续专注' : '开始专注');
  }

  document.querySelectorAll('.timer-mode-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.mode === p.mode);
  });

  const finishBtn = document.getElementById('timerFinishBtn');
  if (finishBtn) {
    finishBtn.disabled = false;
    finishBtn.textContent = '结束本次专注';
  }

  const resetBtn = document.getElementById('timerResetBtn');
  if (resetBtn) {
    resetBtn.disabled = p.running;
  }

  const minusBtn = document.getElementById('timerMinus');
  const plusBtn = document.getElementById('timerPlus');
  if (minusBtn) minusBtn.disabled = p.running || p.mode !== 'countdown';
  if (plusBtn) plusBtn.disabled = p.running || p.mode !== 'countdown';

  const petClock = document.getElementById('petClock');
  if (petClock) {
    petClock.style.display = p.running ? 'block' : 'none';
  }

  renderFocusHistory();
  renderPet();
}


// ========== 专注计时控制 ==========

function stopFocusIntervals() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (ballInterval) {
    clearInterval(ballInterval);
    ballInterval = null;
  }
}

function syncFocusElapsed(now = Date.now()) {
  const p = appData.pomodoro;

  if (!p.running || !p.lastTick) return 0;

  const elapsed = Math.floor((now - p.lastTick) / 1000);

  if (elapsed <= 0) return 0;

  p.lastTick += elapsed * 1000;
  p.sessionSeconds = (Number(p.sessionSeconds) || 0) + elapsed;

  if (p.mode === 'countdown') {
    p.current = Math.max(0, p.current - elapsed);
  } else {
    p.current += elapsed;
  }

  return elapsed;
}

// 全屏大概能堆下多少颗球（按面积与堆积率估算）
function ballCapacity() {
  const w = ballW || window.innerWidth || 1200;
  const h = ballH || window.innerHeight || 800;
  const avgR = 46;                       // 大球 46~64 / 小球 26~36，加权约 46
  const ballArea = Math.PI * avgR * avgR;
  return Math.max(24, Math.floor((w * h * 0.60) / ballArea));
}

// 按屏幕容量反推生成间隔，保证 2.5 小时（9000000ms）左右铺满整屏
function ballPaceMs() {
  return Math.min(60000, Math.max(2500, Math.round(9000000 / ballCapacity())));
}

function startTimer() {
  const p = appData.pomodoro;

  if (p.running) return;

  if (p.mode === 'countdown' && p.current <= 0) {
    p.current = p.target;
  }

  let freshStart = false;
  if (!p.sessionStartedAt) {
    p.sessionStartedAt = new Date().toISOString();
    resetBallPile();
    freshStart = true;
  }

  p.running = true;
  p.lastTick = Date.now();

  stopFocusIntervals();
  save();

  // 新的一次专注才落开场球，暂停后继续不会凭空多出几颗
  if (freshStart) spawnBallBurst(3, 550);

  ballInterval = setInterval(() => {
    if (appData.pomodoro.running) {
      createFallingBall();
    }
  }, ballPaceMs());

  timerInterval = setInterval(() => {
    if (!p.running) return;

    const elapsed = syncFocusElapsed();

    if (elapsed > 0) {
      updatePomodoroDigits();
      save();
    }

    if (p.mode === 'countdown' && p.current <= 0) {
      p.current = 0;
      p.running = false;
      p.lastTick = null;

      stopFocusIntervals();
      saveFocusSession('completed');

      p.current = p.target;

      save();
      renderPomodoro();
      renderCharts();

      alert('本次专注已完成。');
    }
  }, 250);

  renderPomodoro();
}

function pauseTimer() {
  const p = appData.pomodoro;
  if (!p.running) return;

  syncFocusElapsed();

  p.running = false;
  p.lastTick = null;

  stopFocusIntervals();
  save();

  const toggleBtn = document.getElementById('timerToggleBtn');
  if (toggleBtn) toggleBtn.textContent = '继续专注';

  const homeBtn = document.getElementById('pomStart');
  if (homeBtn) homeBtn.textContent = '继续专注';

  renderPomodoro();
}

function finishTimer() {
  const p = appData.pomodoro;

  if (p.running) {
    syncFocusElapsed();
  }

  p.running = false;
  p.lastTick = null;
  stopFocusIntervals();

  const seconds = Number(p.sessionSeconds) || 0;

  if (seconds > 0) {
    saveFocusSession('finished');
  } else {
    p.sessionSeconds = 0;
    p.sessionStartedAt = null;
  }

  p.current = p.mode === 'countdown' ? p.target : 0;

  save();
  renderPomodoro();
  renderCharts();

  alert(
    seconds > 0
      ? '本次专注已结束，记录已保存。辛苦啦！'
      : '本次专注已结束，还没有产生有效专注记录。'
  );
}

function resetTimer() {
  const p = appData.pomodoro;

  if (p.running) {
    alert('请先暂停，再重置计时。');
    return;
  }

  if (
    (Number(p.sessionSeconds) || 0) > 0 &&
    !confirm('重置会清空本次尚未保存的专注进度，不会写入历史记录。确定重置吗？')
  ) {
    return;
  }

  stopFocusIntervals();

  p.running = false;
  p.lastTick = null;
  p.sessionSeconds = 0;
  p.sessionStartedAt = null;

  p.current = p.mode === 'countdown' ? p.target : 0;

  resetBallPile();

  save();
  renderPomodoro();
}

function saveFocusSession(status) {
  const p = appData.pomodoro;
  const seconds = Math.max(0, Number(p.sessionSeconds) || 0);
  if (seconds > 0) {
    const started = p.sessionStartedAt || new Date(Date.now() - seconds * 1000).toISOString();
    const ended = new Date().toISOString();
    const startDateKey = dateKey(new Date(started));
    appData.focusSessions.unshift({ id: 'focus_' + Date.now(), date: startDateKey, startedAt: started, endedAt: ended, seconds, minutes: Math.floor(seconds / 60), mode: p.mode, status });
    appData.focusSessions = appData.focusSessions.slice(0, 200);
    const rec = ensureRecord(startDateKey);
    rec.pom = (rec.pom || 0) + Math.floor(seconds / 60);
  }
  p.sessionSeconds = 0;
  p.sessionStartedAt = null;
  p.running = false;
  p.lastTick = null;
  save();
  renderDashboardMetrics();
  renderTrend();
  renderCalendar();
  renderHeatmap();
}

function renderFocusHistory() {
  const list = document.getElementById('focusHistoryList');
  const totalEl = document.getElementById('focusHistoryTotal');
  if (!list || !totalEl) return;
  const sessions = appData.focusSessions || [];
  const totalSeconds = sessions.reduce((sum, item) => sum + (Number(item.seconds) || (Number(item.minutes) || 0) * 60), 0);
  totalEl.textContent = '累计 ' + Math.floor(totalSeconds / 60) + ' 分钟';
  if (!sessions.length) {
    list.innerHTML = '<div class="focus-history-empty">每一次认真投入，都会被好好记下来。</div>';
    return;
  }
  list.innerHTML = sessions.slice(0, 8).map(item => {
    const start = new Date(item.startedAt);
    const dateText = start.toLocaleDateString('zh-CN', { month:'2-digit', day:'2-digit' });
    const timeText = start.toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' });
    const mins = Math.floor((Number(item.seconds) || (Number(item.minutes)||0)*60) / 60);
    const statusText = item.status === 'completed' ? '目标完成' : '主动结束';
    const durationText = mins > 0 ? (mins >= 60 ? Math.floor(mins/60) + '小时' + (mins%60 ? mins%60 + '分' : '') : mins + ' 分钟') : Math.max(1, Math.floor((Number(item.seconds)||0))) + ' 秒';
    return `<div class="focus-history-item"><span class="focus-history-dot"></span><div class="focus-history-main"><strong>${dateText} · ${timeText}</strong><small>${statusText}</small></div><b>${durationText}</b></div>`;
  }).join('');
}

// ========== 专注小球：Canvas 果冻球 ==========
// 一颗颗从顶部受重力落下，落到球堆上时先往低处滑一点，再压扁回弹坐稳。
// 落点按真实圆的位置算，所以不会悬空、不会重叠，大球小球自然填缝，约 2.5 小时铺满整屏。
const BALL_COLORS = ['#c9836b', '#b96a52', '#d9a68e', '#e7c5b0', '#a95740', '#cf9078', '#dfb49e', '#c1795f'];

let ballsCanvas = null;
let ballsCtx = null;
let ballW = 0;
let ballH = 0;
let balls = [];
let ballRaf = null;
let ballTimer = null;
let ballGuard = null;
let ballLastTick = 0;
let ballsAwake = 0;

function ballLayer() {
  const bg = document.getElementById('ballsBg');
  if (!bg) return null;

  if (!ballsCanvas || !ballsCanvas.isConnected) {
    ballsCanvas = bg.querySelector('#ballsCanvas');
    if (!ballsCanvas) {
      ballsCanvas = document.createElement('canvas');
      ballsCanvas.id = 'ballsCanvas';
      bg.insertBefore(ballsCanvas, bg.firstChild);
    }
    ballsCtx = ballsCanvas.getContext('2d');
  }
  return ballsCanvas;
}

function sizeBallCanvas() {
  const c = ballLayer();
  if (!c || !ballsCtx) return false;

  const w = c.clientWidth;
  const h = c.clientHeight;
  if (!w || !h) return false;

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);

  if (c.width !== pw || c.height !== ph) {
    c.width = pw;
    c.height = ph;
  }
  ballsCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ballW = w;
  ballH = h;
  return true;
}

function stopBallLoop() {
  if (ballRaf) { cancelAnimationFrame(ballRaf); ballRaf = null; }
  if (ballTimer) { clearInterval(ballTimer); ballTimer = null; }
  if (ballGuard) { clearInterval(ballGuard); ballGuard = null; }
}

function resetBallPile() {
  balls.length = 0;
  ballsAwake = 0;
  stopBallLoop();
  if (ballsCtx && ballW && ballH) {
    ballsCtx.clearRect(0, 0, ballW, ballH);
  }
}

function wakeBall(b) {
  b.landed = false;
  b.vy = Math.max(20, b.vy || 0);
}

// 在 x 处竖直落球：算出停在哪，以及这个落点是不是稳的
function restInfoAt(x, r) {
  let rest = ballH - r;
  const contacts = [];

  for (let i = 0; i < balls.length; i++) {
    const o = balls[i];
    if (!o.landed) continue;

    const dx = Math.abs(x - o.x);
    const sum = r + o.r;
    if (dx >= sum) continue;

    const y = o.y - Math.sqrt(sum * sum - dx * dx);
    if (y < rest - 1.5) {
      rest = y;
      contacts.length = 0;
      contacts.push({ dx: dx, sum: sum });
    } else if (y < rest + 1.5) {
      contacts.push({ dx: dx, sum: sum });
    }
  }

  // 坐在两块球中间（谷里）、或者已经压到地上，才算稳
  let solid = rest > ballH - r - 4;

  if (!solid && contacts.length) {
    if (contacts.length >= 2) {
      solid = true;
    } else {
      const ratio = contacts[0].dx / contacts[0].sum;
      solid = ratio > 0.28;   // 只有正正压在别人头顶才是不稳的
    }
  }

  return { y: rest, solid: solid };
}

function restYAt(x, r) {
  return restInfoAt(x, r).y;
}

// 在整屏宽度里找最空（堆得最低）又能坐稳的位置，让球像倒进去一样先填低处
function pickLanding(x, r) {
  let best = null;

  for (let i = 0; i < 40; i++) {
    const tx = Math.min(Math.max(r + 2, ballW * (i + Math.random()) / 40), Math.max(r, ballW - r - 2));
    const info = restInfoAt(tx, r);
    if (!info.solid) continue;
    if (!best || info.y > best.y) best = { x: tx, y: info.y, solid: true };
  }

  if (!best) {
    const info = restInfoAt(x, r);
    best = { x: x, y: info.y, solid: info.solid };
  }

  return best;
}

function createFallingBall() {
  const overlay = document.getElementById('timerOverlay');
  if (!overlay || !overlay.classList.contains('show')) return;

  sizeBallCanvas();
  if (!ballW || !ballH) return;

  const big = Math.random() < 0.62;
  const r = big ? 46 + Math.random() * 18 : 26 + Math.random() * 10;
  const seedX = r + 8 + Math.random() * Math.max(1, ballW - (r + 8) * 2);
  const spot = pickLanding(seedX, r);

  // 球数到顶、或者整屏都堆到顶了，就不再生成
  if (balls.length >= ballCapacity()) return;

  const top = balls.reduce(function (m, b) { return Math.min(m, b.y - b.r); }, ballH);
  if (top < r * 1.2) return;

  balls.push({
    x: spot.x,
    y: -r - 14 - Math.random() * 54,
    vx: 0,
    vy: 30 + Math.random() * 40,
    r: r,
    color: BALL_COLORS[Math.floor(Math.random() * BALL_COLORS.length)],
    def: 0,
    dv: 0,
    landed: false,
    tx: spot.x,
    ty: spot.y,
    rollDir: 0
  });

  startBallLoop();
}

function spawnBallBurst(count, gap) {
  for (let i = 0; i < count; i++) {
    setTimeout(createFallingBall, i * (gap || 240));
  }
}

function stepBalls(dt) {
  let awake = 0;

  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];

    // 压扁→回弹，收尾会轻微过冲，像果冻
    b.dv += (-150 * b.def - 18 * b.dv) * dt;
    b.def += b.dv * dt;
    if (b.def > 0.34) { b.def = 0.34; b.dv = 0; }
    if (b.def < -0.14) { b.def = -0.14; b.dv = 0; }

    if (b.landed) {
      if (Math.abs(b.def) > 0.004 || Math.abs(b.dv) > 0.01) awake++;
      continue;
    }

    awake++;
    b.vy = Math.min(1500, b.vy + 900 * dt);
    b.y += b.vy * dt;

    // 下落途中慢慢横移到落点，看起来像滚进缝隙
    const k = Math.min(0.4, dt * 14);
    b.x += (b.tx - b.x) * k;

    if (b.x < b.r) b.x = b.r;
    else if (b.x > ballW - b.r) b.x = ballW - b.r;

    // 每帧跟着下面的球堆刷新落点，别停在过时的位置
    const info = restInfoAt(b.x, b.r);
    b.ty = info.y;

    if (b.y >= b.ty) {
      // 只搭到别人侧边一点，就继续顺着肩膀往低处滚
      if (!info.solid) {
        if (b.rollDir === 0) {
          let left = 0, right = 0;
          for (let j = 0; j < balls.length; j++) {
            const o = balls[j];
            if (!o.landed) continue;
            if (Math.abs(o.x - b.x) > b.r + o.r) continue;
            const dx = o.x - b.x;
            const y = o.y - o.r;
            if (dx < 0) left = Math.min(left || 9e9, y);
            else right = Math.min(right || 9e9, y);
          }
          b.rollDir = (right <= left) ? 1 : -1;   // 往堆得低的一侧滚
        }
        b.x += b.rollDir * 70 * dt;
        b.y = b.ty - 2;
        if (b.x <= b.r + 1 || b.x >= ballW - b.r - 1) b.rollDir = -b.rollDir;
        b.y += b.vy * dt;
        continue;
      }

      const impact = b.vy;
      b.y = b.ty;
      b.vy = 0;
      b.vx = 0;
      b.landed = true;
      b.def = Math.min(0.32, 0.05 + impact / 1600);
      b.dv = 0;

      // 砸到旁边停稳的球，让它轻轻抖一下
      const wobble = Math.min(0.16, impact / 4200);
      if (wobble > 0.01) {
        for (let j = 0; j < balls.length; j++) {
          const o = balls[j];
          if (!o.landed || o === b) continue;
          if (Math.abs(o.x - b.x) > o.r + b.r) continue;
          if (Math.abs(o.y - b.y) > o.r + b.r) continue;
          if (wobble > o.def) { o.def = wobble; o.dv = 0.05; }
          awake++;
        }
      }
    }
  }

  ballsAwake = awake;
}

function drawBalls() {
  if (!ballsCtx || !ballW || !ballH) return;

  ballsCtx.clearRect(0, 0, ballW, ballH);

  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    const stretch = b.landed ? 0 : Math.min(0.14, Math.abs(b.vy) / 2600);
    const sy = (1 - b.def) * (1 + stretch);
    const sx = (1 + b.def * 0.86) * (1 - stretch * 0.5);

    ballsCtx.save();
    // 缩放时把底部固定住，压扁才不会浮起来
    ballsCtx.translate(b.x, b.y + b.r - b.r * sy);
    ballsCtx.scale(sx, sy);
    ballsCtx.beginPath();
    ballsCtx.arc(0, 0, b.r, 0, Math.PI * 2);
    ballsCtx.fillStyle = b.color;
    ballsCtx.fill();
    ballsCtx.restore();
  }
}

function ballTick(now) {
  if (!ballW || !ballH) return;

  const raw = (now - ballLastTick) / 1000;
  const dt = Math.min(0.05, Math.max(0.004, raw || 0.016));
  ballLastTick = now;

  stepBalls(dt);
  drawBalls();

  if (ballsAwake === 0) stopBallLoop();
}

function startBallLoop() {
  if (!balls.length) return;

  ballLastTick = performance.now();
  ballsAwake = Math.max(ballsAwake, 1);

  if (!ballRaf && !ballTimer) {
    const frame = function (now) {
      ballRaf = null;
      ballTick(now);
      if (ballsAwake > 0 && !ballTimer) ballRaf = requestAnimationFrame(frame);
    };
    ballRaf = requestAnimationFrame(frame);
  }

  // 有些环境会暂停逐帧回调（省电模式、减少动态效果等），退回定时器驱动兜底
  if (!ballGuard) {
    ballGuard = setInterval(function () {
      if (ballsAwake === 0) return;
      if (performance.now() - ballLastTick < 200) return;
      if (ballRaf) { cancelAnimationFrame(ballRaf); ballRaf = null; }
      if (!ballTimer) ballTimer = setInterval(function () { ballTick(performance.now()); }, 16);
    }, 320);
  }
}

// 打开界面 / 窗口尺寸变化：重新量画布，把已经堆好的球按新尺寸落一遍
function refreshBallLayer() {
  if (!sizeBallCanvas()) return;

  const settled = balls.filter(function (b) { return b.landed; });
  // 从最底下那颗开始重放，新的尺寸下才能一层层重新堆回去
  settled.sort(function (p, q) { return q.y - p.y; });

  const falling = balls.filter(function (b) { return !b.landed; });
  balls = falling;

  settled.forEach(function (b) {
    b.landed = false;
    b.x = Math.min(Math.max(b.r, b.x), Math.max(b.r, ballW - b.r));
    const spot = pickLanding(b.x, b.r);
    b.x = spot.x;
    b.y = spot.y;
    b.tx = spot.x;
    b.ty = spot.y;
    b.rollDir = 0;
    b.landed = true;
    b.def = 0;
    b.dv = 0;
    balls.push(b);
  });

  drawBalls();
  const overlay = document.getElementById('timerOverlay');
  if (balls.length && overlay && overlay.classList.contains('show')) startBallLoop();
}

window.addEventListener('resize', function () {
  if (balls.length) refreshBallLayer();
});

window.resetBallPile = resetBallPile;
window.refreshBallLayer = refreshBallLayer;

// ========== 图表 ==========
function chartBaseOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 350 },
    plugins: {
      legend: { labels: { color: '#8b7355', usePointStyle: true, boxWidth: 8, padding: 16, font: { family: '-apple-system, PingFang SC, Microsoft YaHei, sans-serif', size: 11 } } },
      tooltip: { backgroundColor: '#4a3728', titleColor: '#fffdf9', bodyColor: '#fffdf9', padding: 10, cornerRadius: 10 }
    }
  };
}

function upsertChart(existing, canvas, config) {
  if (!canvas || typeof Chart === 'undefined') return existing;
  if (existing) {
    existing.data = config.data;
    existing.options = config.options;
    existing.update('none');
    return existing;
  }
  return new Chart(canvas.getContext('2d'), config);
}

function renderCharts() {
  if (typeof Chart === 'undefined') return;
  const tasks = getTodayTasks();
  const done = tasks.filter(t => t.done).length;
  const total = tasks.length;
  const ringCanvas = document.getElementById('chartRing');
  const barCanvasPre = document.getElementById('chartBar');
  // 首页不可见时不初始化，避免图表按 0 尺寸创建
  if (!ringCanvas && !barCanvasPre) return;
  if (ringCanvas && ringCanvas.clientWidth === 0) return;
  if (ringCanvas) {
    const opts = chartBaseOptions();
    opts.cutout = '72%';
    opts.plugins.legend.position = 'bottom';
    opts.plugins.title = { display: true, text: total ? '今日任务完成情况' : '今天的任务还未开始', color: '#4a3728', font: { size: 13, weight: '500' }, padding: { bottom: 12 } };
    chartRing = upsertChart(chartRing, ringCanvas, {
      type: 'doughnut',
      data: { labels: total ? ['已完成', '待完成'] : ['暂无任务'], datasets: [{ data: total ? [done, total - done] : [1], backgroundColor: total ? ['#c88b75', '#f0d9ce'] : ['#e8dcc8'], borderWidth: 0, hoverOffset: 4 }] },
      options: opts
    });
  }

  const barCanvas = document.getElementById('chartBar');
  if (barCanvas) {
    const focus = getRecordFocus(getTodayStr());
    const opts = chartBaseOptions();
    opts.plugins.legend.display = false;
    opts.plugins.title = { display: true, text: '今日累计专注时长', color: '#4a3728', font: { size: 13, weight: '500' }, padding: { bottom: 12 } };
    opts.scales = { x: { grid: { display: false }, ticks: { color: '#8b7355' } }, y: { beginAtZero: true, suggestedMax: Math.max(25, focus), grid: { color: 'rgba(232,220,200,0.5)' }, ticks: { color: '#8b7355', precision: 0 } } };
    chartBar = upsertChart(chartBar, barCanvas, {
      type: 'bar',
      data: { labels: ['今日专注'], datasets: [{ label: '分钟', data: [focus], backgroundColor: '#c88b75', borderRadius: 10, maxBarThickness: 54 }] },
      options: opts
    });
  }
}

function renderTrend() {
  const canvas = document.getElementById('chartTrend');
  if (!canvas || typeof Chart === 'undefined') return;
  const labels = [], data = [];
  let total = 0;
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    labels.push((d.getMonth()+1) + '/' + d.getDate());
    const value = getRecordFocus(key);
    data.push(value);
    total += value;
  }

  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  set('weekFocusMetric', total + ' 分钟');
  set('dailyAverageMetric', Math.round(total / 7) + ' 分钟');
  const monthCount = Object.keys(appData.records).filter(k => k.startsWith(getTodayStr().slice(0, 7)) && (getRecordFocus(k) > 0 || appData.tasks.some(t => t.date === k && t.done))).length;
  set('monthCheckinMetric', monthCount + ' 天');

  const empty = document.getElementById('trendEmpty');
  if (empty) empty.hidden = total > 0;
  canvas.parentElement.style.display = total > 0 ? 'block' : 'none';
  if (total === 0) {
    if (chartTrend) { chartTrend.destroy(); chartTrend = null; }
    return;
  }
  // 统计页不可见时不创建图表，等切到该页再画，避免 0 尺寸
  if (canvas.clientWidth === 0) return;
  const opts = chartBaseOptions();
  opts.plugins.legend.display = false;
  opts.scales = {
    x: { grid: { display: false }, ticks: { color: '#8b7355' } },
    y: { beginAtZero: true, suggestedMax: Math.max(30, ...data), grid: { color: 'rgba(232,220,200,0.5)' }, ticks: { color: '#8b7355', precision: 0 } }
  };
  opts.elements = { line: { borderWidth: 3 }, point: { radius: 4, hoverRadius: 6 } };
  chartTrend = upsertChart(chartTrend, canvas, {
    type: 'line',
    data: { labels, datasets: [{ label: '专注分钟', data, borderColor: '#c88b75', backgroundColor: 'rgba(240,217,206,0.55)', fill: true, tension: 0.38, pointBackgroundColor: '#fffdf9', pointBorderColor: '#c88b75', pointBorderWidth: 2 }] },
    options: opts
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
    const minutes = rec ? Number(rec.pom) || 0 : 0;
    const taskDone = appData.tasks.filter(t => t.date === k && t.done).length;
    const intensity = minutes >= 90 ? 3 : minutes >= 30 ? 2 : (minutes > 0 || taskDone > 0) ? 1 : 0;
    if (intensity) cell.classList.add('heat-level-' + intensity);
    cell.title = k + ' · 专注 ' + minutes + ' 分钟 · 完成任务 ' + taskDone + ' 项';
    cell.setAttribute('aria-label', cell.title);
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
    const isDone = isStudiedOnDate(ds);
    if (isDone) doneCount++;
    
    const examsToday = appData.courses.filter(c => c.enabled && c.examDate === ds);
    const hasExam = examsToday.length > 0;
    
    let cls = 'cal-day' + (isDone ? ' done' : '') + (ds === todayStr ? ' today' : '');
    if (hasExam) cls += ' has-exam';
    
    html += `<div class="${cls}" data-date="${ds}">${d}</div>`;
  }
  grid.innerHTML = html;
  if(sumEl) sumEl.textContent = '本月打卡 ' + doneCount + ' 天';

  document.querySelectorAll('.cal-day[data-date]').forEach(el => {
    el.onclick = () => {
      const ds = el.dataset.date;
      const rec = appData.records[ds];
      const pomText = rec ? `专注 ${Number(rec.pom) || 0} 分钟` : '无专注记录';
      const doneTasksCount = appData.tasks.filter(t => t.date === ds && t.done).length;
      const taskText = `完成任务 ${doneTasksCount} 项`;
      const reviewText = rec && rec.review ? `<div class="calendar-review">${escapeHtml(rec.review)}</div>` : '<p class="muted-note">这一天还没有写下复盘。</p>';
      
      const examsToday = appData.courses.filter(c => c.enabled && c.examDate === ds);
      let examHtml = '';
      if (examsToday.length > 0) {
        examHtml = `<div style="margin-bottom:12px; padding:10px; background:#fdeeee; border-radius:8px; color:#d9534f; font-size:13px; font-weight:500;">📌 今日考试：${examsToday.map(c => escapeHtml(c.name)).join('、')}</div>`;
      }
      
      openModal(ds + ' · 学习记录', `${examHtml}<p class="record-line">${pomText}</p><p class="record-line">${taskText}</p>${reviewText}`);
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
  const countdownText = days > 0 ? '还剩 ' + days + ' 天' : (days === 0 ? '就是今天' : '已结束');
  openModal(c.name, `
    <div class="detail-grid">
      <div><small>考试日期</small><b>${escapeHtml(c.examDate || '未填写')}</b><em>${countdownText}</em></div>
      <div><small>考试时间</small><b>${escapeHtml(c.examTime || '未填写')}</b></div>
      <div><small>考试形式</small><b>${escapeHtml(c.format || '未填写')}</b></div>
    </div>
    <div class="detail-block">
      <label class="form-label">考试章节 / 复习范围</label>
      <div class="detail-text">${c.chapters ? escapeHtml(c.chapters) : '<span class="muted">还没写，点下面的「编辑」补上</span>'}</div>
    </div>
    <div class="detail-block">
      <label class="form-label">备注</label>
      <div class="detail-text">${c.note ? escapeHtml(c.note) : '<span class="muted">暂无备注</span>'}</div>
    </div>
    <div class="modal-actions">
      <button class="btn-default" id="btnDetailClose">关闭</button>
      <button class="btn-primary" id="btnDetailEdit" style="flex:1;">✎ 编辑这些内容</button>
    </div>
  `);
  document.getElementById('btnDetailClose').onclick = closeModal;
  document.getElementById('btnDetailEdit').onclick = () => openCourseFormModal(id);
}

// ========== 科目编辑表单（新增 / 编辑共用） ==========
const FORMAT_PRESETS = ['闭卷', '开卷', 'Take-home', '线上机考', '课程论文', '口试/答辩'];

function courseFormHtml(c) {
  return `
    <div class="form-grid">
      <div>
        <label class="form-label">科目名称</label>
        <input id="fCourseName" value="${escapeHtml(c.name || '')}" placeholder="例如：AIDM7360 大数据管理">
      </div>
      <div>
        <label class="form-label">考试日期</label>
        <input id="fCourseDate" type="date" value="${c.examDate || ''}">
      </div>
      <div>
        <label class="form-label">考试时间</label>
        <input id="fCourseTime" value="${escapeHtml(c.examTime || '')}" placeholder="例如：14:00–16:30">
      </div>
      <div>
        <label class="form-label">考试形式</label>
        <input id="fCourseFormat" list="courseFormatList" value="${escapeHtml(c.format || '')}" placeholder="闭卷 / 开卷 / Take-home…">
        <datalist id="courseFormatList">${FORMAT_PRESETS.map(f => `<option value="${f}"></option>`).join('')}</datalist>
      </div>
    </div>
    <label class="form-label">考试章节 / 复习范围（一行一章）</label>
    <textarea id="fCourseChapters" class="ta-small" placeholder="Ch1 大数据概论&#10;Ch2 Hadoop 与 MapReduce">${escapeHtml(c.chapters || '')}</textarea>
    <label class="form-label">其他备注（考场、可带物品等）</label>
    <textarea id="fCourseNote" class="ta-small" placeholder="例如：可带一张 A4 cheat sheet">${escapeHtml(c.note || '')}</textarea>
    <div class="modal-actions">
      <button class="btn-default" id="btnCancelCourse">取消</button>
      <button class="btn-primary" id="btnSaveCourse" style="flex:1;">保存</button>
    </div>
  `;
}

function openCourseFormModal(id) {
  const isNew = !id;
  const c = isNew
    ? { id: '', name: '', examDate: '', examTime: '', format: '', chapters: '', note: '', enabled: true }
    : appData.courses.find(x => x.id === id);
  if (!c) return;

  openModal(isNew ? '新增科目' : '编辑科目', courseFormHtml(c));

  document.getElementById('btnCancelCourse').onclick = () => {
    if (isNew) closeModal(); else openCourseDetail(id);
  };

  document.getElementById('btnSaveCourse').onclick = () => {
    const name = document.getElementById('fCourseName').value.trim();
    const date = document.getElementById('fCourseDate').value;
    const time = document.getElementById('fCourseTime').value.trim();
    const format = document.getElementById('fCourseFormat').value.trim();
    const chapters = document.getElementById('fCourseChapters').value.trim();
    const note = document.getElementById('fCourseNote').value.trim();
    if (!name) { alert('请填写科目名称'); document.getElementById('fCourseName').focus(); return; }
    if (!date) { alert('请选择考试日期'); document.getElementById('fCourseDate').focus(); return; }

    if (isNew) {
      appData.courses.push({ id: 'c_' + Date.now(), name, examDate: date, examTime: time, format, chapters, note, enabled: true });
    } else {
      Object.assign(c, { name, examDate: date, examTime: time, format, chapters, note });
    }
    save();
    refreshCourseViews();
    closeModal();
    showToast(isNew ? '科目已添加' : '科目已更新');
  };
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
    save();
    closeModal();
    renderCalendar();
    renderHeatmap();
    showToast('复盘已保存');
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
    <div class="manage-hint" style="margin-top:16px;">当前版本 v12 · Canvas 果冻球：重力下落、压扁回弹、自然填缝，约 2.5 小时铺满整屏</div>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
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
    showToast('设置已保存');
  };
  document.getElementById('petDefaultFile').onchange = (e) => readImg(e, 'defaultImg');
  document.getElementById('petFocusFile').onchange = (e) => readImg(e, 'focusImg');
  document.getElementById('btnExport').onclick = () => {
    // 加 schemaVersion，便于未来兼容
    const exportObj = Object.assign({ schemaVersion: SCHEMA_VERSION }, appData);
    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const today = dateKey(new Date());
    a.download = 'studyroom_backup_' + today + '.json';
    a.click();
    showToast('备份已导出');
  };
  document.getElementById('btnImport').onclick = () => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = '.json';
    i.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const r = new FileReader();
      r.onload = (ev) => {
        try {
          const parsed = JSON.parse(ev.target.result);
          if (!parsed || typeof parsed !== 'object') throw new Error('invalid');
          const version = Number(parsed.schemaVersion) || 1;
          if (version > SCHEMA_VERSION && !confirm('备份版本较新（v' + version + '），可能不兼容。仍要导入吗？')) return;
          delete parsed.schemaVersion;
          appData = parsed;
          save();
          location.reload();
        } catch (err) {
          alert('导入失败：文件格式错误');
        }
      };
      r.readAsText(file);
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
  openCourseFormModal(null);
}

// ========== 问候语 ==========
// 想换文案：直接改下面每个时间段 lines 里的句子即可，不用动代码。
// 每个时间段会按日期自动轮换其中一句，不会每次都一样。
const GREETING_BANDS = [
  {
    from: 0, to: 4, label: '🌙 夜深了',
    lines: [
      '夜很深了，先把身体交还给睡眠。',
      '今天没做完的，明天还有一整天。',
      '不着急，睡一觉也是往前走。'
    ]
  },
  {
    from: 5, to: 8, label: '🌅 早安',
    lines: [
      '一切都很好，你听得见自己向上的声音。',
      '先做眼前这一件小事，来得及。',
      '你比自己以为的更幸运，也更有福气。'
    ]
  },
  {
    from: 9, to: 11, label: '☀️ 上午好',
    lines: [
      '我可以，我值得，我不必害怕。',
      '专注二十分钟，抵过一整页计划。',
      '你正在写出自己的故事，慢慢写就好。'
    ]
  },
  {
    from: 12, to: 13, label: '🌤 午安',
    lines: [
      '先好好吃饭，再慢慢学。',
      '歇一会儿不是浪费，是给下午留力气。',
      '这会儿只需要把心放下来。'
    ]
  },
  {
    from: 14, to: 17, label: '🌿 下午好',
    lines: [
      '请克服这个瞬间，它没有看起来那么长。',
      '不要预支烦恼，2 小时和 8 公里以外的事先放一放。',
      '做完一件，再做下一件。'
    ]
  },
  {
    from: 18, to: 20, label: '🌆 傍晚好',
    lines: [
      '天色暗下来了，你还在往前走，这就够了。',
      '今天收个尾，剩下的交给明天。',
      '不用把每一格都填满，留白也算进度。'
    ]
  },
  {
    from: 21, to: 23, label: '🌙 晚上好',
    lines: [
      '今天到这里也很好，不必把每件事都做完。',
      '不急，你按自己的节奏来。',
      '世界有浮力，放松就会被托举。'
    ]
  }
];

function dayOfYear(d) {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.floor((d - start) / 86400000) + 1;
}

function pickGreetingLine(hour) {
  const band = GREETING_BANDS.find(b => hour >= b.from && hour <= b.to) || GREETING_BANDS[GREETING_BANDS.length - 1];
  const seed = (dayOfYear(new Date()) * 3 + Math.floor(hour / 2)) % band.lines.length;
  return { label: band.label, line: band.lines[seed] };
}

function updateGreeting() {
  const el = document.getElementById('greetingText');
  const subEl = document.getElementById('greetingSub');
  if(!el) return;

  const now = new Date();
  const { label, line } = pickGreetingLine(now.getHours());
  const nameStr = appData.settings.greeting ? '，' + appData.settings.greeting : '，慢慢学';

  el.textContent = label + nameStr;
  if (subEl) subEl.textContent = line;
  el.dataset.band = label;
}

// ========== 桌宠 ==========
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
  if (!Array.isArray(appData.focusSessions)) appData.focusSessions = [];
  if (!appData.pomodoro) appData.pomodoro = { running:false, mode:'countdown', target:1500, current:1500 };
  appData.pomodoro.running = false;
  appData.pomodoro.lastTick = null;
  if (typeof appData.pomodoro.sessionSeconds !== 'number') appData.pomodoro.sessionSeconds = 0;
  if (!('sessionStartedAt' in appData.pomodoro)) appData.pomodoro.sessionStartedAt = null;
  if (!appData.pet) appData.pet = { enabled: false, defaultImg: '', focusImg: '', position: null };
  if (!appData.settings) appData.settings = { greeting: '' };

  updateGreeting();
  setInterval(updateGreeting, 60000);
  updateClock();
  setInterval(updateClock, 1000);
  
  renderCourses();
  renderAdvice();
  renderTasks();
  renderPomodoro();
  renderPet();
  renderCharts();
  renderTrend();
  renderCalendar();
  renderHeatmap();
  renderDashboardMetrics();
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
  document.getElementById('taskInput').addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });
  document.getElementById('gotoStats').onclick = () => switchView('stats');
  document.getElementById('homeStatsCard').onclick = () => switchView('stats');
  document.getElementById('calPrev').onclick = () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(); };
  document.getElementById('calNext').onclick = () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar(); };
  document.getElementById('modalClose').onclick = closeModal;
  document.getElementById('modalOverlay').onclick = (e) => { if (e.target.id === 'modalOverlay') closeModal(); };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal();
      const timer = document.getElementById('timerOverlay');
      if (timer) timer.classList.remove('show');
    }
  });

  document.getElementById('homePomCard').onclick = (e) => {
    if (!e.target.closest('button')) openTimerOverlay();
  };
  
  document.getElementById('timerCloseBtn').onclick = () => {
    document.getElementById('timerOverlay').classList.remove('show');
    // 收起界面就先把逐帧循环停掉省电，球的状态都还在，再打开接着落
    stopBallLoop();
  };

  document.getElementById('timerToggleBtn').onclick = () => {
    if (appData.pomodoro.running) pauseTimer(); else startTimer();
  };
  
  document.getElementById('timerFinishBtn').onclick = finishTimer;
  document.getElementById('timerResetBtn').onclick = resetTimer;
  
  document.querySelectorAll('.timer-mode-tab').forEach(tab => {
    tab.onclick = () => {
      const p = appData.pomodoro;
      if (p.mode === tab.dataset.mode) return;
      if ((p.running || (p.sessionSeconds || 0) > 0) && !confirm('切换模式会结束并清空当前未保存的计时进度（已保存的专注记录不受影响），确定切换吗？')) return;
      stopFocusIntervals();
      p.running = false;
      p.lastTick = null;
      p.sessionSeconds = 0;
      p.sessionStartedAt = null;
      resetBallPile();
      p.mode = tab.dataset.mode;
      p.current = p.mode === 'countdown' ? p.target : 0;
      save();
      renderPomodoro();
    };
  });

  document.getElementById('timerMinus').onclick = () => {
    const p = appData.pomodoro;
    if (p.running || p.mode !== 'countdown') return;
    p.target = Math.max(60, p.target - 300); 
    p.current = p.target;
    save();
    renderPomodoro();
  };
  document.getElementById('timerPlus').onclick = () => {
    const p = appData.pomodoro;
    if (p.running || p.mode !== 'countdown') return;
    p.target += 300; 
    p.current = p.target;
    save();
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

window.openTimerOverlay = function() {
  const overlay = document.getElementById('timerOverlay');
  if (overlay) {
    overlay.classList.add('show');
    renderPomodoro();
    refreshBallLayer();
    if (appData.pomodoro.running) spawnBallBurst(2, 600);
  }
};

window.spawnBallBurst = spawnBallBurst;
