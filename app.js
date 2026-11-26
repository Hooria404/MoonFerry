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
let ballInterval = null;
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

function getTodayTasks() {
  return appData.tasks.filter(task => (task.date || getTodayStr()) === getTodayStr());
}

function getRecordFocus(dateStr) {
  const record = appData.records[dateStr];
  return record ? Math.max(0, Number(record.pom) || 0) : 0;
}

function getLearningStreak() {
  let streak = 0;
  const date = new Date();
  const todayRecord = appData.records[getTodayStr()];
  const todayTasks = getTodayTasks();
  const studiedToday = getRecordFocus(getTodayStr()) > 0 || todayTasks.some(t => t.done) ||
    (todayRecord && todayRecord.tasks && todayRecord.tasks.some(t => t.done));
  if (!studiedToday) date.setDate(date.getDate() - 1);
  while (true) {
    const key = date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0');
    const record = appData.records[key];
    const studied = getRecordFocus(key) > 0 || (record && record.tasks && record.tasks.some(t => t.done));
    if (!studied) break;
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
      appData.tasks.forEach((task, index) => {
        if (!task.id) task.id = 'task_' + Date.now() + '_' + index;
        if (!task.date) task.date = getTodayStr();
        if (typeof task.done !== 'boolean') task.done = false;
        if (!Number.isFinite(Number(task.min))) task.min = 30;
      });
      if (appData.pomodoro && appData.pomodoro.running) appData.pomodoro.running = false;
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
    grid.innerHTML = `<div class="empty-hint"><p>还没有启用的科目，点击右上角添加</p></div>`;
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
      save(); renderCourses(); updateProgress(); renderCharts(); renderAdvice(); renderPlan();
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
    <div class="course-item" style="margin-bottom:12px; cursor:default;">
      <div class="course-item-head" style="justify-content:space-between;">
        <span class="course-name">${escapeHtml(c.name)}</span>
        <span style="color:var(--primary);font-size:13px;">${daysUntil(c.examDate) > 0 ? daysUntil(c.examDate) + ' 天后' : (daysUntil(c.examDate) === 0 ? '今天考试' : '考试已结束')}</span>
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
      save(); renderCourses(); renderAdvice(); renderPlan();
    };
  });

  document.querySelectorAll('.btn-del').forEach(btn => {
    btn.onclick = () => {
      if(confirm('确定删除该科目吗？')) {
        appData.courses = appData.courses.filter(c => c.id !== btn.dataset.id);
        save(); renderCourseManage(); renderCourses(); renderAdvice(); renderPlan();
      }
    }
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
      const rec = ensureRecord(getTodayStr());
      rec.tasks = tasks.map(t => ({ id: t.id, title: t.title, min: t.min, done: t.done }));
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
      const rec = ensureRecord(getTodayStr());
      rec.tasks = getTodayTasks().map(t => ({ id: t.id, title: t.title, min: t.min, done: t.done }));
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

  // 结束按钮始终可以点击，不再被错误禁用
  if (finishBtn) {
    finishBtn.disabled = false;
    finishBtn.textContent = '结束本次专注';
  }

  // ❌ 这里之前多了一个括号，导致整个JS崩溃，现已删除

  const resetBtn = document.getElementById('timerResetBtn');
  if (resetBtn) {
    resetBtn.disabled = p.running;
  }

  const petClock = document.getElementById('petClock');
  if (petClock) {
    petClock.style.display = p.running ? 'block' : 'none';
  }

  renderFocusHistory();
  renderPet();
}


// ========== 专注计时控制 ==========

// ✅ 修复死循环问题
function stopFocusIntervals() {
  if (timerInterval) clearInterval(timerInterval);
  if (ballInterval) clearInterval(ballInterval);
  timerInterval = null;
  ballInterval = null;
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

function startTimer() {
  const p = appData.pomodoro;

  if (p.running) return;

  if (p.mode === 'countdown' && p.current <= 0) {
    p.current = p.target;
  }

  if (!p.sessionStartedAt) {
    p.sessionStartedAt = new Date().toISOString();
  }

  p.running = true;
  p.lastTick = Date.now();

  stopFocusIntervals();
  save();

  // 开始后立即出现第一颗小球（原样保留）
  createFallingBall();

  // 此后每隔5秒生成一颗（原样保留）
  ballInterval = setInterval(() => {
    if (appData.pomodoro.running) {
      createFallingBall();
    }
  }, 5000);

  // 计时器独立运行
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

  const balls = document.getElementById('ballsBg');

  if (balls) {
    balls.innerHTML = '';
  }

  save();
  renderPomodoro();
}

function saveFocusSession(status) {
  const p = appData.pomodoro;
  const seconds = Math.max(0, Number(p.sessionSeconds) || 0);
  if (!appData.focusSessions) appData.focusSessions = [];
  if (seconds > 0) {
    const started = p.sessionStartedAt || new Date(Date.now() - seconds * 1000).toISOString();
    const ended = new Date().toISOString();
    appData.focusSessions.unshift({ id: 'focus_' + Date.now(), date: started.slice(0,10), startedAt: started, endedAt: ended, seconds, minutes: Math.floor(seconds / 60), mode: p.mode, status });
    appData.focusSessions = appData.focusSessions.slice(0, 200);
    const rec = ensureRecord(started.slice(0,10));
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


// ========== 【小球部分代码原封不动保留】 ==========
function createFallingBall() {
  const overlay = document.getElementById('timerOverlay');
  const container = document.getElementById('ballsBg');

  if (!overlay || !container) {
    console.error('小球创建失败：找不到 timerOverlay 或 ballsBg');
    return;
  }

  Object.assign(container.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    pointerEvents: 'none',
    zIndex: '1'
  });

  const ball = document.createElement('div');

  const size = 12 + Math.random() * 10;
  const left = 2 + Math.random() * 96;
  const drift = Math.random() * 100 - 50;
  const duration = 6000 + Math.random() * 2500;

  Object.assign(ball.style, {
    position: 'absolute',
    display: 'block',
    top: '-25px',
    left: left + '%',
    width: size + 'px',
    height: size + 'px',
    borderRadius: '50%',
    background: 'radial-gradient(circle at 30% 25%, #f8e4dc, #c88b75)',
    boxShadow: '0 2px 15px rgba(200,139,117,.3)',
    opacity: '0',
    pointerEvents: 'none',
    zIndex: '1'
  });

  container.appendChild(ball);

  const animation = ball.animate([
    {
      transform: 'translateY(0)',
      opacity: 0
    },
    {
      transform: 'translateY(10vh)',
      opacity: 0.85,
      offset: 0.12
    },
    {
      transform: `translate(${drift}px, ${window.innerHeight + 80}px)`,
      opacity: 0
    }
  ], {
    duration: duration,
    easing: 'linear',
    fill: 'forwards'
  });

  animation.onfinish = () => ball.remove();

  console.log('🌸 已生成一颗专注小球');
}
// ========== 【小球部分结束】 ==========


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
  const empty = document.getElementById('trendEmpty');
  if (empty) empty.hidden = total > 0;
  canvas.parentElement.style.display = total > 0 ? 'block' : 'none';
  if (total === 0) {
    if (chartTrend) { chartTrend.destroy(); chartTrend = null; }
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    set('weekFocusMetric', '0 分钟');
    set('dailyAverageMetric', '0 分钟');
    const monthCount = Object.keys(appData.records).filter(k => k.startsWith(getTodayStr().slice(0, 7)) && (getRecordFocus(k) > 0 || (appData.records[k].tasks || []).some(t => t.done))).length;
    set('monthCheckinMetric', monthCount + ' 天');
    return;
  }
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
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  set('weekFocusMetric', total + ' 分钟');
  set('dailyAverageMetric', Math.round(total / 7) + ' 分钟');
  const monthCount = Object.keys(appData.records).filter(k => k.startsWith(getTodayStr().slice(0, 7)) && (getRecordFocus(k) > 0 || (appData.records[k].tasks || []).some(t => t.done))).length;
  set('monthCheckinMetric', monthCount + ' 天');
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
    const taskDone = rec && rec.tasks ? rec.tasks.filter(t => t.done).length : 0;
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
      const pomText = rec ? `专注 ${Number(rec.pom) || 0} 分钟` : '无专注记录';
      const taskText = rec && rec.tasks ? `完成任务 ${rec.tasks.filter(t=>t.done).length} 项` : '无任务记录';
      const reviewText = rec && rec.review ? `<div class="calendar-review">${escapeHtml(rec.review)}</div>` : '<p class="muted-note">这一天还没有写下复盘。</p>';
      openModal(ds + ' · 学习记录', `<p class="record-line">${pomText}</p><p class="record-line">${taskText}</p>${reviewText}`);
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
  };

  document.getElementById('timerToggleBtn').onclick = () => {
    if (appData.pomodoro.running) pauseTimer(); else startTimer();
  };
  
  // ✅ 确保“结束本次专注”按钮绑定成功
  document.getElementById('timerFinishBtn').onclick = finishTimer;
  document.getElementById('timerResetBtn').onclick = resetTimer;
  
  document.querySelectorAll('.timer-mode-tab').forEach(tab => {
    tab.onclick = () => {
      const p = appData.pomodoro;
      if (p.mode === tab.dataset.mode) return;
      if ((p.running || (p.sessionSeconds || 0) > 0) && !confirm('切换模式会结束并清空当前未保存的计时进度（不会计入历史），确定切换吗？')) return;
      stopFocusIntervals();
      p.running = false;
      p.lastTick = null;
      p.sessionSeconds = 0;
      p.sessionStartedAt = null;
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
  }
};