const KEY="next-feed-v1";
const defaults={basis:"finish",min:2.5,max:3,goal:8,feeds:[],active:null};

let state=load();
const $=id=>document.getElementById(id);

function load(){try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||"{}")}}catch{return {...defaults}}}
function save(){localStorage.setItem(KEY,JSON.stringify(state))}
function fmtTime(ts){return new Date(ts).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}
function fmtDate(ts){return new Date(ts).toLocaleDateString([], {month:"short",day:"numeric"})}
function mins(v){return v*60}
function durationText(ms){let m=Math.round(ms/60000); return m<60?`${m} min`:`${Math.floor(m/60)}h ${m%60}m`}
function todayFeeds(){
  const now=new Date(); return state.feeds.filter(f=>{const d=new Date(f.start);return d.toDateString()===now.toDateString()})
}
function setOptions(id,values,selected){
  const el=$(id); el.innerHTML=values.map(v=>`<option value="${v}">${v}h</option>`).join("");
  el.value=selected;
}
function setupUI(){
  $("intervalBasis").value=state.basis;
  $("minHours").value=state.min;
  $("maxHours").value=state.max;
  $("dailyGoal").value=state.goal;
  $("settingsBasis").value=state.basis;
  setOptions("settingsMin",[2,2.5,3,3.5],state.min);
  setOptions("settingsMax",[2.5,3,3.5,4],state.max);
  $("settingsGoal").value=state.goal;
  $("goalText").textContent=`Goal: ${state.goal}–12`;
  $("todayDate").textContent=new Date().toLocaleDateString([], {month:"short",day:"numeric"});
}
function render(){
  setupUI();
  const today=todayFeeds();
  $("feedCount").textContent=today.length;
  $("lastFinished").textContent=state.feeds.length?fmtTime(state.feeds[state.feeds.length-1].finish):"—";
  $("lastDuration").textContent=state.feeds.length?durationText(state.feeds[state.feeds.length-1].finish-state.feeds[state.feeds.length-1].start):"—";
  renderHistory();
  if(state.active) showActive(); else {$("activeCard").classList.add("hidden"); renderNext();}
}
function renderHistory(){
  const rows=todayFeeds().slice().reverse();
  $("history").innerHTML=rows.length?rows.map((f,i)=>`
    <div class="history-row">
      <div><b>Feed #${todayFeeds().length-i}</b><small>${fmtTime(f.start)} → ${fmtTime(f.finish)} · ${durationText(f.finish-f.start)}</small></div>
      <div>${f.amount?f.amount+" mL":"—"}</div>
    </div>`).join(""):`<div class="muted">No completed feedings today.</div>`;
}
function nextWindow(){
  if(!state.feeds.length)return null;
  const last=state.feeds[state.feeds.length-1];
  const base=state.basis==="finish"?last.finish:last.start;
  return {lo:base+mins(state.min)*60000,hi:base+mins(state.max)*60000};
}
function renderNext(){
  const w=nextWindow();
  if(!w){$("nextWindow").textContent="Start a feeding to begin";$("countdown").textContent="—";$("lastInfo").textContent="No feeding recorded yet.";return}
  $("nextWindow").textContent=`${fmtTime(w.lo)} – ${fmtTime(w.hi)}`;
  $("lastInfo").textContent=`Last feeding finished ${fmtTime(state.feeds[state.feeds.length-1].finish)}`;
  updateCountdown();
}
function updateCountdown(){
  const w=nextWindow(); if(!w)return;
  const now=Date.now();
  if(now<w.lo)$("countdown").textContent=`Starts in ${durationText(w.lo-now)}`;
  else if(now<=w.hi)$("countdown").textContent=`Feeding window is open`;
  else $("countdown").textContent=`${durationText(now-w.hi)} past the end of your target window`;
}
function showActive(){
  $("activeCard").classList.remove("hidden");
  $("feedNumber").textContent=`Feeding #${todayFeeds().length+1}`;
  $("startBtn").classList.add("hidden");
  document.querySelectorAll(".step").forEach(b=>b.classList.toggle("done",!!state.active.steps[b.dataset.step]));
  $("amount").value=state.active.amount||"";
  updateElapsed();
}
function updateElapsed(){
  if(!state.active)return;
  $("elapsed").textContent=durationText(Date.now()-state.active.start);
}
$("startBtn").onclick=()=>{
  if(state.active)return;
  state.active={start:Date.now(),steps:{nurse:false,pump:false,syringe:false},amount:""};
  save(); render();
};
document.querySelectorAll(".step").forEach(b=>b.onclick=()=>{
  if(!state.active)return;
  const k=b.dataset.step; state.active.steps[k]=!state.active.steps[k]; save(); showActive();
});
$("finishBtn").onclick=()=>{
  if(!state.active)return;
  const finish=Date.now();
  state.feeds.push({start:state.active.start,finish,steps:state.active.steps,amount:$("amount").value.trim()});
  state.active=null; save(); render();
};
$("settingsBtn").onclick=()=>{
  $("homeView").classList.add("hidden");$("settingsView").classList.remove("hidden");
  $("settingsBasis").value=state.basis;$("settingsMin").value=state.min;$("settingsMax").value=state.max;$("settingsGoal").value=state.goal;
};
$("closeSettings").onclick=()=>{$("settingsView").classList.add("hidden");$("homeView").classList.remove("hidden");render()};
$("saveSettings").onclick=()=>{
  state.basis=$("intervalBasis").value;state.min=Number($("minHours").value);state.max=Number($("maxHours").value);state.goal=Number($("dailyGoal").value);
  if(state.min>state.max){alert("Minimum interval must be less than or equal to maximum.");return}
  save();$("setupCard").classList.add("hidden");render();
};
$("settingsBasis").onchange=e=>{state.basis=e.target.value;save();render()};
$("settingsMin").onchange=e=>{state.min=Number(e.target.value);save();render()};
$("settingsMax").onchange=e=>{state.max=Number(e.target.value);save();render()};
$("settingsGoal").onchange=e=>{state.goal=Number(e.target.value);save();render()};
$("resetBtn").onclick=()=>{
  if(confirm("Delete all feeding history and reset the app?")){state={...defaults,feeds:[]};save();render();$("settingsView").classList.add("hidden");$("homeView").classList.remove("hidden")}
};
if(!localStorage.getItem(KEY))$("setupCard").classList.remove("hidden");
setInterval(()=>{if(state.active)updateElapsed();else updateCountdown()},1000);
render();
if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
