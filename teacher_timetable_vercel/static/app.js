
const DAYS = ["월","화","수","목","금"];
const PERIODS = ["1","2","3","4","5","6","7"];

let state = {
  teachers: {},
  teacherNames: [],
  selected: new Set(),
  source: "",
  filename: "",
  warnings: []
};

const el = id => document.getElementById(id);

function setLoading(on, text="시간표 PDF를 분석하고 있습니다..."){
  const overlay = el("loadingOverlay");
  overlay.querySelector("div:last-child").textContent = text;
  overlay.style.display = on ? "flex" : "none";
}

function compactCell(text){
  if(!text) return "";
  return String(text).split("\n").map(s=>s.trim()).filter(Boolean).join(" / ");
}

async function loadDefault(){
  setLoading(true);
  try{
    const res = await fetch("/api/timetable");
    const body = await res.json();
    if(!res.ok) throw new Error(body.detail || "기본 시간표를 불러오지 못했습니다.");
    applyData(body, true);
  }catch(err){
    alert(err.message);
  }finally{
    setLoading(false);
  }
}

async function uploadPdf(file){
  if(!file) return;
  if(file.size > 4_500_000){
    alert("PDF가 너무 큽니다. Vercel에서는 약 4.5MB 이하 PDF를 사용해 주세요.");
    return;
  }
  setLoading(true, "업로드한 PDF를 분석하고 있습니다...");
  try{
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/timetable", {method:"POST", body:fd});
    const body = await res.json();
    if(!res.ok) throw new Error(body.detail || "PDF 분석에 실패했습니다.");
    applyData(body, true);
  }catch(err){
    alert(err.message);
  }finally{
    el("pdfUpload").value = "";
    setLoading(false);
  }
}

function applyData(body, clearSelection=false){
  state.teachers = body.teachers || {};
  state.teacherNames = Object.keys(state.teachers).sort((a,b)=>(state.teachers[a].no||0)-(state.teachers[b].no||0));
  state.source = body.source || "";
  state.filename = body.filename || "";
  state.warnings = body.warnings || [];
  if(clearSelection) state.selected.clear();
  state.selected = new Set([...state.selected].filter(n=>state.teachers[n]));
  el("sourceInfo").textContent = `${state.source} · ${state.filename} · 교사 ${state.teacherNames.length}명`;
  renderWarnings();
  renderTeacherGrid();
  renderMain();
}

function renderWarnings(){
  const box = el("warningBox");
  if(!state.warnings.length){
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }
  box.classList.remove("hidden");
  box.innerHTML = `<strong>PDF 분석 확인사항 ${state.warnings.length}건</strong><br>` +
    state.warnings.slice(0,8).map(x=>escapeHtml(x)).join("<br>") +
    (state.warnings.length>8 ? `<br>외 ${state.warnings.length-8}건` : "");
}

function renderTeacherGrid(){
  const q = el("teacherSearch").value.trim().toLowerCase();
  const names = state.teacherNames.filter(n=>n.toLowerCase().includes(q));
  const grid = el("teacherGrid");
  grid.innerHTML = "";

  names.forEach(name=>{
    const b = document.createElement("button");
    b.className = "teacher-btn" + (state.selected.has(name) ? " selected" : "");
    b.title = name;
    b.textContent = name;
    b.addEventListener("click", ()=>{
      if(state.selected.has(name)) state.selected.delete(name);
      else state.selected.add(name);
      renderTeacherGrid();
      renderMain();
    });
    grid.appendChild(b);
  });

  el("selectedCount").textContent = `${state.selected.size}명`;
  el("clearBtn").disabled = state.selected.size === 0;
}

function scheduleTable(info, freeHighlight=true){
  let html = `<div class="schedule-wrap"><table class="schedule"><thead><tr><th>교시</th>`;
  DAYS.forEach(d=>html += `<th>${d}</th>`);
  html += `</tr></thead><tbody>`;
  PERIODS.forEach(p=>{
    html += `<tr><td>${p}</td>`;
    DAYS.forEach(d=>{
      const text = info.schedule[d][p] || "";
      const cls = !text && freeHighlight ? "free" : "";
      html += `<td class="${cls}">${text ? escapeHtml(compactCell(text)) : (freeHighlight ? "공강" : "")}</td>`;
    });
    html += `</tr>`;
  });
  html += `</tbody></table></div>`;
  return html;
}

function commonFree(selectedNames){
  const result = [];
  DAYS.forEach(day=>{
    PERIODS.forEach(period=>{
      const allFree = selectedNames.every(name=>!state.teachers[name].schedule[day][period]);
      if(allFree) result.push([day,period]);
    });
  });
  return result;
}

function commonTable(common){
  const set = new Set(common.map(([d,p])=>`${d}-${p}`));
  let html = `<div class="schedule-wrap"><table class="schedule"><thead><tr><th>교시</th>`;
  DAYS.forEach(d=>html += `<th>${d}</th>`);
  html += `</tr></thead><tbody>`;
  PERIODS.forEach(p=>{
    html += `<tr><td>${p}</td>`;
    DAYS.forEach(d=>{
      const yes = set.has(`${d}-${p}`);
      html += `<td class="${yes?"dot":""}">${yes?"●":""}</td>`;
    });
    html += `</tr>`;
  });
  return html + `</tbody></table></div>`;
}

function freeLine(info){
  return DAYS.map(day=>{
    const ps = PERIODS.filter(p=>!info.schedule[day][p]);
    return `<strong>${day}</strong> ${ps.length?ps.map(p=>`${p}교시`).join(", "):"없음"}`;
  }).join("　|　");
}

