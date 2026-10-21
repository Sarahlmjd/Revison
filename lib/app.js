// Interface de l'appli (reprise de la version Claude), branchée sur Supabase par la page.
import * as P from "./planner";

let started = false;

/**
 * Démarre l'appli dans la page.
 * @param {{initial: object|null, store: {load: () => Promise<object|null>, save: (s: object) => Promise<void>}, icsUrl: string}} opts
 */
export function startApp({ initial, store, icsUrl, onSignOut }) {
  if (started) return;
  started = true;

const ICO={
  today:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  semaine:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  chapitres:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h10.5a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10.5"/></svg>',
  bilan:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  reglages:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>'
};
const TABS=[{k:"today",t:"Quêtes"},{k:"semaine",t:"Semaine"},{k:"chapitres",t:"Carte"},{k:"bilan",t:"Bilan"},{k:"reglages",t:"Réglages"}];
const SUBS={matieres:"Matières et coefficients",contraintes:"Contraintes de la semaine",temps:"Temps réel disponible",repartition:"Répartition des heures"};
const MOMENT={r:"☀︎ Début de matinée",y:"◑ Fin de matinée ou fin d'après-midi",g:"◐ Début d'après-midi"};
const CTYPES={cours:"Cours / TD / exam",transport:"Transport",obligation:"Obligation (travail, sport, famille…)"};
const uid=()=>Math.random().toString(36).slice(2,9);

function defaults(){
  return {
    v:1, step:0,
    subjects:[
      {id:uid(),name:"Psychologie cognitive",diff:"y",coef:5,manual:null,exam:false},
      {id:uid(),name:"Psychologie du développement",diff:"y",coef:5,manual:null,exam:false},
      {id:uid(),name:"Psychologie sociale",diff:"y",coef:5,manual:null,exam:false},
      {id:uid(),name:"Psychopathologie",diff:"y",coef:5,manual:null,exam:false},
      {id:uid(),name:"Statistiques",diff:"y",coef:2.3,manual:null,exam:false},
      {id:uid(),name:"Méthodologie",diff:"y",coef:2.3,manual:null,exam:false},
      {id:uid(),name:"Neurosciences fonctionnelles",diff:"y",coef:2.3,manual:null,exam:false},
      {id:uid(),name:"Connaissance de la pratique",diff:"y",coef:3,manual:null,exam:false}
    ],
    listed:{},
    chapters:[],
    constraints:[],
    avail:[190,150,90,150,90,360,120],
    availExample:true,
    examBoost:120,
    plan:null,
    timer:null
  };
}
let S=Object.assign(defaults(),initial||{});
S.tab="today";S.sub=null;

/* ---------- stockage : Supabase (via l'adaptateur fourni par la page) + copie locale ---------- */
const LS="plan-revision-v1";
let saveT=null, lastSaved="", dirty=false;
function setSave(t){saveTxt=t;for(const id of ["saveState","saveState2"]){const el=document.getElementById(id);if(el)el.textContent=id==="saveState2"?"Synchronisation : "+t:t}}
let saveTxt="";
function adopt(str){S=Object.assign(defaults(),JSON.parse(str));lastSaved=str;try{localStorage.setItem(LS,str)}catch(e){}render();setSave("à jour")}
function save(){
  try{localStorage.setItem(LS,JSON.stringify(S))}catch(e){}
  clearTimeout(saveT);
  setSave("enregistrement…"); dirty=true;
  saveT=setTimeout(async()=>{
    const str=JSON.stringify(S); lastSaved=str;
    try{await store.save(S);setSave("enregistré")}
    catch(e){setSave("pas de connexion : enregistré sur cet appareil")}
    dirty=false;
  },700);
}
/* au retour sur l'appli (autre appareil entre-temps), on recharge la dernière version */
async function refresh(){
  if(dirty||!document.getElementById("modal").hidden)return;
  try{const st=await store.load();if(st){const str=JSON.stringify(st);if(str!==lastSaved&&str!==JSON.stringify(S))adopt(str)}}catch(e){}
}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")refresh()});
setInterval(refresh,60000);
lastSaved=JSON.stringify(S);

/* ---------- helpers ---------- */
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function fmt(m){m=Math.max(0,Math.round(m));const h=Math.floor(m/60),mm=m%60;if(!h)return mm+" min";return h+" h"+(mm?" "+String(mm).padStart(2,"0"):"")}
const r15=m=>Math.round(m/15)*15;
const budget=()=>P.budget(S);
const toMin=P.toMin;
const subj=id=>S.subjects.find(s=>s.id===id);
 const {CST,DAYS,DIFF_RANK,DIFF_MULT,BLOCK,PAUSE,workOf,addDays}=P;
const ORDER=["decouverte","arevoir","apprentissage","maitrise"];
const SHORT={decouverte:"pas encore compris",arevoir:"moins de 70 %",apprentissage:"70 à 90 %",maitrise:"plus de 90 %, sans hésiter"};
/* ---------- jeu : XP (1 XP = 1 minute travaillée), niveaux de 500 XP, série de jours ---------- */
const LVL=500;
function gameLog(){
  if(!Array.isArray(S.log)){S.log=[];chaps().forEach(c=>(c.hist||[]).forEach(d=>S.log.push({d,m:50})))}
  return S.log;
}
function logAdd(x,m){gameLog().push({d:todayISO(),m:Math.max(0,Math.round(m)),sid:x.id})}
function logDrop(sid){S.log=gameLog().filter(e=>e.sid!==sid)}
function game(){
  const L=gameLog(), xp=L.reduce((t,e)=>t+(e.m||0),0), days=new Set(L.map(e=>e.d));
  let d=todayISO(); if(!days.has(d))d=addDays(d,-1);
  let streak=0; while(days.has(d)){streak++;d=addDays(d,-1)}
  return {xp,level:Math.floor(xp/LVL)+1,inLvl:xp%LVL,streak,today:days.has(todayISO())};
}
const FLAME='<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6c0 2 1 3 2 3c0-4-1-6 1-9z" fill="currentColor"/></svg>';
const RIPPLE=(cls)=>`<svg class="${cls}" viewBox="-10 -30 440 440" aria-hidden="true"><g fill="none" stroke-width="12"><circle cx="200" cy="200" r="28"/><circle cx="206" cy="195" r="60"/><circle cx="212" cy="190" r="92"/><circle cx="218" cy="185" r="124"/><circle cx="224" cy="180" r="156"/><circle cx="230" cy="175" r="188"/></g></svg>`;
function hud(){
  const g=game();
  return `<header class="hud">
    <div class="lvl" aria-label="Niveau ${g.level}">${g.level}</div>
    <div class="xp"><div class="xp-t"><span>NIV. ${g.level}</span><span>${g.inLvl}/${LVL} XP</span></div><div class="xp-bar"><i style="width:${Math.round(g.inLvl/LVL*100)}%"></i></div></div>
    <div class="streak ${g.today?"":"dim"}" aria-label="Série de ${g.streak} jour${g.streak>1?"s":""}">${FLAME}<b>${g.streak}</b></div>
  </header>`;
}
const stageBox=cur=>`<div class="stagebox opts" role="radiogroup" aria-label="Où en es-tu ?">${ORDER.map(k=>`<button type="button" class="opt ${k===cur?"on":""}" data-cst="${k}" role="radio" aria-checked="${k===cur}"><b>${CST[k].t}</b><span>${SHORT[k]}</span></button>`).join("")}</div>`;
const fmtT=m=>Math.floor(m/60)+" h "+String(m%60).padStart(2,"0");
const todayISO=()=>P.localToday();
const mondayISO=()=>P.mondayOf(todayISO());
const frDate=d=>d?new Date(d+"T12:00:00").toLocaleDateString("fr-FR",{day:"numeric",month:"short"}):"";
const chaps=()=>S.chapters||(S.chapters=[]);
function alertOf(c,ref){ref=ref||todayISO();if(c.status==="pas"||!c.next)return"pas";if(c.next<ref)return"late";if(c.next===ref)return"due";if(c.next<=addDays(ref,3))return"soon";return"ok"}
const AL_TODAY={late:"En retard",due:"Aujourd'hui",soon:"Bientôt",ok:"OK",pas:"Pas commencé"};
const AL_SESS={late:"en retard",due:"révision prévue",soon:"révision",ok:"consolidation",pas:"à commencer"};
function stagePill(c,ref){const k=alertOf(c,ref);const t=c.status==="pas"?"à commencer":CST[c.status].t.toLowerCase();return `<span class="al st-${c.status}">${t}</span>${c.status!=="pas"&&c.status!=="decouverte"&&k==="late"?` <span class="al late">en retard</span>`:""}`}
function chapLine(x,i){const c=x.chapId&&chaps().find(c=>c.id===x.chapId);if(!c)return"";const K={quick:"test rapide",relearn:"à réapprendre",disc:"suite de la découverte",new:"nouveau chapitre",ahead:"en avance"};return `<div class="chap">→ ${esc(c.name)} ${stagePill(c,addDays(S.plan.weekStart||mondayISO(),i))}${x.status==="todo"&&K[x.kind]?` <span class="al">${K[x.kind]}</span>`:""}</div>`}
const pmBlocked=d=>S.constraints.some(c=>c.day===d&&toMin(c.start)<=14*60&&toMin(c.end)>=15*60);

const volumes=()=>P.volumes(S);

const planWeek=()=>P.planWeek(S,todayISO());
function generatePlan(fresh){if(fresh)S.plan=null;planWeek()}

/* ---------- render ---------- */
function renderSteps_unused(){
  const nav=document.getElementById("steps");
  nav.innerHTML=STEPS.map((s,i)=>`<button class="step-btn" data-go="${i}" ${i===S.step?'aria-current="step"':""}><span class="n">${i+1}</span>${s.t}</button>`).join("");
  const cur=nav.querySelector('[aria-current]'); if(cur) nav.scrollLeft=Math.max(0,cur.offsetLeft-nav.clientWidth/2+cur.offsetWidth/2);
}
function renderBudget(){
  if(!document.getElementById("budgetTxt"))return;
  const V=volumes(),B=budget();
  const placed=Object.values(V).reduce((a,v)=>a+v.mins,0);
  document.getElementById("budgetTxt").textContent=fmt(placed)+" / "+fmt(B);
  document.getElementById("budgetBar").style.width=(B?Math.min(100,placed/B*100):0)+"%";
}
function idea(tag,html){return `<div class="idea"><span class="tag">${tag}</span><p>${html}</p></div>`}
function nav(){
  return S.tab==="reglages"&&S.sub?`<div class="nav"><button class="btn ghost" data-sub="">← Réglages</button></div>`:"";
}
function diffDots(s){return `<div class="diff" role="group" aria-label="Difficulté">${["r","y","g"].map(d=>`<button class="dot" data-d="${d}" data-diff="${s.id}" aria-pressed="${s.diff===d}" title="${{r:"Difficile",y:"Moyenne",g:"Facile"}[d]}"><i></i></button>`).join("")}</div>`}

function sessCard(o,opts){
  const {x,a,w}=o, s=subj(x.subjId), c=x.chapId&&chaps().find(c=>c.id===x.chapId);
  const K={quick:"Défi éclair",relearn:"À réapprendre",disc:"Suite de la découverte",new:"Nouveau chapitre",ahead:"En avance",review:"Révision"};
  const running=S.timer&&S.timer.sid===x.id&&S.timer.phase==="work";
  const xp=workOf(x.mins);
  const st=x.status==="done"?"Fait":x.status==="partial"?"Pas fini":x.status==="skipped"?"Pas fait":"";
  if(opts.hero){
    const lv=c?Math.max(0,ORDER.indexOf(c.status)+1):0;
    return `<article class="quest">
      <div class="quest-top"><span>${fmtT(a)} → ${fmtT(w)}${K[x.kind]?" · "+K[x.kind]:""}</span><b>+${xp} XP</b></div>
      <h3>${esc(s.name)}</h3>
      ${c?`<p class="quest-chap">${esc(c.name)}</p>
      <div class="lvbar"><span aria-hidden="true">${[1,2,3,4].map(n=>`<i class="${n<=lv?"on":""}"></i>`).join("")}</span>Niveau ${lv}/4 · ${c.status==="pas"?"à commencer":CST[c.status].t.toLowerCase()}${alertOf(c)==="late"&&c.status!=="decouverte"?" · en retard":""}</div>`:""}
      ${running?`<button class="btn primary big" data-focus>Reprendre le minuteur</button>`:`<button class="btn primary big" data-start="${x.id}">JOUER · ${fmt(xp).toUpperCase()}</button>`}
      <div class="quest-sub"><button class="btn ghost" data-done="${x.id}">Déjà fait</button><button class="btn ghost" data-skip="${x.id}">Pas fait</button></div>
    </article>`;
  }
  const tone={r:"t-rose",y:"t-lav",g:"t-cream"}[s.diff]||"t-lav";
  return `<div class="qrow ${x.status}">
      <span class="qtime ${tone}">${fmtT(a)}</span>
      <div class="qmain"><b>${esc(s.name)}</b>${c||st?`<small>${c?esc(c.name):""}${c&&st?" · ":""}${st}</small>`:""}</div>
      ${x.status==="todo"?`<span class="qxp">+${xp}</span><button class="ic" data-done="${x.id}" aria-label="Marquer comme fait"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`:`<button class="ic" data-undo="${x.id}" aria-label="Remettre à faire"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9h11a5 5 0 0 1 0 10H8M4 9l4-4M4 9l4 4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`}
    </div>`;
}
const short=n=>n.replace(/^Psychologie (du |de la |)/,"").replace(/^./,c=>c.toUpperCase()).replace("Neurosciences fonctionnelles","Neurosciences").replace("Connaissance de la pratique","Pratique");
const views={
today(){
  planWeek();
  const td=(new Date().getDay()+6)%7, L=P.dayLayout(S,td);
  const todo=L.filter(o=>o.x.status==="todo"), fin=L.filter(o=>o.x.status!=="todo");
  const late=chaps().filter(c=>alertOf(c)==="late").length;
  const dl=new Date().toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"}).replace(/\./g,"").toUpperCase();
  const tmr=td<6?P.dayLayout(S,td+1).filter(o=>o.x.status==="todo"):[];
  return `<section class="today">
    ${RIPPLE("ripple")}
    ${hud()}
    <p class="kicker">${dl}${L.length?` · QUÊTE ${Math.min(fin.length+1,L.length)}/${L.length}`:""}</p>
    <h2 class="mega">QUÊTES<br>DU J<span>O</span>UR</h2>
    ${L.length?`<div class="segs" role="progressbar" aria-valuenow="${fin.length}" aria-valuemin="0" aria-valuemax="${L.length}" aria-label="${fin.length} quêtes sur ${L.length}">${L.map(o=>`<i class="${o.x.status==="todo"?"":"on"}"></i>`).join("")}</div>`:""}
    ${todo.length?sessCard(todo[0],{hero:true}):L.length?`<div class="win"><b>Toutes les quêtes sont faites.</b><span>Soirée libre méritée.</span></div>`:`<div class="empty">Pas de quête aujourd'hui. Repos.</div>`}
    ${todo.length>1?`<h3 class="sec">Ensuite</h3><div class="qrows">${todo.slice(1).map(o=>sessCard(o,{})).join("")}</div>`:""}
    ${fin.length?`<details class="donebox" ${todo.length?"":"open"}><summary><h3 class="sec">Terminées (${fin.length})</h3></summary><div class="qrows">${fin.map(o=>sessCard(o,{})).join("")}</div></details>`:""}
    ${late?`<button class="latebar" data-tab="chapitres">${late} chapitre${late>1?"s":""} en retard · ${late>1?"ils passent":"il passe"} en premier →</button>`:""}
    ${tmr.length?`<p class="muted small tomorrow">Demain : ${tmr.slice(0,3).map(o=>esc(subj(o.x.subjId).name)).join(", ")}${tmr.length>3?"…":""}</p>`:""}
  </section>`;
},
chapitres(){
  const subs=S.subjects.filter(s=>s.name.trim()&&chaps().some(c=>c.subjId===s.id)||s.id===S.mapSubj);
  const all=S.subjects.filter(s=>s.name.trim());
  if(!S.mapSubj||!all.some(s=>s.id===S.mapSubj)){const lateS=all.find(s=>chaps().some(c=>c.subjId===s.id&&alertOf(c)==="late"));S.mapSubj=(lateS||subs[0]||all[0]||{}).id}
  const sj=subj(S.mapSubj), cs=sj?chaps().filter(c=>c.subjId===sj.id):[];
  const td=(new Date().getDay()+6)%7, here=new Set((S.plan?S.plan.sessions:[]).filter(x=>x.day===td&&x.chapId).map(x=>x.chapId));
  const mast=cs.filter(c=>c.status==="maitrise").length, disc=cs.filter(c=>c.status==="decouverte").length;
  const STEP=118, H=cs.length*STEP+10;
  const X=i=>i%2?72:28, Y=i=>i*STEP+40;
  let path="";cs.forEach((c,i)=>{if(i)path+=` C${X(i-1)} ${Y(i-1)+STEP/2} ${X(i)} ${Y(i)-STEP/2} ${X(i)} ${Y(i)}`;else path=`M${X(0)} ${Y(0)}`});
  const lastDone=cs.reduce((k,c,i)=>c.status!=="pas"?i:k,-1);
  let donePath="";cs.forEach((c,i)=>{if(i>lastDone)return;if(i)donePath+=` C${X(i-1)} ${Y(i-1)+STEP/2} ${X(i)} ${Y(i)-STEP/2} ${X(i)} ${Y(i)}`;else donePath=`M${X(0)} ${Y(0)}`});
  const icon=c=>c.status==="maitrise"?'<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>':c.status==="pas"?'<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="6" y="11" width="12" height="9" rx="2" fill="currentColor"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>':`<b>${ORDER.indexOf(c.status)+1}</b>`;
  return `<section class="mapview">
    <h2 class="mega small">LA CARTE</h2>
    <div class="chips" role="tablist" aria-label="Matières">${all.map(s=>{const n=chaps().filter(c=>c.subjId===s.id&&alertOf(c)==="late").length;return `<button role="tab" class="chip ${s.id===S.mapSubj?"on":""}" aria-selected="${s.id===S.mapSubj}" data-mapsubj="${s.id}">${esc(short(s.name))}${n?` <i class="dotlate" aria-label="${n} en retard"></i>`:""}</button>`}).join("")}</div>
    <p class="muted small">${cs.length?`${mast} maîtrisé${mast>1?"s":""} sur ${cs.length}${disc?` · ${disc} en découverte`:""}`:"Aucun chapitre dans cette matière pour l'instant."}</p>
    ${cs.length?`<div class="map" style="height:${H}px">
      <svg class="map-path" viewBox="0 0 100 ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${path}" class="p-todo"/>${donePath?`<path d="${donePath}" class="p-done"/>`:""}</svg>
      ${cs.map((c,i)=>{const k=alertOf(c),left=!(i%2);return `<div class="mrow" style="top:${Y(i)-30}px">
        <button class="mnode st-${c.status} ${here.has(c.id)?"here":""}" style="left:${X(i)}%" data-opench="${c.id}" aria-label="${esc(c.name)} : ${c.status==="pas"?"pas commencé":CST[c.status].t}">${icon(c)}</button>
        ${here.has(c.id)?`<span class="here-tag" style="left:${X(i)}%">AUJOURD'HUI</span>`:""}
        <div class="mlabel ${left?"l":"r"}"><b>${esc(c.name)}</b><small class="${k==="late"&&c.status!=="pas"?"late":""}">${c.status==="pas"?"à commencer":CST[c.status].t.toLowerCase()+(c.next?` · ${k==="late"?"en retard":"revu le "+frDate(c.next)}`:"")}</small></div>
      </div>`}).join("")}
    </div>`:""}
    ${sj?`<div class="chadd"><input id="nc-${sj.id}" placeholder="Nouveau chapitre en ${esc(short(sj.name))}" aria-label="Nouveau chapitre"><button class="btn primary" data-addch="${sj.id}">Ajouter</button></div>`:""}
    <details class="mini how"><summary><b>Comment marchent les niveaux</b></summary>
      <p class="small">Après chaque séance, fais le défi feuille blanche (cours fermé, tu écris tout ce que tu sais).</p>
      <p class="small"><b>1 · Découverte</b> : pas encore compris, revu le lendemain. <b>2 · À revoir</b> : moins de 70 %, revu dans 2 jours. <b>3 · Apprentissage</b> : 70 à 90 %, revu dans 5 jours. <b>4 · Maîtrisé</b> : plus de 90 % sans hésiter, revu dans 14 jours.</p>
      <p class="small">Tant qu'un chapitre est en découverte, l'appli ne t'en fait pas commencer un autre dans la même matière.</p>
    </details>
  </section>`;
},
reglages(){
  const V=volumes(),B=budget(),placed=Object.values(V).reduce((a,v)=>a+v.mins,0);
  const row=(k,sub)=>`<button class="setrow" data-sub="${k}"><span><b>${SUBS[k]}</b><small>${sub}</small></span><span aria-hidden="true">›</span></button>`;
  return `<section class="panel">
    <h2>Réglages</h2>
    <div class="setlist">
      ${row("matieres",`${S.subjects.filter(s=>s.name.trim()).length} matières`)}
      ${row("contraintes",`${S.constraints.length} contrainte${S.constraints.length>1?"s":""}`)}
      ${row("temps",`${fmt(B)} par semaine`)}
      ${row("repartition",`${fmt(placed)} réparties`)}
    </div>
    <div class="setlist">
      <label class="setrow" for="dayStart2"><span><b>Je commence à</b><small>Heure de ta première session</small></span><input type="time" id="dayStart2" data-daystart value="${esc(S.dayStart||"09:00")}" step="300"></label>
      <button class="setrow" data-cal><span><b>Calendrier</b><small>Ajouter ton planning à ton calendrier</small></span><span aria-hidden="true">›</span></button>
    </div>
    <div class="setlist"><button class="setrow danger" data-signout><span><b>Se déconnecter</b></span></button></div>
    <p class="muted small" id="saveState2"></p>
  </section>`;
},
matieres(){
  const L=S.listed;
  return `<section class="panel">
    <h2>Matières et coefficients</h2>
    ${idea("Le socle","<b>Matière · Difficulté · Coefficient.</b> Un tableau simple pour tout voir d'un coup. Tout le reste se construit dessus.")}
    <div class="legend"><span><i class="pip r"></i>Difficile pour toi</span><span><i class="pip y"></i>Moyenne</span><span><i class="pip g"></i>Facile</span><span>★ Compte pour ton master</span></div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Matière</th><th>Difficulté</th><th class="num">Coef</th><th>Master</th><th></th></tr></thead>
      <tbody>${S.subjects.map(s=>`<tr>
        <td><input class="name-in" id="n-${s.id}" data-name="${s.id}" value="${esc(s.name)}" placeholder="Nom de la matière" aria-label="Nom"></td>
        <td>${diffDots(s)}</td>
        <td class="num"><input class="coef-in mono" id="c-${s.id}" data-coef="${s.id}" type="number" step="0.1" min="0" value="${s.coef===""?"":s.coef}" placeholder="–" aria-label="Coefficient"></td>
        <td><button class="chip ${s.master?"on":""}" data-master="${s.id}" aria-pressed="${!!s.master}">${s.master?"★ Oui":"Non"}</button></td>
        <td class="num"><button class="x" data-delsub="${s.id}" aria-label="Supprimer">×</button></td>
      </tr>`).join("")}</tbody>
    </table></div>
    <div class="row-actions"><button class="btn" data-addsub>+ Ajouter une matière</button></div>
    <div class="mini">
      <h3>Ne cache rien. Liste tout.</h3>
      <div class="checklist">${[["princ","Les matières principales"],["sec","Les matières secondaires"],["proj","Les projets (ex. l'interview de TD)"],["opt","Les options"],["conc","Les examens ou concours parallèles"],["sans","Même les matières sans coefficient"]].map(([k,t])=>`<label><input type="checkbox" id="l-${k}" data-listed="${k}" ${L[k]?"checked":""}> ${t}</label>`).join("")}</div>
      <p class="muted" style="font-size:.85rem;margin-top:6px">Pas de coefficient officiel ? Mets une <b>importance relative</b> de 1 à 5, ou laisse vide et c'est la difficulté qui départage.</p>
    </div>
    ${nav()}
  </section>`;
},
contraintes(){
  const C=S.constraints;
  const H0=7,H1=23,PX=400/(H1-H0);
  const cols=DAYS.map((d,i)=>`<div class="col">${C.filter(c=>c.day===i).map(c=>{
    const a=Math.max(H0*60,toMin(c.start)),b=Math.min(H1*60,toMin(c.end)); if(b<=a)return"";
    return `<div class="blk ${c.type}" style="top:${(a/60-H0)*PX}px;height:${Math.max(16,(b-a)/60*PX)}px" title="${esc(c.label||CTYPES[c.type])} ${c.start}–${c.end}">${esc(c.label||CTYPES[c.type].split(" ")[0])}<button data-delc="${c.id}" aria-label="Supprimer">×</button></div>`}).join("")}</div>`).join("");
  const hrs=[];for(let h=H0;h<=H1;h+=2)hrs.push(`<span style="top:${(h-H0)*PX}px">${h}h</span>`);
  return `<section class="panel">
    <h2>Contraintes de la semaine</h2>
    ${idea("Emploi du temps vierge","<b>Ce qui ne bouge pas, on le pose d'abord.</b> Le travail perso vient seulement dans ce qui reste.")}
    <div class="cards3">
      <div class="mini"><h3>Les cours</h3><p class="muted">Cours, TD, TP, examens. Hachurés : créneaux indisponibles.</p></div>
      <div class="mini"><h3>Les transports</h3><p class="muted">Aller et retour. Un trajet sert à une tâche légère, pas à du travail profond.</p></div>
      <div class="mini"><h3>Les obligations récurrentes</h3><p class="muted">Travail, sport, famille, repas, récupération.</p></div>
    </div>
    <form class="add-c" id="addC">
      <label>Jour<select id="cDay">${DAYS.map((d,i)=>`<option value="${i}">${d}</option>`).join("")}</select></label>
      <label>Type<select id="cType">${Object.entries(CTYPES).map(([k,v])=>`<option value="${k}">${v}</option>`).join("")}</select></label>
      <label>Début<input type="time" id="cStart" value="09:00" step="900"></label>
      <label>Fin<input type="time" id="cEnd" value="12:00" step="900"></label>
      <label>Nom (facultatif)<input id="cLabel" placeholder="ex. sport, famille"></label>
      <button class="btn primary" type="submit">Ajouter</button>
    </form>
    ${C.length?`<div class="tbl-wrap"><div class="week"><div></div>${DAYS.map(d=>`<div class="hd">${d.slice(0,3)}</div>`).join("")}<div class="hrs">${hrs.join("")}</div>${cols}</div></div>`
      :`<div class="empty">Ta semaine est encore vide. Ajoute d'abord tes cours, puis tes trajets, puis tes heures de travail et tes obligations.</div>`}
    ${nav()}
  </section>`;
},
temps(){
  const free=DAYS.map((d,i)=>{let busy=0;S.constraints.filter(c=>c.day===i).forEach(c=>busy+=Math.max(0,Math.min(23*60,toMin(c.end))-Math.max(7*60,toMin(c.start))));return Math.max(0,16*60-busy)});
  return `<section class="panel">
    <h2>Temps réel disponible</h2>
    <div class="qq">
      <div class="q bad"><span class="k">Idéal</span><p class="t">« Combien d'heures devrais-je idéalement travailler ? »</p><p class="muted" style="font-size:.88rem">Fabrique le planning parfait que tu abandonnes en deux jours.</p></div>
      <div class="q good"><span class="k">Réel</span><p class="t">« Combien d'heures suis-je réellement capable de travailler cette semaine ? »</p><p style="font-size:.88rem">Fabrique le planning que tu peux tenir. <b>Le seul qui compte.</b></p></div>
    </div>
    ${S.availExample?`<p class="example">Valeurs d'exemple (celles de la vidéo). Remplace-les par les tiennes.</p>`:""}
    <div class="days">${DAYS.map((d,i)=>`<div class="day">
      <b>${d}</b>
      <span class="hint">${S.constraints.length?`${fmt(free[i])} libres hors contraintes (7h–23h). Ton temps réel sera plus bas.`:""}</span>
      <div class="stepper"><button data-av="${i}" data-dv="-15" aria-label="Moins 15 minutes">−</button><output class="mono">${fmt(S.avail[i])}</output><button data-av="${i}" data-dv="15" aria-label="Plus 15 minutes">+</button></div>
    </div>`).join("")}</div>
    <div class="total"><b>Total hebdomadaire</b><span class="mono">${fmt(budget())}</span></div>
    <p class="muted" style="font-size:.9rem">Ton budget de la semaine. Pas ta note, pas ton niveau : ce que tu peux distribuer.</p>
    <details class="mini"><summary><b>Le piège du planning idéal</b></summary>
      <ol style="margin:8px 0 0;padding-left:20px;display:flex;flex-direction:column;gap:2px">
        <li>Tu prévois trop.</li><li>Tu n'arrives pas à suivre.</li><li>Tu prends du retard.</li><li>Tu perds confiance dans ton planning.</li><li>Tu conclus que tu manques de discipline <i>(faux)</i>.</li><li>Tu refais un planning encore plus ambitieux… et le cycle recommence.</li>
      </ol></details>
    ${nav()}
  </section>`;
},
repartition(){
  const V=volumes(),B=budget();
  const placed=Object.values(V).reduce((a,v)=>a+v.mins,0);
  const subs=S.subjects.filter(s=>s.name.trim());
  const maxM=Math.max(1,...subs.map(s=>(V[s.id]||{}).mins||0));
  return `<section class="panel">
    <h2>Répartition des heures</h2>
    ${idea("Règle","<b>Le coefficient prime.</b> La difficulté départage, et les matières ★ utiles pour ton master reçoivent un peu plus. Le total colle au budget réaliste, pas à un idéal.")}
    <div class="tbl-wrap"><table>
      <thead><tr><th>Matière</th><th>Diff.</th><th class="num">Coef</th><th>Examen proche</th><th class="num">Volume / sem</th></tr></thead>
      <tbody>${subs.map(s=>{const v=V[s.id]||{mins:0,boost:0};return `<tr>
        <td><b>${s.master?"★ ":""}${esc(s.name)}</b><div class="share"><i style="width:${v.mins/maxM*100}%"></i></div></td>
        <td><i class="pip ${s.diff}"></i></td>
        <td class="num mono">${s.coef===""||s.coef==null?"–":s.coef}</td>
        <td><button class="chip ${s.exam?"on":""}" data-exam="${s.id}" aria-pressed="${s.exam}">${s.exam?"✓ Oui":"Non"}</button> ${s.exam&&v.boost?`<span class="boost">+${fmt(v.boost)} temporaire</span>`:""}</td>
        <td class="num"><span class="vol"><button data-vol="${s.id}" data-dv="-15" aria-label="Moins">−</button><span class="mono">${fmt(v.mins)}</span><button data-vol="${s.id}" data-dv="15" aria-label="Plus">+</button></span>
          ${s.manual!=null?`<br><button class="chip man" data-auto="${s.id}">ajusté · revenir en auto</button>`:""}</td>
      </tr>`}).join("")}</tbody>
    </table></div>
    <div class="total"><b>Total hebdomadaire</b><span class="mono">${fmt(placed)}</span></div>
    ${placed>B?`<div class="warn">Tu dépasses ton budget de ${fmt(placed-B)}. Baisse une matière ajustée à la main : le total doit rester ${fmt(B)}.</div>`:`<div class="ok">Le total colle à ton budget réaliste (${fmt(B)}).</div>`}
    ${idea("Échéance","Un examen modifie <b>temporairement</b> l'importance d'une matière : elle reçoit plus d'heures, retirées aux autres. Le budget total reste identique. Pense à décocher « Examen proche » après l'épreuve.")}
    <label style="display:flex;gap:10px;align-items:center;font-size:.92rem">Bonus par examen proche
      <span class="stepper"><button data-boost="-30" aria-label="Moins">−</button><output class="mono">${fmt(S.examBoost)}</output><button data-boost="30" aria-label="Plus">+</button></span></label>
    ${nav()}
  </section>`;
},
semaine(){
  planWeek();
  const late=chaps().filter(c=>alertOf(c)==="late").length;
  const P=S.plan.sessions, today=(new Date().getDay()+6)%7;
  const isPast=i=>addDays(S.plan.weekStart||mondayISO(),i)<todayISO();
  const startM=toMin(S.dayStart||"09:00");
  const timesFor=(i,ss)=>{let t=startM;const cs=S.constraints.filter(c=>c.day===i);return ss.map(x=>{let moved=true;while(moved){moved=false;for(const c of cs){const a=toMin(c.start),b=toMin(c.end);if(t<b&&t+x.mins>a){t=b;moved=true}}}const r={a:t,w:t+workOf(x.mins),e:t+x.mins};t+=x.mins;return r})};
  const unplaced=P.filter(x=>x.day==null&&subj(x.subjId));
  return `<section class="panel">
    <h2>Ma semaine</h2>
    <details class="mini how"><summary><b>Comment ta semaine est calculée</b></summary>
    ${idea("Énergie","<b>Les créneaux où tu es la plus fraîche vont aux matières qui demandent le plus d'effort.</b> L'énergie n'est pas plate dans la journée.")}
    <div class="energy">
      <div><b>☀︎ Début de matinée</b><span class="muted">Ton meilleur moment.</span><span><i class="pip r"></i> Matières difficiles, exercices durs</span></div>
      <div><b>◑ Fin de matinée · fin d'après-midi</b><span class="muted">Énergie correcte.</span><span><i class="pip y"></i> Difficulté moyenne, applications</span></div>
      <div><b>◐ Début d'après-midi</b><span class="muted">Le moment où c'est le plus dur.</span><span><i class="pip g"></i> Matières faciles, fiches, relecture</span></div>
      <div><b>18 h · stop</b><span class="muted">Soirée libre, tous les jours.</span><span>Aucune révision après 18 h.</span></div>
    </div>
    <p class="muted" style="font-size:.88rem">Aujourd'hui est figé. Les jours suivants se recalculent tout seuls selon ce que tu as fait et où tu en es dans chaque chapitre. Une matière sans chapitre n'est pas planifiée.</p>
    ${idea("Règle d'or","<b>Le créneau est un mur.</b> Quand le minuteur sonne, tu t'arrêtes et tu passes à la suite, même si tu n'as pas fini.")}
    </details>
    ${new Set(S.subjects.map(s=>s.diff)).size===1?`<p class="example">Toutes tes matières sont en difficulté moyenne. Indique dans Réglages › Matières celles qui sont difficiles ou faciles pour toi : elles iront au bon moment de la journée.</p>`:""}
    ${late?`<div class="warn">${late} chapitre${late>1?"s":""} en retard : ${late>1?"ils passent":"il passe"} en premier, et aucun nouveau chapitre n'est ouvert tant que le retard n'est pas rattrapé.</div>`:""}
    <div class="plan">${DAYS.map((d,i)=>{const ss0=P.filter(x=>x.day===i&&subj(x.subjId)),bk=x=>x.blk||x.id,br={};ss0.forEach(x=>{const r=DIFF_RANK[subj(x.subjId).diff];br[bk(x)]=Math.min(br[bk(x)]??9,r)});
      const ss=ss0.slice().sort((a,b)=>(a.status==="todo")-(b.status==="todo")||br[bk(a)]-br[bk(b)]||(bk(a)<bk(b)?-1:bk(a)>bk(b)?1:0));const tot=ss.reduce((a,x)=>a+x.mins,0);const TM=timesFor(i,ss);
      return `<div class="pday ${i===today?"today":""}" ${i===today?'id="todayCard"':""}><header><h3>${d}${i===today?" · aujourd'hui":""}</h3><span class="mono">${fmt(tot)} / ${fmt(S.avail[i])}</span></header>
      ${ss.length?ss.map((x,j)=>{const s=subj(x.subjId),T=TM[j];return `<div class="sess ${x.status==="done"?"done":""} ${x.status==="skipped"?"skipped":""} ${x.status==="todo"&&isPast(i)?"past":""}"><span class="stripe ${s.diff}"></span>
        <div><div class="meta">${x.logged?"repris de ton tableau":`<span class="mono">${fmtT(T.a)} → ${fmtT(T.w)}</span> · ${fmt(workOf(x.mins))} + pause`}${x.extra?" · rattrapage":""}${T.e>18*60?` <span class="al late">après 18 h</span>`:""}</div><div class="nm">${esc(s.name)}</div>${chapLine(x,i)}${x.status==="partial"?`<div class="status partial">◐ pas fini</div>`:x.status==="done"?`<div class="status done">✓ fait</div>`:x.status==="skipped"?`<div class="status skipped">✕ pas fait</div>`:isPast(i)?`<div class="status partial">pas encore noté : fait ou pas fait ?</div>`:""}</div>
        <div class="acts">${x.status==="todo"?`${isPast(i)?"":`<button class="ic go" data-start="${x.id}" aria-label="Démarrer le créneau" title="Démarrer le créneau">▶</button>`}<button class="ic" data-done="${x.id}" aria-label="Marquer comme fait" title="Fait">✓</button><button class="ic" data-skip="${x.id}" aria-label="Pas fait" title="Pas fait">✕</button>`:`<button class="ic" data-undo="${x.id}" aria-label="Annuler" title="Annuler">↺</button>`}</div></div>`}).join(""):`<p class="muted" style="font-size:.85rem">Pas de révision prévue.</p>`}
      </div>`}).join("")}</div>
    ${unplaced.length?`<div class="warn unplaced">Pas assez de place pour : ${unplaced.map(x=>esc(subj(x.subjId).name)+" ("+fmt(x.mins)+")").join(", ")}. Ajoute du temps réel ou baisse un volume dans Réglages.</div>`:""}
    ${nav()}
  </section>`;
},
bilan(){
  const P=(S.plan?S.plan.sessions:[]).filter(x=>subj(x.subjId));
  const done=P.filter(x=>x.status==="done").length, part=P.filter(x=>x.status==="partial"||x.status==="skipped"), todo=P.filter(x=>x.status==="todo").length;
  const over=P.length&&part.length/P.length>=.3;
  return `<section class="panel">
    <h2>Bilan de la semaine</h2>
    <div class="stats"><div class="stat"><span class="mono" style="color:var(--green)">${done}</span><span>créneaux faits</span></div><div class="stat"><span class="mono" style="color:var(--yellow)">${part.length}</span><span>pas finis ou pas faits</span></div><div class="stat"><span class="mono">${todo}</span><span>à venir</span></div></div>
    ${over?`<div class="warn">Beaucoup de créneaux pas finis : ton objectif était trop ambitieux, pas toi qui manques de discipline. Baisse ton temps réel la semaine prochaine (Réglages › Temps réel).</div>`:""}
    <h3>À reprendre</h3>
    ${part.length?`<div class="todo-list">${part.map(x=>`<div class="todo"><p><b>${esc(subj(x.subjId).name)}</b> · ${DAYS[x.day]??""} · ${x.status==="skipped"?"pas fait":"pas fini"}<br><span class="muted">${x.note?esc(x.note):"Rien de noté."}</span></p>
      <span class="row-actions"><select id="rd-${x.id}" aria-label="Jour du rattrapage">${DAYS.map((d,i)=>`<option value="${i}">${d}</option>`).join("")}</select><select id="rm-${x.id}" aria-label="Durée"><option value="30">30 min</option><option value="45">45 min</option><option value="60" selected>1 h</option></select><button class="btn small" data-extra="${x.id}">Ajouter un créneau séparé</button></span></div>`).join("")}</div>`
      :`<div class="empty">Rien à reprendre pour l'instant. Quand un créneau se termine sans être fini, note ce qui reste : ça arrive ici.</div>`}
    <div class="cards3">
      <div class="mini"><h3>À la fin d'un créneau</h3><ul class="dont"><li class="yes">Arrête la matière prévue.</li><li class="yes">Passe à la matière suivante.</li><li class="yes">Note ce qui n'a pas été terminé.</li><li class="yes">Cherche un créneau séparé si c'est nécessaire.</li><li class="yes">Ajuste ton objectif pour la semaine suivante.</li></ul></div>
      <div class="mini"><h3>Ne fais pas ça</h3><ul class="dont"><li>Déplacer tout le reste de la semaine.</li><li>Laisser une matière déborder sur la suivante.</li><li>Rattraper en refaisant un planning plus ambitieux.</li></ul><p class="muted" style="font-size:.85rem;margin-top:6px">Un dépassement ponctuel peut être ajouté ailleurs, mais il ne doit pas détruire toute la structure.</p></div>
    </div>
    <div class="row-actions"><button class="btn primary" data-newweek>Commencer une nouvelle semaine</button></div>
    ${nav()}
  </section>`;
}
};

let lastView="";
function renderTabs(){
  const nav=document.getElementById("tabs"); if(!nav)return;
  nav.innerHTML=TABS.map(t=>`<button class="tab" data-tab="${t.k}" ${S.tab===t.k?'aria-current="page"':""}>${t.t}</button>`).join("");
}
function render(){
  chaps().forEach(c=>{if(c.status==="encours")c.status="apprentissage"});
  if(!S.tab||!TABS.some(t=>t.k===S.tab))S.tab="today";
  const key=S.tab+"/"+(S.tab==="reglages"?(S.sub||""):"");
  const y=window.scrollY;
  renderTabs();renderBudget();
  const a=document.activeElement, aid=a&&a.id, sel=a&&a.selectionStart;
  const v=S.tab==="reglages"&&S.sub&&views[S.sub]?views[S.sub]():views[S.tab]();
  const main=document.getElementById("main");
  main.innerHTML=v;
  if(key!==lastView){window.scrollTo(0,0);main.classList.remove("enter");void main.offsetWidth;main.classList.add("enter");
    if(S.tab==="semaine")document.getElementById("todayCard")?.scrollIntoView({block:"start",behavior:"instant"});}
  else window.scrollTo(0,y);
  lastView=key;
  if(aid){const el=document.getElementById(aid);if(el){el.focus({preventScroll:true});try{if(sel!=null)el.setSelectionRange(sel,sel)}catch(e){}}}
  renderTimer();setSave(saveTxt||"à jour");
}
function commit(rerender=true){save();if(rerender)render();else renderBudget()}

/* ---------- timer ---------- */
let tick=null, actx=null;
function beep(){try{actx=actx||new (window.AudioContext||window.webkitAudioContext)();[0,.35,.7].forEach(t=>{const o=actx.createOscillator(),g=actx.createGain();o.frequency.value=880;o.connect(g);g.connect(actx.destination);g.gain.setValueAtTime(.0001,actx.currentTime+t);g.gain.exponentialRampToValueAtTime(.25,actx.currentTime+t+.02);g.gain.exponentialRampToValueAtTime(.0001,actx.currentTime+t+.3);o.start(actx.currentTime+t);o.stop(actx.currentTime+t+.32)})}catch(e){}}
let timerMin=false, wake=null;
async function keepAwake(on){try{if(on&&!wake&&navigator.wakeLock){wake=await navigator.wakeLock.request("screen");wake.addEventListener("release",()=>{wake=null})}else if(!on&&wake){await wake.release();wake=null}}catch(e){}}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&S.timer)keepAwake(true)});
function renderTimer(){
  const el=document.getElementById("timer");
  const T=S.timer, x=T&&T.sid&&S.plan&&S.plan.sessions.find(s=>s.id===T.sid);
  if(!T||(T.phase!=="pause"&&(!x||!subj(x.subjId)))){el.hidden=true;el.className="";clearInterval(tick);tick=null;keepAwake(false);document.title="Mon plan de révision";return}
  el.hidden=false;
  const left=Math.max(0,T.endAt-Date.now()), total=T.total||(T.phase==="pause"?PAUSE*60000:(x?workOf(x.mins)*60000:left))||1;
  const mm=Math.floor(left/60000), ss=Math.floor(left%60000/1000), clock=`${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
  document.title=`${clock} · ${T.phase==="pause"?"Pause":subj(x.subjId).name}`;
  const c=x&&x.chapId&&chaps().find(c=>c.id===x.chapId);
  if(timerMin){
    el.className="timerbar";
    el.innerHTML=`<button class="tb-open" data-focus aria-label="Agrandir le minuteur"><span class="mono">${clock}</span><span>${T.phase==="pause"?"Pause":esc(subj(x.subjId).name)}</span></button>`;
  }else{
    const R=104, C=2*Math.PI*R, frac=Math.min(1,Math.max(0,left/total)), g=game(), pause=T.phase==="pause";
    const nextUp=pause?(()=>{const td=(new Date().getDay()+6)%7;const o=P.dayLayout(S,td).find(o=>o.x.status==="todo");return o?subj(o.x.subjId).name:""})():"";
    el.className="focus "+(pause?"pause":"work");
    el.innerHTML=`${RIPPLE("ripple big")}<div class="focus-in">
      <div class="focus-top"><span class="kicker">${pause?"PAUSE · LÈVE-TOI, BOIS DE L'EAU":"CONCENTRATION · LE CRÉNEAU EST UN MUR"}</span>
        <button class="focus-min" data-minimize aria-label="Réduire le minuteur"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
      <div class="ring"><svg viewBox="0 0 240 240" aria-hidden="true"><circle class="ring-bg" cx="120" cy="120" r="${R}"/><circle class="ring-fg" cx="120" cy="120" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C*(1-frac)}"/></svg>
        <div class="ring-t"><span class="clock">${clock}</span><small>${pause?"avant la reprise":`+${workOf(x.mins)} XP à la fin`}</small></div></div>
      ${pause?`<h2>Pause</h2>${nextUp?`<p class="focus-c">Ensuite : ${esc(nextUp)}</p>`:""}`:`<h2>${esc(subj(x.subjId).name)}</h2>${c?`<p class="focus-c">${esc(c.name)}</p>`:""}`}
      <div class="pills"><span class="pill">${pause?"Reprise à "+fmtT(Math.round((T.endAt-new Date().setHours(0,0,0,0))/60000)):"Pause à "+fmtT(Math.round((T.endAt-new Date().setHours(0,0,0,0))/60000))}</span><span class="pill cream">${FLAME} Série ${g.streak} j</span></div>
      ${pause?`<button class="btn primary big" data-skippause>Reprendre maintenant</button>`:`<button class="btn primary big" data-endnow>J'AI FINI</button>`}
    </div>`;
  }
  if(!tick)tick=setInterval(()=>{if(S.timer&&Date.now()>=S.timer.endAt){clearInterval(tick);tick=null;beep();try{navigator.vibrate&&navigator.vibrate([200,100,200])}catch(e){}if(S.timer.phase==="pause"){S.timer=null;commit();toast("Pause terminée : créneau suivant !")}else{timerMin=true;renderTimer();openEnd(S.timer.sid,true)}}else renderTimer()},1000);
}
function openEnd(sid,rang){
  const x=S.plan.sessions.find(s=>s.id===sid); if(!x)return;
  const m=document.getElementById("modal");
  const c=x.chapId&&chaps().find(c=>c.id===x.chapId), cur=c?(c.status==="pas"?"decouverte":c.status):"";
  const fromTimer=S.timer&&S.timer.sid===sid, g=game();
  m.innerHTML=`<div class="sheet game" role="dialog" aria-modal="true" aria-labelledby="endT">
    <div class="grab" aria-hidden="true"></div>
    <p class="kicker">${rang?"TEMPS ÉCOULÉ":"QUÊTE TERMINÉE ?"}</p>
    <h2 id="endT" class="mega small">BIEN JOUÉ</h2>
    <div class="pills"><span class="pill rose">+${workOf(x.mins)} XP</span><span class="pill cream">${FLAME} Série ${g.today?g.streak:g.streak+1} j</span></div>
    <p class="muted">${esc(subj(x.subjId).name)}${c?" · "+esc(c.name):""}</p>
    ${c?`<div class="defi"><b>Défi feuille blanche</b><p>Cours fermé, écris tout ce que tu sais, puis compare. Tu retrouves…</p>${stageBox(cur)}</div>`:""}
    <label class="check"><input type="checkbox" id="notDone"> <span>Je n'ai pas fini</span></label>
    <textarea id="endNote" placeholder="Ce qui reste à faire (ex. fin du chapitre, exercices 4 à 6)" hidden>${esc(x.note||"")}</textarea>
    <div class="sheet-acts"><button class="btn primary big" data-finish="${sid}">${fromTimer?"VALIDER · PAUSE 10 MIN":"VALIDER"}</button>${fromTimer?"":`<button class="btn ghost" data-closemodal>Annuler</button>`}</div>
  </div>`;
  m.hidden=false;
}
function openChap(id){
  const c=chaps().find(c=>c.id===id); if(!c)return;
  const m=document.getElementById("modal");
  m.innerHTML=`<div class="sheet game" role="dialog" aria-modal="true" aria-labelledby="chT">
    <div class="grab" aria-hidden="true"></div>
    <p class="kicker">${esc(subj(c.subjId).name.toUpperCase())}</p>
    <h2 id="chT">${esc(c.name)}</h2>
    <p class="muted small">${c.last?`Vu le ${frDate(c.last)}`:"Pas encore vu"}${c.next&&c.status!=="pas"?` · prochaine révision ${frDate(c.next)}`:""}${c.revs?` · ${c.revs} révision${c.revs>1?"s":""}`:""}</p>
    <div class="defi"><b>Où en es-tu ?</b>${stageBox(c.status==="pas"?"":c.status)}
      <button type="button" class="opt wide ${c.status==="pas"?"on":""}" data-cst="pas"><b>Pas commencé</b><span>le chapitre attend son tour</span></button></div>
    <div class="sheet-acts"><button class="btn primary big" data-chsave="${c.id}">ENREGISTRER</button>
      <div class="row-2"><button class="btn ghost" data-closemodal>Fermer</button><button class="btn ghost danger" data-delch="${c.id}">Supprimer</button></div></div>
  </div>`;
  m.hidden=false;
}
function openSkip(sid){
  const x=S.plan.sessions.find(s=>s.id===sid); if(!x)return;
  const m=document.getElementById("modal");
  m.innerHTML=`<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="skT"><div class="grab" aria-hidden="true"></div>
    <h2 id="skT">Créneau pas fait : ${esc(subj(x.subjId).name)}</h2>
    <p class="muted">Pas grave. On ne décale pas toute la semaine : on note, et on avance.</p>
    <label for="skNote"><b>Pourquoi ?</b> (facultatif)</label>
    <textarea id="skNote" placeholder="ex. trop fatiguée, rendez-vous, j'ai pris du retard le matin">${esc(x.note||"")}</textarea>
    <div class="sheet-acts"><button class="btn primary big" data-skipok="${sid}">Je ne l'ai pas fait</button><button class="btn ghost" data-closemodal>Annuler</button></div>
    <div class="skip-alt">
      <b>Ou : j'ai fait autre chose à la place</b>
      <select id="skSubj" data-sksubj aria-label="Matière faite">${S.subjects.filter(s=>s.name.trim()).map(s=>`<option value="${s.id}" ${s.id===x.subjId?"selected":""}>${esc(s.name)}</option>`).join("")}</select>
      <select id="skChap" aria-label="Chapitre">${chapOpts(x.subjId)}</select>
      ${stageBox("apprentissage")}
      <button class="btn" data-skipswap="${sid}">Enregistrer ce que j'ai fait</button>
    </div>
  </div>`;
  m.hidden=false;
}
function chapOpts(sid){const cs=chaps().filter(c=>c.subjId===sid);const pick=cs.find(c=>c.status==="decouverte")||cs.find(c=>c.status!=="maitrise");return cs.length?cs.map(c=>`<option value="${c.id}" ${c===pick?"selected":""}>${esc(c.name)} (${CST[c.status].t.toLowerCase()})</option>`).join(""):`<option value="">Pas de chapitre</option>`}

/* ---------- petit message en bas, avec « Annuler » ---------- */
let toastT=null, undoSnap=null;
function toast(msg,undo){
  let t=document.getElementById("toast");
  if(!t){t=document.createElement("div");t.id="toast";t.setAttribute("role","status");document.body.appendChild(t)}
  undoSnap=undo||null;
  t.innerHTML=`<span>${esc(msg)}</span>${undo?`<button data-undoall>Annuler</button>`:""}`;
  t.classList.add("show");clearTimeout(toastT);toastT=setTimeout(()=>{t.classList.remove("show");undoSnap=null},5000);
}
const snap=()=>JSON.stringify(S);
function closeModal(){const m=document.getElementById("modal");m.classList.add("closing");setTimeout(()=>{m.hidden=true;m.classList.remove("closing")},180)}
/* ---------- events ---------- */
document.addEventListener("click",e=>{
  const b=e.target.closest("button"); if(!b)return;
  const d=b.dataset;
  if(d.tab){S.tab=d.tab;if(d.tab!=="reglages")S.sub=null;commit();return}
  if(d.sub!=null){S.sub=d.sub||null;commit();return}
  if(d.focus!=null){timerMin=false;renderTimer();return}
  if(d.minimize!=null){timerMin=true;renderTimer();return}
  if(d.undoall!=null){if(undoSnap){S=Object.assign(defaults(),JSON.parse(undoSnap));undoSnap=null;commit();document.getElementById("toast")?.classList.remove("show")}return}
  if(d.signout!=null){onSignOut&&onSignOut();return}
  if(d.cal!=null){openCal();return}
  if(d.finish){const before=snap();const x=S.plan.sessions.find(s=>s.id===d.finish);const nd=document.getElementById("notDone").checked;x.status=nd?"partial":"done";
    const on=document.querySelector("#modal [data-cst].on"),c=x.chapId&&chaps().find(c=>c.id===x.chapId);
    if(c&&on){const k=on.dataset.cst;c.status=k;c.last=todayISO();c.next=addDays(todayISO(),CST[k].d);c.revs=(c.revs||0)+1;(c.hist=c.hist||[]).push(todayISO());x.chapDone=c.id}
    x.note=nd?document.getElementById("endNote").value.trim():"";
    logDrop(x.id);const wasT0=S.timer&&S.timer.sid===x.id&&S.timer.phase==="work";logAdd(x,wasT0&&S.timer.total?Math.min(workOf(x.mins),Math.round((S.timer.total-Math.max(0,S.timer.endAt-Date.now()))/60000)) || workOf(x.mins):workOf(x.mins));
    const wasTimer=S.timer&&S.timer.sid===x.id;
    if(wasTimer){const pm=x.mins-workOf(x.mins);S.timer={phase:"pause",endAt:Date.now()+pm*60000,total:pm*60000};timerMin=false}
    closeModal();commit();toast(c&&on?`+${workOf(x.mins)} XP · ${c.name} : ${CST[on.dataset.cst].t.toLowerCase()}, revu le ${frDate(c.next)}`:`+${workOf(x.mins)} XP`,before);return}
  if(d.diff){subj(d.diff).diff=b.dataset.d;commit();return}
  if(d.addsub!=null){const s={id:uid(),name:"",diff:"y",coef:"",manual:null,exam:false};S.subjects.push(s);commit();document.getElementById("n-"+s.id)?.focus();return}
  if(d.delsub){S.subjects=S.subjects.filter(s=>s.id!==d.delsub);commit();return}
  if(d.delc){S.constraints=S.constraints.filter(c=>c.id!==d.delc);commit();return}
  if(d.av!=null){const i=+d.av;S.avail[i]=Math.max(0,Math.min(16*60,S.avail[i]+ +d.dv));S.availExample=false;commit();return}
  if(d.exam){const s=subj(d.exam);s.exam=!s.exam;commit();return}
  if(d.master){const s=subj(d.master);s.master=!s.master;commit();return}
  if(d.vol){const V=volumes(),s=subj(d.vol);s.manual=Math.max(0,(V[s.id]?V[s.id].mins:0)+ +d.dv);commit();return}
  if(d.auto){subj(d.auto).manual=null;commit();return}
  if(d.boost){S.examBoost=Math.max(30,Math.min(300,S.examBoost+ +d.boost));commit();return}
  if(d.regen!=null){generatePlan();commit();return}
  if(d.start){const x=S.plan.sessions.find(s=>s.id===d.start);try{actx=actx||new (window.AudioContext||window.webkitAudioContext)()}catch(err){}const ms=workOf(x.mins)*60000;S.timer={sid:x.id,phase:"work",endAt:Date.now()+ms,total:ms};timerMin=false;keepAwake(true);commit();return}
  if(d.skippause!=null){S.timer=null;commit();return}
  if(d.endnow!=null){const sid=S.timer.sid;timerMin=true;renderTimer();openEnd(sid);return}
  if(d.done){openEnd(d.done);return}
  if(d.closemodal!=null){closeModal();return}
  if(d.cst){(b.closest(".defi")||b.closest(".stagebox")).querySelectorAll("[data-cst]").forEach(z=>{z.classList.toggle("on",z===b);z.setAttribute("aria-checked",z===b)});return}
  if(d.opench){openChap(d.opench);return}
  if(d.mapsubj){S.mapSubj=d.mapsubj;commit();return}
  if(d.chsave){const before=snap(),c=chaps().find(c=>c.id===d.chsave),on=document.querySelector("#modal [data-cst].on");
    if(c&&on&&on.dataset.cst!==c.status){const k=on.dataset.cst;c.status=k;if(k==="pas"){c.next=null}else{c.last=todayISO();c.next=addDays(todayISO(),CST[k].d)}}
    closeModal();commit();toast(c?`${c.name} : ${c.status==="pas"?"pas commencé":CST[c.status].t.toLowerCase()}`:"Enregistré",before);return}
  if(d.guess){const box=b.closest(".stagebox");box.querySelectorAll("[data-cst]").forEach(z=>z.classList.toggle("on",z.dataset.cst===d.guess));box.querySelectorAll("[data-guess]").forEach(z=>z.classList.toggle("on",z===b));return}
  if(d.addch){const inp=document.getElementById("nc-"+d.addch),n=inp.value.trim();if(!n)return;chaps().push({id:uid(),subjId:d.addch,name:n,status:"pas",last:null,next:null,revs:0});commit();toast("Chapitre ajouté");document.getElementById("nc-"+d.addch)?.focus();return}
  if(d.delch){const before=snap(),c=chaps().find(c=>c.id===d.delch);S.chapters=chaps().filter(c=>c.id!==d.delch);if(!document.getElementById("modal").hidden)closeModal();commit();toast(c?`« ${c.name} » supprimé`:"Supprimé",before);return}
  if(d.skip){openSkip(d.skip);return}
  if(d.skipok){const before=snap();const x=S.plan.sessions.find(s=>s.id===d.skipok);x.status="skipped";x.note=document.getElementById("skNote").value.trim();if(S.timer&&S.timer.sid===x.id)S.timer=null;closeModal();commit();toast("Noté comme pas fait",before);return}
  if(d.skipswap){const before=snap();const x=S.plan.sessions.find(s=>s.id===d.skipswap);const sj=document.getElementById("skSubj").value,cid=document.getElementById("skChap").value;
    const on=document.querySelector("#modal .skip-alt [data-cst].on");
    x.origSubjId=x.origSubjId||x.subjId;x.subjId=sj;x.status="done";x.note="à la place de "+subj(x.origSubjId).name;
    const c=cid&&chaps().find(c=>c.id===cid);
    if(c){x.chapId=c.id;if(on){const k=on.dataset.cst,dt=addDays(S.plan.weekStart||mondayISO(),x.day),base=dt<todayISO()?dt:todayISO();c.status=k;c.last=base;c.next=addDays(base,CST[k].d);(c.hist=c.hist||[]).push(base);c.revs=(c.revs||0)+1}}
    logDrop(x.id);logAdd(x,workOf(x.mins));
    if(S.timer&&S.timer.sid===x.id)S.timer=null;closeModal();commit();toast("Enregistré : "+subj(sj).name,before);return}
  if(d.undo){const before=snap();const x=S.plan.sessions.find(s=>s.id===d.undo);x.status="todo";logDrop(x.id);commit();toast("Quête remise à faire",before);return}
  if(d.fin){const x=S.plan.sessions.find(s=>s.id===d.sid);x.status=d.fin;
    const on=document.querySelector("#modal [data-cst].on"),c=x.chapId&&chaps().find(c=>c.id===x.chapId);
    if(c&&on){const k=on.dataset.cst;c.status=k;c.last=todayISO();c.next=addDays(todayISO(),CST[k].d);c.revs=(c.revs||0)+1;(c.hist=c.hist||[]).push(todayISO());x.chapDone=c.id}x.note=document.getElementById("endNote").value.trim();S.timer=S.timer&&S.timer.sid===x.id?{phase:"pause",endAt:Date.now()+(x.mins-workOf(x.mins))*60000}:S.timer;document.getElementById("modal").hidden=true;commit();return}
  if(d.extra){const x=S.plan.sessions.find(s=>s.id===d.extra);const day=+document.getElementById("rd-"+x.id).value,m=+document.getElementById("rm-"+x.id).value;S.plan.sessions.push({id:uid(),subjId:x.subjId,mins:m,day,status:"todo",note:"",extra:true});x.status="done";x.note=(x.note?x.note+" · ":"")+"rattrapage prévu "+DAYS[day];commit();return}
  if(d.newweek!=null){S.timer=null;generatePlan(true);S.tab="today";commit();return}
});
document.addEventListener("input",e=>{
  const t=e.target,d=t.dataset;
  if(d.name){subj(d.name).name=t.value;commit(false);return}
  if(d.coef){subj(d.coef).coef=t.value===""?"":Number(t.value);commit(false);return}
});
document.addEventListener("change",e=>{
  const t=e.target,d=t.dataset;
  if(d.listed){S.listed[d.listed]=t.checked;commit(false);return}
  if(t.id==="notDone"){const n=document.getElementById("endNote");n.hidden=!t.checked;if(t.checked)n.focus();return}
  if(d.sksubj!=null){document.getElementById("skChap").innerHTML=chapOpts(t.value);return}
  if(d.daystart!=null){if(t.value){S.dayStart=t.value;commit()}return}
  if(d.cstat){const c=chaps().find(c=>c.id===d.cstat);c.status=t.value;if(t.value==="pas"){c.next=null}else{c.last=todayISO();c.next=addDays(todayISO(),CST[t.value].d)}(S.openCh=S.openCh||{})[c.subjId]=true;commit();return}
});
document.addEventListener("submit",e=>{
  if(e.target.id!=="addC")return; e.preventDefault();
  const s=document.getElementById("cStart").value,en=document.getElementById("cEnd").value;
  if(!s||!en||toMin(en)<=toMin(s))return;
  S.constraints.push({id:uid(),day:+document.getElementById("cDay").value,type:document.getElementById("cType").value,start:s,end:en,label:document.getElementById("cLabel").value.trim()});
  commit();
});
document.addEventListener("toggle",e=>{const t=e.target;if(t.classList&&t.classList.contains("chs")){(S.openCh=S.openCh||{})[t.id.slice(2)]=t.open;save()}},true);
document.addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.id&&e.target.id.startsWith("nc-")){e.preventDefault();document.querySelector(`[data-addch="${e.target.id.slice(3)}"]`)?.click();return}if(e.key==="Escape"&&!document.getElementById("modal").hidden){/* keep modal: the slot must be closed out */}});


/* ---------- calendrier (abonnement .ics) ---------- */
function openCal(){
  const m=document.getElementById("modal");
  const web=icsUrl.replace(/^https?:/,"webcal:");
  m.innerHTML=`<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="calT">
    <h2 id="calT">Mon planning dans le calendrier</h2>
    <p class="muted">Abonne ton calendrier à ce lien une seule fois : tes créneaux s'y affichent tout seuls et se mettent à jour. Les jours à venir sont marqués « prévu » tant qu'ils ne sont pas figés.</p>
    <a class="btn primary" href="${esc(web)}" style="text-align:center;text-decoration:none">Ajouter à mon calendrier</a>
    <label for="icsUrl" class="muted" style="font-size:.85rem">Ou copie le lien (iPhone : Réglages › Calendrier › Comptes › Ajouter un compte › Autre › Ajouter un calendrier avec abonnement)</label>
    <input id="icsUrl" readonly value="${esc(icsUrl)}" style="font-size:.85rem">
    <div class="row-actions"><button class="btn" id="copyIcs">Copier le lien</button><button class="btn ghost" data-closemodal>Fermer</button></div>
    <p class="muted" style="font-size:.8rem">Garde ce lien pour toi : toute personne qui l'a peut voir ton planning.</p>
  </div>`;
  m.hidden=false;
  document.getElementById("copyIcs").addEventListener("click",async()=>{const i=document.getElementById("icsUrl");try{await navigator.clipboard.writeText(icsUrl);document.getElementById("copyIcs").textContent="Copié ✓"}catch(e){i.select()}});
}
document.getElementById("calBtn")?.addEventListener("click",openCal);

render();

}
