const STORAGE_KEY = "moonferry_study_data";
const defaultCourses = [
  {
    id: "aidm7320",
    name: "AIDM7320 Basics in media and Commuication",
    examDate: "2026-12-20",
    enabled: false,
    note: `期末闭卷考试定于12月20日，总分由客观题与主观题构成，强调理论理解而非死记硬背。
Part1 75分客观题（单选/判断），Part2 600字以上论述题（三选一）。
复习四大模块：传播理论流派、把关人机制与新闻生产、媒体效果理论、政治经济学与意识形态。
指定阅读共10篇。
考点：媒介理论四大范式、魔弹论、把关人、影响层级模型、宣传模式、议程设置、框架理论、回音室、霸权、想象的共同体、受众商品理论等。
论述题需要打通多板块知识点，结合案例。`
  },
  {
    id: "aidm7360",
    name: "AIDM7360 Big Data Management and Analytics",
    examDate: "2026-12-09",
    enabled: false,
    note: "一张A4 cheat sheet"
  },
  {
    id: "aidm7390",
    name: "AIDM7390 Data Mining and knowledge Discovery",
    examDate: "2026-12-18",
    enabled: false,
    note: "一张A4 cheat sheet"
  },
  {
    id: "aidm7330",
    name: "AIDM7330 Programming for Data Science",
    examDate: "2026-12-13",
    enabled: false,
    note: "Takehome。12.13 早上9点发布材料，截止当日23:59提交Jupyter Notebook，时长最多15h，严禁抄袭。"
  },
  {
    id: "comm7020",
    name: "COMM7020 Approaches & Methods in Comm Research",
    examDate: "2026-12-17",
    enabled: false,
    note: "闭卷。60道单选（60分）+5简答+1附加题（40分）。
范围：研究设计、概念化操作化、测量、抽样、问卷、实验、内容分析、质性研究。
考点：演绎归纳、因果标准、信度效度、测量层级、随机抽样、实验操纵、编码者信度。"
  }
];
let appData = {
  courses: [...defaultCourses],
  tasks: [],
  pomodoro: {running:false, left:1500, total:1500},
  records: {},
  pet:{enabled:false, defaultImg:"", focusImg:""},
  settings:{greeting:""}
};
let currentView = "home";
let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth();
let pomTimer = null;
let chartRing = null;
let chartStack = null;
let chartTrend = null;
const chartColorPrimary = "#c88b75";
const chartColorLight = "#e9c9bc";
const chartColorText = "#4b3c32";

function save(){localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));}
function load(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(raw) appData = JSON.parse(raw);
}

function switchView(viewName){
  currentView = viewName;
  document.querySelectorAll(".view").forEach(v=>v.style.display="none");
  document.getElementById("view-"+viewName).style.display="block";
  document.querySelectorAll(".nav-tab").forEach(t=>t.classList.remove("active"));
  document.querySelector(`[data-view="${viewName}"]`).classList.add("active");
  if(viewName==="calendar") renderCalendar();
  if(viewName==="stats") {
    renderHeatmap();
    renderTrendChart();
  }
  if(viewName==="home") renderHomeCharts();
}