function daySummary(common){
  return DAYS.map(day=>{
    const ps = common.filter(([d])=>d===day).map(([,p])=>`${p}교시`);
    return `<div><strong>${day}요일</strong>: ${ps.length?ps.join(", "):"공통 공강 없음"}</div>`;
  }).join("");
}

function busyFinder(selectedNames){
  return `
    <section class="card">
      <div class="card-title"><h3>🔎 선택 교사 중 수업 중인 교사 찾기</h3><span>공강 비교와 별개 기능</span></div>
      <p class="help">요일과 교시를 선택하면, 현재 선택한 교사 중 그 시간에 실제 수업이 있는 교사만 표시합니다.</p>
      <div class="finder-controls">
        <div class="field">
          <label>요일</label>
          <select id="busyDay">${DAYS.map(d=>`<option value="${d}">${d}요일</option>`).join("")}</select>
        </div>
        <div class="field">
          <label>교시</label>
          <select id="busyPeriod">${PERIODS.map(p=>`<option value="${p}">${p}교시</option>`).join("")}</select>
        </div>
        <button id="busyFindBtn" class="find-btn">수업 교사 보기</button>
      </div>
      <div id="busyResult" class="busy-result"></div>
    </section>`;
}

function runBusyFinder(){
  const day = el("busyDay").value;
  const period = el("busyPeriod").value;
  const names = [...state.selected];
  const busy = names
    .map(name=>({name, lesson: state.teachers[name].schedule[day][period] || ""}))
    .filter(x=>x.lesson);

  const box = el("busyResult");
  if(!busy.length){
    box.innerHTML = `<div class="empty-message">${day}요일 ${period}교시에 선택 교사 중 수업이 있는 교사가 없습니다.</div>`;
    return;
  }
  box.innerHTML = busy.map(x=>`
    <div class="busy-teacher">
      <strong>${escapeHtml(x.name)}</strong>
      <div>${escapeHtml(compactCell(x.lesson))}</div>
    </div>`).join("");
}

function renderMain(){
  const names = [...state.selected];
  const content = el("content");
  el("selectedCount").textContent = `${names.length}명`;
  el("clearBtn").disabled = names.length === 0;
  el("csvBtn").disabled = names.length === 0;

  if(names.length===0){
    el("pageTitle").textContent = "조회할 교사를 선택하세요";
    el("pageSubTitle").textContent = "왼쪽에서 교사 이름을 선택하세요.";
    const empty = {schedule:Object.fromEntries(DAYS.map(d=>[d,Object.fromEntries(PERIODS.map(p=>[p,""]))]))};
    content.innerHTML = `
      <section class="card">
        <div class="card-title"><h3>🗓 선택 교사 시간표</h3><span>교사별 일정 보기</span></div>
        ${scheduleTable(empty,false)}
      </section>`;
    return;
  }

  if(names.length===1){
    const name = names[0];
    const info = state.teachers[name];
    el("pageTitle").textContent = `${name} 선생님 시간표`;
    el("pageSubTitle").textContent = `주 ${info.hours_declared}시간${info.homeroom?` · 표시 교실/담임 ${info.homeroom}`:""}`;
    content.innerHTML = `
      <section class="card">
        <div class="card-title"><h3>🗓 ${escapeHtml(name)} 선생님 시간표</h3><span>주 ${info.hours_declared}시간</span></div>
        ${scheduleTable(info,true)}
        <div class="free-line"><strong>공강</strong>　${freeLine(info)}</div>
      </section>`;
    return;
  }

  const common = commonFree(names);
  el("pageTitle").textContent = `선택 교사 ${names.length}명 공강 비교`;
  el("pageSubTitle").textContent = names.join(" · ");

  content.innerHTML = `
    <section class="card">
      <div class="card-title"><h3>↔ 공통 공강시간</h3><span>선택한 모든 교사가 동시에 수업이 없는 시간</span></div>
      <div class="compare-grid">
        <div class="metric">
          <small>공통 공강</small>
          <strong>주 ${common.length}교시</strong>
          <div class="day-lines">${daySummary(common)}</div>
        </div>
        <div>${commonTable(common)}</div>
      </div>
    </section>

    ${busyFinder(names)}

    <section class="card">
      <div class="card-title"><h3>선택 교사별 시간표</h3><span>${names.length}명</span></div>
      <div class="teacher-details">
        ${names.map(name=>{
          const info = state.teachers[name];
          return `<details class="teacher-card">
            <summary>${escapeHtml(name)} · 주 ${info.hours_declared}시간</summary>
            <div class="inner">${scheduleTable(info,true)}</div>
          </details>`;
        }).join("")}
      </div>
    </section>`;

  el("busyFindBtn").addEventListener("click", runBusyFinder);
  runBusyFinder();
}

function downloadCsv(){
  const names = [...state.selected];
  if(!names.length) return;

  const rows = [["교사","요일","교시","수업"]];
  names.forEach(name=>{
    const info = state.teachers[name];
    DAYS.forEach(day=>{
      PERIODS.forEach(period=>{
        rows.push([name,day,period,compactCell(info.schedule[day][period]) || "공강"]);
      });
    });
  });

  const csv = "\uFEFF" + rows.map(row=>row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "교사시간표.csv"; a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(v){
  const s = String(v ?? "");
  return `"${s.replaceAll('"','""')}"`;
}

function escapeHtml(v){
  return String(v ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

el("teacherSearch").addEventListener("input", renderTeacherGrid);
el("clearBtn").addEventListener("click", ()=>{
  state.selected.clear();
  renderTeacherGrid();
  renderMain();
});
el("csvBtn").addEventListener("click", downloadCsv);
el("pdfUpload").addEventListener("change", e=>uploadPdf(e.target.files?.[0]));
el("useDefaultBtn").addEventListener("click", loadDefault);

loadDefault();