function updateClock(){
  const d = new Date();
  const t = d.toLocaleTimeString("zh-CN",{hour12:false});
  const dateStr = d.toLocaleDateString("zh-CN",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
  document.getElementById("liveClockTime").innerText = t;
  document.getElementById("liveClockDate").innerText = dateStr;
}
setInterval(updateClock,1000);
updateClock();

function getDayDiff(dateStr){
  const exam = new Date(dateStr);
  exam.setHours(0,0,0,0);
  const now = new Date();
  now.setHours(0,0,0,0);
  const diff = Math.ceil((exam - now)/86400000);
  return diff;
}
function renderCourses(){
  const wrap = document.getElementById("courseGrid");
  const enabled = appData.courses.filter(c=>c.enabled);
  document.getElementById("courseEmptyHint").style.display = enabled.length ? "none":"block";
  let html = "";
  enabled.forEach(c=>{
    const days = getDayDiff(c.examDate);
    html += `
    <div class="course-item" data-id="${c.id}">
      <div class="course-item-head">
        <input type="checkbox" class="course-enable" data-id="${c.id}" checked>
        <div class="course-name">${c.name}</div>
      </div>
      <div class="course-countdown">${days>0 ? days+" 天后考试":"已结束"}</div>
    </div>`;
  });
  wrap.innerHTML = html;
  document.querySelectorAll(".course-enable").forEach(cb=>{
    cb.onchange = ()=>{
      const c = appData.courses.find(x=>x.id===cb.dataset.id);
      if(c) c.enabled = cb.checked;
      save();renderCourses();updateProgress();renderHomeCharts();
    }
  })
  document.querySelectorAll(".course-item").forEach(el=>{
    el.onclick = (e)=>{
      if(e.target.tagName==="INPUT") return;
      openModal("courseDetail", el.dataset.id);
    }
  })
  updateProgress();
}
function updateProgress(){
  const enabled = appData.courses.filter(c=>c.enabled);
  const total = enabled.length;
  const done = enabled.filter(c=>getDayDiff(c.examDate)<=0).length;
  const pct = total ? Math.round(done/total*100) : 0;
  document.getElementById("totalProgress").innerText = "总进度："+pct+"%";
}

function renderPomodoro(){
  const p = appData.pomodoro;
  const min = String(Math.floor(p.left/60)).padStart(2,"0");
  const sec = String(p.left%60).padStart(2,"0");
  document.getElementById("pomTime").innerText = min+":"+sec;
  document.getElementById("pomHint").innerText = p.running ? "专注中" : "准备就绪";
  const pet = document.getElementById("petTimer");
  if(p.running){
    pet.style.display = "block";
    pet.innerText = min+":"+sec;
    if(appData.pet.focusImg) document.getElementById("petImg").src = appData.pet.focusImg;
  }else{
    pet.style.display = "none";
    if(appData.pet.defaultImg) document.getElementById("petImg").src = appData.pet.defaultImg;
  }
}
function startPomodoro(){
  if(appData.pomodoro.running) return;
  appData.pomodoro.running = true;
  save();
  pomTimer = setInterval(()=>{
    appData.pomodoro.left--;
    if(appData.pomodoro.left <=0){
      appData.pomodoro.running = false;
      clearInterval(pomTimer);
    }
    save();renderPomodoro();renderHomeCharts();
  },1000);
  renderPomodoro();
}
function resetPomodoro(){
  clearInterval(pomTimer);
  appData.pomodoro.running = false;
  appData.pomodoro.left = appData.pomodoro.total;
  save();renderPomodoro();renderHomeCharts();
}

function renderTask(){
  const wrap = document.getElementById("taskList");
  const empty = document.getElementById("taskEmpty");
  if(appData.tasks.length===0){
    wrap.innerHTML="";empty.style.display="block";return;
  }
  empty.style.display="none";
  let h = "";
  appData.tasks.forEach((t,i)=>{
    h += `<div class="task-item"><input type="checkbox" ${t.done?"checked":""} data-idx="${i}"><span>${t.title} (${t.min}min)</span></div>`
  })
  wrap.innerHTML = h;
  document.querySelectorAll(".task-item input").forEach(cb=>{
    cb.onchange = ()=>{
      appData.tasks[cb.dataset.idx].done = cb.checked;
      save();renderTask();renderHomeCharts();
    }
  })
}
function addQuickTask(){
  const title = document.getElementById("quickTaskTitle").value.trim();
  const min = Number(document.getElementById("quickTaskMin").value);
  if(!title) return;
  appData.tasks.push({title,min,done:false});
  document.getElementById("quickTaskTitle").value="";
  save();renderTask();renderHomeCharts();
}

function renderHomeCharts(){
  const doneTask = appData.tasks.filter(t=>t.done).length;
  const totalTask = appData.tasks.length;
  const pomMinutes = Math.floor((appData.pomodoro.total - appData.pomodoro.left)/60);
  const restMinutes = Math.floor(appData.pomodoro.left /60);

  if(chartRing) chartRing.destroy();
  const ctxRing = document.getElementById("homeChartRing").getContext("2d");
  chartRing = new Chart(ctxRing,{
    type:"doughnut",
    data:{
      labels:["已完成任务","未完成任务"],
      datasets:[{
        data:[doneTask, totalTask - doneTask],
        backgroundColor:[chartColorPrimary, chartColorLight],
        borderWidth:0
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        title:{display:true,text:"今日任务完成率",color:chartColorText},
        legend:{labels:{color:chartColorText}}
      }
    }
  })

  if(chartStack) chartStack.destroy();
  const ctxStack = document.getElementById("homeChartStack").getContext("2d");
  chartStack = new Chart(ctxStack,{
    type:"bar",
    data:{
      labels:["专注计时"],
      datasets:[
        {label:"已专注",data:[pomMinutes],backgroundColor:chartColorPrimary},
        {label:"剩余计时",data:[restMinutes],backgroundColor:chartColorLight}
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{title:{display:true,text:"番茄钟时长(分钟)",color:chartColorText},legend:{labels:{color:chartColorText}}},
      scales:{x:{stacked:true},y:{stacked:true,grid:{color:"rgba(200,170,150,0.2)"}}}
    }
  })
}

function renderTrendChart(){
  if(chartTrend) chartTrend.destroy();
  const labels = [];
  const dataVal = [];
  for(let i=6;i>=0;i--){
    const d = new Date();
    d.setDate(d.getDate()-i);
    const k = d.toISOString().slice(0,10);
    labels.push(`${d.getMonth()+1}/${d.getDate()}`);
    const rec = appData.records[k];
    const m = rec?.pom || 0;
    dataVal.push(m);
  }
  const ctxTrend = document.getElementById("chartTrend").getContext("2d");
  chartTrend = new Chart(ctxTrend,{
    type:"line",
    data:{
      labels,
      datasets:[{
        label:"当日专注分钟",
        data:dataVal,
        borderColor:chartColorPrimary,
        backgroundColor:chartColorLight,
        fill:true,
        tension:0.3
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{labels:{color:chartColorText}}},
      scales:{y:{grid:{color:"rgba(200,170,150,0.2)"}}}
    }
  })
}

const modal = document.getElementById("modalContainer");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
function openModal(type, payload){
  modal.style.display="flex";
  if(type==="courseDetail"){
    const c = appData.courses.find(x=>x.id===payload);
    modalTitle.innerText = c.name;
    modalBody.innerHTML = `<p>📅 考试日期：${c.examDate}</p><div style="white-space:pre-line;">${c.note}</div>`
  }
  if(type==="review"){
    modalTitle.innerText = "📝 今日复盘小结";
    modalBody.innerHTML = `<textarea id="reviewText" style="width:100%;height:140px;" placeholder="写下今天的复盘..."></textarea><br><button class="btn-primary" id="submitReview">提交复盘并重排</button>`
    document.getElementById("submitReview").onclick = ()=>{
      const txt = document.getElementById("reviewText").value;
      const today = new Date().toISOString().slice(0,10);
      if(!appData.records[today]) appData.records[today] = {review:"",tasks:[],pom:0};
      appData.records[today].review = txt;
      save();closeModal();renderTrendChart();
    }
  }
  if(type==="setting"){
    modalTitle.innerText = "⚙ 偏好设置";
    modalBody.innerHTML = `
      <p>顶部问候称呼</p><input id="setGreet" value="${appData.settings.greeting}">
      <p>自定义挂件</p>
      <label><input type="checkbox" id="petEnable" ${appData.pet.enabled?"checked":""}>启用右下角挂件</label>
      <p>默认状态图</p><input type="file" id="petDefFile" accept="image/*">
      <p>专注状态图</p><input type="file" id="petFocusFile" accept="image/*">
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn-primary" id="saveSetting">保存</button>
        <button class="btn-default" onclick="exportData()">导出JSON</button>
        <button class="btn-default" onclick="importData()">导入JSON</button>
        <button class="btn-default" onclick="clearAll()">清空全部</button>
      </div>
    `;
    document.getElementById("saveSetting").onclick = saveSettingModal;
    document.getElementById("petDefFile").onchange = (e)=>readImg(e,"defaultImg");
    document.getElementById("petFocusFile").onchange = (e)=>readImg(e,"focusImg");
  }
  if(type==="addCourse"){
    modalTitle.innerText = "新增科目";
    modalBody.innerHTML = `
      <input placeholder="科目名称" id="newCName">
      <input placeholder="考试日期 YYYY-MM-DD" id="newCDate">
      <textarea id="newCNote" style="width:100%;height:120px;" placeholder="备注/考点"></textarea>
      <button class="btn-primary" id="saveNewCourse">保存</button>
    `
    document.getElementById("saveNewCourse").onclick = saveNewCourse;
  }
}
function closeModal(){modal.style.display="none";}
function saveSettingModal(){
  appData.settings.greeting = document.getElementById("setGreet").value;
  appData.pet.enabled = document.getElementById("petEnable").checked;
  save();renderPet();closeModal();
}
function readImg(e,key){
  const f = e.target.files[0];
  if(!f)return;
  const r = new FileReader();
  r.onload = ev=>{appData.pet[key]=ev.target.result;save();renderPet();}
  r.readAsDataURL(f);
}
function saveNewCourse(){
  const name = document.getElementById("newCName").value.trim();
  const date = document.getElementById("newCDate").value.trim();
  const note = document.getElementById("newCNote").value.trim();
  if(!name||!date) return;
  const id = "c_"+Date.now();
  appData.courses.push({id,name,examDate:date,enabled:true,note});
  save();renderCourses();renderHomeCharts();closeModal();
}
function exportData(){
  const blob = new Blob([JSON.stringify(appData,null,2)],{type:"application/json"});
  const a = document.createElement("a");
  a.href=URL.createObjectURL(blob);a.download="studyroom_backup.json";a.click();
}
function importData(){
  const i = document.createElement("input");
  i.type="file";i.accept=".json";
  i.onchange=e=>{
    const f = e.target.files[0];
    const r = new FileReader();
    r.onload=ev=>{appData=JSON.parse(ev.target.result);save();initAll();}
    r.readAsText(f);
  }
  i.click();
}
function clearAll(){if(confirm("确定清空全部数据？")){localStorage.removeItem(STORAGE_KEY);appData={courses:[...defaultCourses],tasks:[],pomodoro:{running:false,left:1500,total:1500},records:{},pet:{enabled:false,defaultImg:"",focusImg:""},settings:{greeting:""}};save();initAll();}}
document.getElementById("modalClose").onclick = closeModal;
modal.onclick = (e)=>{if(e.target===modal) closeModal();}

function renderPet(){
  const c = document.getElementById("petContainer");
  const img = document.getElementById("petImg");
  if(!appData.pet.enabled || (!appData.pet.defaultImg && !appData.pet.focusImg)){
    c.style.display="none";return;
  }
  c.style.display="block";
  if(appData.pet.defaultImg) img.src = appData.pet.defaultImg;
  renderPomodoro();
}

function renderCalendar(){
  const wrap = document.getElementById("calGrid");
  const titleEl = document.getElementById("calTitle");
  const summary = document.getElementById("calSummary");
  const d = new Date(calendarYear, calendarMonth, 1);
  titleEl.innerText = calendarYear+" 年 "+(calendarMonth+1)+" 月";
  const firstDay = d.getDay();
  const daysInMonth = new Date(calendarYear,calendarMonth+1,0).getDate();
  let html = "";
  for(let i=0;i<firstDay;i++) html += `<div class="calendar-day empty"></div>`;
  const todayStr = new Date().toISOString().slice(0,10);
  let countCompleted=0;
  for(let day=1;day<=daysInMonth;day++){
    const ds = `${calendarYear}-${String(calendarMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const rec = appData.records[ds];
    const isCompleted = rec && rec.tasks?.some(x=>x.done);
    if(isCompleted) countCompleted++;
    const cls = isCompleted ? "calendar-day completed" : "calendar-day";
    const isToday = ds === todayStr ? " today" : "";
    html += `<div class="${cls}${isToday}" data-date="${ds}">${day}</div>`
  }
  wrap.innerHTML = html;
  summary.innerText = `本月打卡：${countCompleted} 天`
  document.querySelectorAll(".calendar-day[data-date]").forEach(el=>{
    el.onclick = ()=>openModal("calDay", el.dataset.date);
  })
}
document.getElementById("calPrev").onclick = ()=>{calendarMonth--;if(calendarMonth<0){calendarMonth=11;calendarYear--;}renderCalendar();}
document.getElementById("calNext").onclick = ()=>{calendarMonth++;if(calendarMonth>11){calendarMonth=0;calendarYear++;}renderCalendar();}
function renderHeatmap(){
  const wrap = document.getElementById("heatmapGrid");
  wrap.innerHTML = "";
  for(let i=0;i<28;i++){
    const d = new Date();
    d.setDate(d.getDate()-27+i);
    const k = d.toISOString().slice(0,10);
    const rec = appData.records[k];
    const hasWork = rec && (rec.pom>0 || rec.tasks?.length>0);
    const div = document.createElement("div");
    div.style.aspectRatio="1/1";div.style.borderRadius="6px";
    div.style.background = hasWork ? "var(--primary-light)" : "#f3ede7";
    wrap.appendChild(div);
  }
}

document.querySelectorAll(".nav-tab").forEach(t=>t.onclick=()=>switchView(t.dataset.view));
document.getElementById("openReviewBtn").onclick = ()=>openModal("review");
document.getElementById("openSetting").onclick = ()=>openModal("setting");
document.getElementById("quickAddCourseFromHome").onclick = ()=>openModal("addCourse");
document.getElementById("addCourseFromCourses").onclick = ()=>openModal("addCourse");
document.getElementById("pomStart").onclick = startPomodoro;
document.getElementById("pomReset").onclick = resetPomodoro;
document.getElementById("toggleQuickTask").onclick = ()=>{
  const box = document.getElementById("quickTaskBox");
  box.style.display = box.style.display==="none" ? "block":"none";
}
document.getElementById("addQuickTaskBtn").onclick = addQuickTask;
document.getElementById("homeStatsCard").onclick = ()=>switchView("stats");
document.getElementById("toggleTrendBtn").onclick = ()=>{
  const card = document.getElementById("trendCardBody");
  card.style.display = card.style.display === "none" ? "block":"none";
}

function initAll(){
  load();
  renderCourses();
  renderTask();
  renderPomodoro();
  renderPet();
  renderHeatmap();
  renderHomeCharts();
}
initAll();
