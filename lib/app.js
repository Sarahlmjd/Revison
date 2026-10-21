// Interface de l'appli (reprise de la version Claude), branchée sur Supabase par la page.
import * as P from "./planner";
import { merge3, stable } from "./merge";

let started = false;

/**
 * Démarre l'appli dans la page.
 * @param {{initial: object|null, store: {load: () => Promise<object|null>, save: (s: object) => Promise<void>}, icsUrl: string}} opts
 */
export function startApp({ initial, initialAt, store, icsUrl, onSignOut }) {
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
let saveT=null, dirty=false, syncing=false, again=false;
let base=JSON.parse(JSON.stringify(S)), baseAt=initialAt||null;   // dernière version synchronisée avec le serveur
function setSave(t){saveTxt=t;for(const id of ["saveState","saveState2"]){const el=document.getElementById(id);if(el)el.textContent=id==="saveState2"?"Synchronisation : "+t:t}}
let saveTxt="";
function adoptMerged(next){
  const changed=stable(next)!==stable(S);
  S=Object.assign(defaults(),next);
  try{localStorage.setItem(LS,JSON.stringify(S))}catch(e){}
  if(changed&&document.getElementById("modal").hidden)render();
}
/* envoi : on fusionne avec la version en ligne si l'autre appareil a enregistré entre-temps */
async function sync(){
  if(syncing){again=true;return}
  syncing=true;
  try{
    for(let n=0;n<4;n++){
      const mine=JSON.parse(JSON.stringify(S));
      try{
        const at=await store.save(mine,baseAt);
        base=mine;baseAt=at;dirty=false;setSave("enregistré");break;
      }catch(e){
        if(!e.conflict)throw e;
        const r=await store.load(); if(!r)throw e;
        const merged=merge3(base,mine,r.state);
        base=r.state;baseAt=r.at;adoptMerged(merged);
      }
    }
  }catch(e){setSave("pas de connexion : enregistré sur cet appareil")}
  syncing=false;
  if(again){again=false;sync()}
}
function save(){
  try{localStorage.setItem(LS,JSON.stringify(S))}catch(e){}
  clearTimeout(saveT);
  setSave("enregistrement…"); dirty=true;
  saveT=setTimeout(sync,700);
}
/* au retour sur l'appli : on récupère ce que l'autre appareil a fait, sans perdre ce qui a été fait ici */
async function refresh(){
  if(syncing||!document.getElementById("modal").hidden)return;
  try{
    const r=await store.load(); if(!r||r.at===baseAt)return;
    const merged=merge3(base,S,r.state);
    base=r.state;baseAt=r.at;adoptMerged(merged);
    if(stable(merged)!==stable(r.state)){dirty=true;sync()}else setSave("à jour");
  }catch(e){}
}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){if(dirty)sync();else refresh()}});
window.addEventListener("online",()=>{if(dirty)sync();else refresh()});
setInterval(()=>{if(dirty&&!syncing)sync();else refresh()},30000);

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
  if(!Array.isArray(S.log)){S.log=[];chaps().forEach(c=>(c.hist||[]).forEach((d,i)=>S.log.push({d,m:50,sid:"h-"+c.id+"-"+i})))}
  // chaque entrée doit être unique (sinon la synchro entre appareils fusionnerait deux révisions du même jour)
  S.log.forEach((e,i)=>{if(!e.sid&&!e.bonus)e.sid="h-"+i});
  return S.log;
}
function logAdd(x,m){const n=new Date();gameLog().push({d:todayISO(),m:Math.max(0,Math.round(m)),sid:x.id,t:n.getHours()*60+n.getMinutes()})}
function logDrop(sid){S.log=gameLog().filter(e=>e.sid!==sid)}
function game(){
  const L=gameLog(), xp=L.reduce((t,e)=>t+(e.m||0),0), days=new Set(L.map(e=>e.d)), off=new Set(S.off||[]);
  let d=todayISO(); if(!days.has(d))d=addDays(d,-1);
  let streak=0; for(let k=0;k<400;k++){if(days.has(d)){streak++;d=addDays(d,-1)}else if(off.has(d)){d=addDays(d,-1)}else break}
  return {xp,level:Math.floor(xp/LVL)+1,inLvl:xp%LVL,streak,today:days.has(todayISO())};
}
/* ---------- joker : une journée off par semaine ---------- */
function jokerLeft(){const ws=S.plan?S.plan.weekStart:mondayISO();return (S.off||[]).filter(d=>d>=ws&&d<=addDays(ws,6)).length?0:1}
function openJoker(){
  const m=document.getElementById("modal");
  m.innerHTML=`<div class="sheet game" role="dialog" aria-modal="true" aria-labelledby="jkT"><div class="grab" aria-hidden="true"></div>
    <p class="kicker">1 PAR SEMAINE</p><h2 id="jkT" class="mega small">JOKER</h2>
    <p>Malade, famille, journée trop chargée : tu poses ton joker pour aujourd'hui.</p>
    <ul class="jk"><li>Les quêtes restantes du jour ne comptent pas comme « pas faites ».</li><li>Ta série de jours ne se casse pas.</li><li>Les chapitres prévus reviennent les jours suivants.</li></ul>
    <div class="sheet-acts"><button class="btn primary big" data-jokerok>POSER MON JOKER</button><button class="btn ghost" data-closemodal>Annuler</button></div></div>`;
  m.hidden=false;
}
/* ---------- tuteur : message prêt pour le projet Claude ---------- */
function tutorMsg(c){
  const st=c.status==="pas"?"pas encore commencé":CST[c.status].t;
  return `Défi feuille blanche : ${subj(c.subjId).name} · ${c.name}
Étape actuelle dans mon appli : ${st}.
1. Demande-moi d'écrire de mémoire tout ce que je sais sur ce chapitre, sans regarder le cours.
2. Compare avec le cours (les diapos du prof font référence) et liste ce qui manque ou est faux.
3. Estime le pourcentage retrouvé et dis-moi quelle étape cocher : Découverte = pas encore compris ; À revoir = moins de 70 % ; Apprentissage = 70 à 90 % ; Maîtrisé = plus de 90 % sans hésiter.
4. Termine par 3 questions sur ce que j'ai oublié.`;
}
const notionUrl=s=>s&&s.notion?s.notion:"";
function links(c){
  const s=subj(c.subjId), n=notionUrl(s);
  return `<div class="links"><button class="btn" data-tutor="${c.id}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>Défi avec mon tuteur</button>${n?`<a class="btn" href="${esc(n)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 4.5h10.5a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z M5 17a3 3 0 0 1 3-3h10.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>Ouvrir le cours</a>`:""}</div>`;
}
/* ---------- partiels : le boss ---------- */
const EXAM_DEFAULT="2026-12-14"; // semaine des partiels (avant les vacances de Noël) — réglable
function boss(){
  const ex=S.examStart||EXAM_DEFAULT, days=P.dayGap(todayISO(),ex);
  const cs=chaps(), max=cs.length*4, lvl=c=>c.status==="pas"?0:ORDER.indexOf(c.status)+1;
  const hp=cs.reduce((t,c)=>t+(4-lvl(c)),0), todo=cs.filter(c=>c.status==="pas").length;
  const weeks=Math.max(0,Math.floor(days/7));
  const pace=todo?Math.ceil(todo/Math.max(1,weeks-1)):0; // on garde la dernière semaine pour réviser
  return {ex,days,hp,max,todo,weeks,pace};
}
function bossBar(compact){
  const b=boss(); if(!b.max)return"";
  const pct=Math.round(b.hp/b.max*100), ex=new Date(b.ex+"T12:00:00").toLocaleDateString("fr-FR",{day:"numeric",month:"short"});
  return `<button class="boss ${compact?"compact":""}" data-tab="bilan" aria-label="Boss des partiels : ${b.hp} points de vie sur ${b.max}">
    <div class="boss-t"><b>BOSS · PARTIELS</b><span>${b.days>0?`J-${b.days} · ${ex}`:b.days===0?"C'est aujourd'hui":"terminé"}</span></div>
    <div class="boss-bar"><i style="width:${pct}%"></i></div>
    <div class="boss-s"><span>${b.hp}/${b.max} PV</span><span>chaque niveau de chapitre = −1 PV</span></div>
  </button>`;
}
/* ---------- progression : XP par semaine (8 dernières) + boss au fil des semaines ---------- */
function progress(){
  const ws=S.plan?S.plan.weekStart:mondayISO(), W=[];
  for(let k=7;k>=0;k--){const a=addDays(ws,-7*k),b=addDays(a,6);W.push({a,xp:gameLog().filter(e=>e.d>=a&&e.d<=b).reduce((t,e)=>t+(e.m||0),0)})}
  const first=W.findIndex(w=>w.xp>0); const Wv=first<0?W.slice(-1):W.slice(Math.max(0,Math.min(first,W.length-4)));
  const max=Math.max(60,...Wv.map(w=>w.xp)), H=110, bw=100/Wv.length;
  const lab=a=>new Date(a+"T12:00:00").toLocaleDateString("fr-FR",{day:"numeric",month:"short"}).replace(".","");
  const best=Math.max(...Wv.map(w=>w.xp));
  const bh=Object.entries(S.bossHist||{}).sort(), b0=bh[0], bn=bh[bh.length-1];
  return `<h3 class="sec">Progression</h3>
  <figure class="wkchart" aria-label="XP gagné par semaine">
    <div class="wkbars">${Wv.map((w,i)=>{const h=Math.max(2,Math.round(w.xp/max*H)),cur=i===Wv.length-1;return `<button class="wkb ${cur?"cur on":""}" data-wkbar="${i}" data-wkcap="Semaine du ${lab(w.a)} : ${w.xp} XP" aria-label="Semaine du ${lab(w.a)} : ${w.xp} XP" style="width:${bw}%">
      <span class="wkv">${cur||w.xp===best&&w.xp>0?w.xp:""}</span><i style="height:${h}px"></i><small>${lab(w.a)}</small></button>`}).join("")}</div>
    <figcaption id="wkcap" class="muted small">Semaine du ${lab(Wv[Wv.length-1].a)} : ${Wv[Wv.length-1].xp} XP · touche une barre pour voir sa valeur</figcaption>
  </figure>
  ${b0&&bn&&b0[0]!==bn[0]?`<p class="muted small">Boss : ${b0[1]} PV la semaine du ${lab(b0[0])} → ${bn[1]} PV cette semaine (−${b0[1]-bn[1]}).</p>`:`<p class="muted small">L'évolution du boss s'affichera ici semaine après semaine.</p>`}`;
}
/* ---------- succès ---------- */
const ACH=[
  {id:"first",t:"Premier pas",h:"Finir une quête",ok:g=>g.L.length>0},
  {id:"perfect",t:"Journée parfaite",h:"Toutes les quêtes d'une journée faites",ok:g=>g.L.some(e=>e.bonus==="perfect")},
  {id:"early",t:"Lève-tôt",h:"Une quête finie avant 9 h 30",ok:g=>g.L.some(e=>e.t!=null&&e.t>=300&&e.t<570&&!e.bonus)},
  {id:"marathon",t:"Marathon",h:"4 h de travail en une journée",ok:g=>Object.values(g.byDay).some(m=>m>=240)},
  {id:"s3",t:"Série de 3",h:"3 jours d'affilée",ok:g=>g.best>=3},
  {id:"s7",t:"Série de 7",h:"7 jours d'affilée",ok:g=>g.best>=7},
  {id:"s14",t:"Série de 14",h:"14 jours d'affilée",ok:g=>g.best>=14},
  {id:"l5",t:"Niveau 5",h:"Atteindre le niveau 5",ok:g=>g.level>=5},
  {id:"l10",t:"Niveau 10",h:"Atteindre le niveau 10",ok:g=>g.level>=10},
  {id:"m1",t:"Maîtrise",h:"Un chapitre maîtrisé",ok:g=>g.mast>=1},
  {id:"m5",t:"Expert·e",h:"5 chapitres maîtrisés",ok:g=>g.mast>=5},
  {id:"zero",t:"Zéro retard",h:"Plus aucun chapitre en retard",ok:g=>g.started>=5&&g.late===0},
  {id:"full",t:"Tour complet",h:"Tous les chapitres d'une matière commencés",ok:g=>g.fullSubj},
];
function achStats(){
  const L=gameLog(), byDay={}; L.forEach(e=>byDay[e.d]=(byDay[e.d]||0)+(e.m||0));
  const days=[...new Set(L.map(e=>e.d))].sort(), off=new Set(S.off||[]); let best=0,run=0,prev=null;
  days.forEach(d=>{let p=addDays(d,-1);while(off.has(p))p=addDays(p,-1);run=prev&&p===prev?run+1:1;best=Math.max(best,run);prev=d});
  const cs=chaps();
  return {L,byDay,best,level:game().level,mast:cs.filter(c=>c.status==="maitrise").length,
    started:cs.filter(c=>c.status!=="pas").length,late:cs.filter(c=>alertOf(c)==="late").length,
    fullSubj:S.subjects.some(s=>{const x=cs.filter(c=>c.subjId===s.id);return x.length>=3&&x.every(c=>c.status!=="pas")})};
}
let celebQ=[];
function checkGame(){
  // bonus « journée parfaite » : +25 XP quand toutes les quêtes du jour sont faites (au moins 2)
  const td=(new Date().getDay()+6)%7, L=S.plan?P.dayLayout(S,td):[], d=todayISO();
  const perfect=L.length>=2&&L.every(o=>o.x.status==="done"||o.x.status==="partial");
  const has=gameLog().some(e=>e.bonus==="perfect"&&e.d===d);
  if(perfect&&!has){S.log.push({d,m:25,bonus:"perfect"});celebQ.push({k:"JOURNÉE PARFAITE",t:"+25 XP bonus",s:"Toutes les quêtes du jour sont faites."})}
  if(!perfect&&has)S.log=S.log.filter(e=>!(e.bonus==="perfect"&&e.d===d));
  // PV du boss de la semaine (pour la progression)
  if(S.plan){const b=boss();S.bossHist=S.bossHist||{};S.bossHist[S.plan.weekStart]=b.hp}
  // niveaux
  const g=game(); S.ach=S.ach||{};
  if(S.lvlSeen==null)S.lvlSeen=g.level;
  if(g.level>S.lvlSeen){celebQ.push({k:"NIVEAU "+g.level,t:"Niveau supérieur",s:`Encore ${LVL} XP pour le suivant.`});S.lvlSeen=g.level}
  else if(g.level<S.lvlSeen)S.lvlSeen=g.level;
  // succès (on ne les retire jamais)
  const st=achStats(), first=!Object.keys(S.ach).length;
  ACH.forEach(a=>{if(!S.ach[a.id]&&a.ok(st)){S.ach[a.id]=d;if(!first)celebQ.push({k:"SUCCÈS",t:a.t,s:a.h})}});
  showCeleb();
}
let celebT=null;
function showCeleb(){
  if(!celebQ.length||celebT)return;
  const c=celebQ.shift();
  let el=document.getElementById("celeb");
  if(!el){el=document.createElement("div");el.id="celeb";el.setAttribute("role","status");document.body.appendChild(el)}
  el.innerHTML=`<div class="celeb-badge" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 2l3 6.5 7 .8-5.2 4.8 1.5 7L12 17.6 5.7 21l1.5-7L2 9.3l7-.8z" fill="currentColor"/></svg></div><div><small>${esc(c.k)}</small><b>${esc(c.t)}</b><span>${esc(c.s)}</span></div>`;
  el.classList.add("show");
  try{navigator.vibrate&&navigator.vibrate(60)}catch(e){}
  celebT=setTimeout(()=>{el.classList.remove("show");celebT=null;setTimeout(showCeleb,350)},3200);
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
  const st=x.status==="done"?"Fait":x.status==="partial"?"Pas fini":x.status==="skipped"?"Pas fait":x.status==="off"?"Joker":"";
  if(opts.hero){
    const lv=c?Math.max(0,ORDER.indexOf(c.status)+1):0;
    return `<article class="quest">
      <div class="quest-top"><span>${fmtT(a)} → ${fmtT(w)}${K[x.kind]?" · "+K[x.kind]:""}</span><b>+${xp} XP</b></div>
      <h3>${esc(s.name)}</h3>
      ${c?`<p class="quest-chap">${esc(c.name)}</p>
      <div class="lvbar"><span aria-hidden="true">${[1,2,3,4].map(n=>`<i class="${n<=lv?"on":""}"></i>`).join("")}</span>Niveau ${lv}/4 · ${c.status==="pas"?"à commencer":CST[c.status].t.toLowerCase()}${alertOf(c)==="late"&&c.status!=="decouverte"?" · en retard":""}</div>`:""}
      ${running?`<button class="btn primary big" data-focus>Reprendre le minuteur</button>`:`<button class="btn primary big" data-start="${x.id}">JOUER · ${fmt(xp).toUpperCase()}</button>`}
      <div class="quest-sub"><button class="btn ghost" data-done="${x.id}">Déjà fait</button><button class="btn ghost" data-skip="${x.id}">Pas fait</button></div>
      ${c?links(c):""}
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
    ${bossBar(true)}
    <p class="kicker">${dl}${L.length?` · QUÊTE ${Math.min(fin.length+1,L.length)}/${L.length}`:""}</p>
    <h2 class="mega">QUÊTES<br>DU J<span>O</span>UR</h2>
    ${L.length?`<div class="segs" role="progressbar" aria-valuenow="${fin.length}" aria-valuemin="0" aria-valuemax="${L.length}" aria-label="${fin.length} quêtes sur ${L.length}">${L.map(o=>`<i class="${o.x.status==="todo"?"":"on"}"></i>`).join("")}</div>`:""}
    ${todo.length?sessCard(todo[0],{hero:true}):(S.off||[]).includes(todayISO())?`<div class="win"><b>Joker posé aujourd'hui.</b><span>Repose-toi : ta série est protégée et les chapitres reviennent demain.</span></div>`:L.length?`<div class="win"><b>Toutes les quêtes sont faites.</b><span>Soirée libre méritée.</span></div>`:`<div class="empty">Pas de quête aujourd'hui. Repos.</div>`}
    ${todo.length>1?`<h3 class="sec">Ensuite</h3><div class="qrows">${todo.slice(1).map(o=>sessCard(o,{})).join("")}</div>`:""}
    ${fin.length?`<details class="donebox" ${todo.length?"":"open"}><summary><h3 class="sec">Terminées (${fin.length})</h3></summary><div class="qrows">${fin.map(o=>sessCard(o,{})).join("")}</div></details>`:""}
    ${late?`<button class="latebar" data-tab="chapitres">${late} chapitre${late>1?"s":""} en retard · ${late>1?"ils passent":"il passe"} en premier →</button>`:""}
    ${(S.off||[]).includes(todayISO())?"":todo.length?(jokerLeft()?`<button class="jokerbtn" data-joker>Poser mon joker du jour <small>1 par semaine · la série ne se casse pas</small></button>`:`<p class="muted small tomorrow">Joker déjà utilisé cette semaine.</p>`):""}
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
  const STEP=128, H=cs.length*STEP+10;
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
      <label class="setrow" for="examStart"><span><b>Partiels</b><small>Premier jour de la semaine d'examens</small></span><input type="date" id="examStart" data-examstart value="${esc(S.examStart||EXAM_DEFAULT)}"></label>
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
    <p class="muted small">La difficulté place la matière au bon moment de la journée. Le coefficient décide du nombre d'heures. ★ Master : un peu plus d'heures.</p>
    <div class="sublist">${S.subjects.map(s=>`<div class="subc">
      <div class="subc-top"><input class="name-in" id="n-${s.id}" data-name="${s.id}" value="${esc(s.name)}" placeholder="Nom de la matière" aria-label="Nom"><button class="x" data-delsub="${s.id}" aria-label="Supprimer la matière">×</button></div>
      <div class="seg3" role="group" aria-label="Difficulté pour toi">${[["r","Difficile"],["y","Moyenne"],["g","Facile"]].map(([d,t])=>`<button class="${s.diff===d?"on d-"+d:""}" data-d="${d}" data-diff="${s.id}" aria-pressed="${s.diff===d}">${t}</button>`).join("")}</div>
      <div class="subc-bot"><label class="coefl">Coef <input class="coef-in" id="c-${s.id}" data-coef="${s.id}" type="number" inputmode="decimal" step="0.1" min="0" value="${s.coef===""?"":s.coef}" placeholder="–"></label>
        <button class="chip ${s.master?"on":""}" data-master="${s.id}" aria-pressed="${!!s.master}">${s.master?"★ Master":"Master ?"}</button></div>
      <input class="notion-in" id="nu-${s.id}" data-notion="${s.id}" value="${esc(s.notion||"")}" placeholder="Lien de la page Notion du cours" aria-label="Lien Notion" inputmode="url">
    </div>`).join("")}</div>
    <div class="row-actions"><button class="btn" data-addsub>+ Ajouter une matière</button></div>
    <details class="mini">
      <summary><b>Ne cache rien. Liste tout.</b></summary>
      <div class="checklist">${[["princ","Les matières principales"],["sec","Les matières secondaires"],["proj","Les projets (ex. l'interview de TD)"],["opt","Les options"],["conc","Les examens ou concours parallèles"],["sans","Même les matières sans coefficient"]].map(([k,t])=>`<label><input type="checkbox" id="l-${k}" data-listed="${k}" ${L[k]?"checked":""}> ${t}</label>`).join("")}</div>
      <p class="muted" style="font-size:.85rem;margin-top:6px">Pas de coefficient officiel ? Mets une <b>importance relative</b> de 1 à 5, ou laisse vide et c'est la difficulté qui départage.</p>
    </details>
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
    <div class="sublist">${subs.map(s=>{const v=V[s.id]||{mins:0,boost:0};return `<div class="subc">
      <div class="subc-top"><b>${s.master?"★ ":""}${esc(s.name)}</b><span class="muted small">coef ${s.coef===""||s.coef==null?"–":s.coef}</span></div>
      <div class="share"><i style="width:${v.mins/maxM*100}%"></i></div>
      <div class="subc-bot"><button class="chip ${s.exam?"on":""}" data-exam="${s.id}" aria-pressed="${s.exam}">${s.exam?"Examen proche ✓":"Examen proche ?"}</button>
        <span class="vol"><button data-vol="${s.id}" data-dv="-15" aria-label="Moins 15 minutes">−</button><span>${fmt(v.mins)}</span><button data-vol="${s.id}" data-dv="15" aria-label="Plus 15 minutes">+</button></span></div>
      ${s.exam&&v.boost?`<small class="muted">+${fmt(v.boost)} temporaire</small>`:""}${s.manual!=null?`<button class="chip man" data-auto="${s.id}">ajusté à la main · revenir en auto</button>`:""}
    </div>`}).join("")}</div>
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
  const Ps=S.plan.sessions.filter(x=>subj(x.subjId)), today=(new Date().getDay()+6)%7, ws=S.plan.weekStart||mondayISO();
  const isPast=i=>addDays(ws,i)<todayISO();
  const sel=S.weekDay==null?today:S.weekDay;
  const unplaced=Ps.filter(x=>x.day==null);
  const placed=Ps.filter(x=>x.day!=null), finN=placed.filter(x=>x.status!=="todo").length;
  const work=placed.filter(x=>x.status==="done"||x.status==="partial").reduce((t,x)=>t+workOf(x.mins),0);
  const L=P.dayLayout(S,sel), tot=L.reduce((t,o)=>t+o.x.mins,0);
  const dd=d=>new Date(addDays(ws,d)+"T12:00:00");
  const row=o=>{const {x,a,w}=o, sj=subj(x.subjId), c=x.chapId&&chaps().find(c=>c.id===x.chapId), past=isPast(sel), tone={r:"t-rose",y:"t-lav",g:"t-cream"}[sj.diff]||"t-lav";
    const st=x.status==="done"?"fait":x.status==="partial"?"pas fini":x.status==="skipped"?"pas fait":x.status==="off"?"joker":past?"fait ou pas fait ?":"";
    return `<div class="wrow ${x.status} ${x.status==="todo"&&past?"ask":""}">
      <span class="qtime ${tone}">${x.logged?"noté":fmtT(a)}</span>
      <div class="qmain"><b>${esc(sj.name)}</b><small>${c?esc(c.name)+" · ":""}${c?(c.status==="pas"?"à commencer":CST[c.status].t.toLowerCase()):fmt(workOf(x.mins))}${x.extra?" · rattrapage":""}</small>${st?`<small class="st">${st}</small>`:""}</div>
      <div class="acts">${x.status==="todo"?`${past||sel!==today?"":`<button class="ic go" data-start="${x.id}" aria-label="Lancer la quête"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8 5.5v13l10-6.5z" fill="currentColor"/></svg></button>`}<button class="ic" data-done="${x.id}" aria-label="Fait"><svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button class="ic" data-skip="${x.id}" aria-label="Pas fait"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>`:`<button class="ic" data-undo="${x.id}" aria-label="Remettre à faire"><svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M4 9h11a5 5 0 0 1 0 10H8M4 9l4-4M4 9l4 4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`}</div>
    </div>`};
  return `<section class="weekview">
    <h2 class="mega small">LA SEMAINE</h2>
    <p class="muted small">${finN}/${placed.length} quêtes · ${fmt(work)} de travail</p>
    <div class="segs">${placed.map(x=>`<i class="${x.status==="todo"?"":"on"}"></i>`).join("")}</div>
    <div class="days7" role="tablist" aria-label="Jours">${DAYS.map((d,i)=>{const xs=placed.filter(x=>x.day===i),f=xs.filter(x=>x.status!=="todo").length,ask=isPast(i)&&xs.some(x=>x.status==="todo");
      return `<button role="tab" class="d7 ${i===sel?"on":""} ${i===today?"is-today":""}" aria-selected="${i===sel}" data-wday="${i}"><span>${d.slice(0,3)}</span><b>${dd(i).getDate()}</b><small class="${ask?"ask":""}">${xs.length?`${f}/${xs.length}`:"–"}</small></button>`}).join("")}</div>
    <div class="dayhead"><h3>${DAYS[sel]} ${dd(sel).getDate()}${sel===today?" · aujourd'hui":""}</h3><span class="muted small">${fmt(tot)} / ${fmt(S.avail[sel])}</span></div>
    ${L.length?`<div class="qrows">${L.map(row).join("")}</div>`:`<div class="empty">Pas de quête ce jour-là.</div>`}
    ${late?`<button class="latebar" data-tab="chapitres">${late} chapitre${late>1?"s":""} en retard · ${late>1?"ils passent":"il passe"} en premier →</button>`:""}
    ${unplaced.length?`<div class="warn">Pas assez de place pour : ${unplaced.map(x=>esc(subj(x.subjId).name)+" ("+fmt(x.mins)+")").join(", ")}. Ajoute du temps dans Réglages › Temps réel.</div>`:""}
    <details class="mini how"><summary><b>Comment ta semaine est calculée</b></summary>
      <p class="small"><b>Matin</b> : tes matières difficiles (ton meilleur moment). <b>Fin de matinée</b> : difficulté moyenne. <b>Début d'après-midi</b> : matières faciles, fiches. <b>18 h</b> : stop, soirée libre.</p>
      <p class="small">Aujourd'hui est figé. Les jours suivants se recalculent tout seuls selon ce que tu as fait et le niveau de chaque chapitre. Une matière sans chapitre n'est pas planifiée.</p>
      <p class="small"><b>Le créneau est un mur</b> : quand le minuteur sonne, tu t'arrêtes et tu passes à la suite.</p>
    </details>
  </section>`;
},
bilan(){
  const Pl=(S.plan?S.plan.sessions:[]).filter(x=>subj(x.subjId));
  const done=Pl.filter(x=>x.status==="done").length, part=Pl.filter(x=>x.status==="partial"||x.status==="skipped"), todo=Pl.filter(x=>x.status==="todo").length;
  const over=Pl.length&&part.length/Pl.length>=.3, g=game(), ws=S.plan?S.plan.weekStart:mondayISO();
  const wxp=gameLog().filter(e=>e.d>=ws).reduce((t,e)=>t+(e.m||0),0);
  const cs=chaps(), cnt=k=>cs.filter(c=>c.status===k).length;
  const lv=[["pas","À commencer","t-none"],["decouverte","1 · Découverte","t-lav"],["arevoir","2 · À revoir","t-rose"],["apprentissage","3 · Apprentissage","t-cream"],["maitrise","4 · Maîtrisé","t-cream"]];
  return `<section class="bilanview">
    <h2 class="mega small">BILAN</h2>
    <div class="tiles">
      <div class="tile"><b>${wxp}</b><span>XP cette semaine</span></div>
      <div class="tile"><b>${g.level}</b><span>niveau · ${g.inLvl}/${LVL} XP</span></div>
      <div class="tile"><b class="cream">${g.streak} j</b><span>série en cours</span></div>
      <div class="tile"><b class="rose">${done}</b><span>quêtes faites</span></div>
      <div class="tile"><b>${part.length}</b><span>pas finies ou pas faites</span></div>
      <div class="tile"><b>${todo}</b><span>à venir</span></div>
    </div>
    ${bossBar(false)}
    ${(()=>{const b=boss();return b.days>0&&b.todo?`<p class="pace ${b.pace>2?"hot":""}">Il reste <b>${b.todo} chapitre${b.todo>1?"s":""}</b> à commencer et <b>${b.weeks} semaine${b.weeks>1?"s":""}</b> avant les partiels : vise <b>${b.pace} nouveau${b.pace>1?"x":""} chapitre${b.pace>1?"s":""} par semaine</b> pour tout voir et garder la dernière semaine pour réviser.</p>`:""})()}
    ${over?`<div class="warn">Beaucoup de quêtes pas finies : l'objectif était trop ambitieux, ce n'est pas un manque de discipline. Baisse ton temps réel la semaine prochaine (Réglages › Temps réel).</div>`:""}
    ${progress()}
    <h3 class="sec">Succès · ${Object.keys(S.ach||{}).length}/${ACH.length}</h3>
    <div class="achs">${ACH.map(a=>{const on=S.ach&&S.ach[a.id];return `<div class="ach ${on?"on":""}" title="${esc(a.h)}"><span class="ach-i" aria-hidden="true">${on?'<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 2l3 6.5 7 .8-5.2 4.8 1.5 7L12 17.6 5.7 21l1.5-7L2 9.3l7-.8z" fill="currentColor"/></svg>':'<svg viewBox="0 0 24 24" width="16" height="16"><rect x="6" y="11" width="12" height="9" rx="2" fill="currentColor"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>'}</span><b>${esc(a.t)}</b><small>${on?"débloqué le "+frDate(on):esc(a.h)}</small></div>`}).join("")}</div>
    <h3 class="sec">Niveau de tes chapitres</h3>
    <div class="lvls">${cs.length?lv.map(([k,t,c])=>{const n=cnt(k);return `<div class="lvrow"><span class="lvname">${t}</span><div class="lvtrack"><i class="${c}" style="width:${cs.length?n/cs.length*100:0}%"></i></div><b>${n}</b></div>`}).join(""):`<p class="muted small">Pas encore de chapitres.</p>`}</div>
    <h3 class="sec">À reprendre</h3>
    ${part.length?`<div class="redo">${part.map(x=>`<div class="redo-c"><b>${esc(subj(x.subjId).name)}</b><small>${DAYS[x.day]??""} · ${x.status==="skipped"?"pas fait":"pas fini"}${x.note?" · "+esc(x.note):""}</small>
      <div class="redo-a"><select id="rd-${x.id}" aria-label="Jour du rattrapage">${DAYS.map((d,i)=>`<option value="${i}">${d}</option>`).join("")}</select><select id="rm-${x.id}" aria-label="Durée"><option value="30">30 min</option><option value="45">45 min</option><option value="60" selected>1 h</option></select><button class="btn" data-extra="${x.id}">Rattraper</button></div></div>`).join("")}</div>`
      :`<div class="empty">Rien à reprendre. Quand une quête se termine sans être finie, ce qui reste arrive ici.</div>`}
    <details class="mini how"><summary><b>Les règles du jeu</b></summary>
      <p class="small"><b>À la fin d'une quête</b> : arrête la matière, passe à la suivante, note ce qui n'est pas fini, et prévois un rattrapage séparé si besoin.</p>
      <p class="small"><b>À éviter</b> : décaler toute la semaine, laisser une matière déborder sur la suivante, refaire un planning plus ambitieux pour rattraper.</p>
      <p class="small"><b>XP</b> : 1 minute travaillée = 1 XP. Un niveau tous les ${LVL} XP. Journée parfaite (toutes les quêtes du jour faites) : +25 XP. La série compte les jours d'affilée avec au moins une quête faite.</p>
      <p class="small"><b>Boss des partiels</b> : 4 PV par chapitre. Chaque niveau gagné sur un chapitre (Découverte → À revoir → Apprentissage → Maîtrisé) lui retire 1 PV. Le but : l'amener le plus bas possible avant la semaine d'examens.</p>
    </details>
    <button class="btn primary big" data-newweek>NOUVELLE SEMAINE</button>
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
function commit(rerender=true){try{checkGame()}catch(e){}save();if(rerender)render();else renderBudget()}

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
    ${c?`<div class="defi"><b>Défi feuille blanche</b><p>Cours fermé, écris tout ce que tu sais, puis compare. Tu retrouves…</p>${stageBox(cur)}${links(c)}</div>`:""}
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
    ${links(c)}
    <p class="muted small">${c.last?`Vu le ${frDate(c.last)}`:"Pas encore vu"}${c.next&&c.status!=="pas"?` · prochaine révision ${frDate(c.next)}`:""}${c.revs?` · ${c.revs} révision${c.revs>1?"s":""}`:""}</p>
    <div class="order"><span class="kicker">ORDRE DANS LA MATIÈRE</span>
      <div class="row-2"><button class="btn" data-chmove="${c.id}" data-dir="-1" ${chaps().filter(x=>x.subjId===c.subjId)[0]===c?"disabled":""}>↑ Monter</button><button class="btn" data-chmove="${c.id}" data-dir="1" ${chaps().filter(x=>x.subjId===c.subjId).slice(-1)[0]===c?"disabled":""}>↓ Descendre</button></div></div>
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
  if(d.tab){S.tab=d.tab;if(d.tab!=="reglages")S.sub=null;if(d.tab==="semaine")S.weekDay=null;commit();return}
  if(d.wday!=null){S.weekDay=+d.wday;commit();return}
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
    closeModal();commit();toast(c&&on?`+${workOf(x.mins)} XP · revu le ${frDate(c.next)}`:`+${workOf(x.mins)} XP`,before);return}
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
  if(d.joker!=null){openJoker();return}
  if(d.jokerok!=null){const before=snap(),td=(new Date().getDay()+6)%7,t=todayISO();
    (S.off=S.off||[]).push(t);S.plan.sessions.forEach(x=>{if(x.day===td&&x.status==="todo")x.status="off"});
    if(S.timer)S.timer=null;closeModal();commit();toast("Joker posé · repose-toi",before);return}
  if(d.tutor){const c=chaps().find(c=>c.id===d.tutor);if(!c)return;const txt=tutorMsg(c);
    const done=()=>toast("Copié · colle-le dans ton projet Claude « L2 - revisions »");
    try{navigator.clipboard.writeText(txt).then(done,()=>{prompt("Copie ce message :",txt)})}catch(e){prompt("Copie ce message :",txt)}return}
  if(d.wkbar!=null){const el=document.getElementById("wkcap");if(el)el.textContent=d.wkcap;document.querySelectorAll("[data-wkbar]").forEach(z=>z.classList.toggle("on",z===b));return}
  if(d.chmove){const A=chaps(),i=A.findIndex(c=>c.id===d.chmove),c=A[i],dir=+d.dir;
    let j=i+dir;while(j>=0&&j<A.length&&A[j].subjId!==c.subjId)j+=dir;
    if(j>=0&&j<A.length){[A[i],A[j]]=[A[j],A[i]];commit();openChap(c.id)}return}
  if(d.mapsubj){S.mapSubj=d.mapsubj;commit();return}
  if(d.chsave){const before=snap(),c=chaps().find(c=>c.id===d.chsave),on=document.querySelector("#modal [data-cst].on");
    if(c&&on&&on.dataset.cst!==c.status){const k=on.dataset.cst;c.status=k;if(k==="pas"){c.next=null}else{c.last=todayISO();c.next=addDays(todayISO(),CST[k].d)}}
    closeModal();commit();toast(c?`Niveau : ${c.status==="pas"?"pas commencé":CST[c.status].t.toLowerCase()}`:"Enregistré",before);return}
  if(d.guess){const box=b.closest(".stagebox");box.querySelectorAll("[data-cst]").forEach(z=>z.classList.toggle("on",z.dataset.cst===d.guess));box.querySelectorAll("[data-guess]").forEach(z=>z.classList.toggle("on",z===b));return}
  if(d.addch){const inp=document.getElementById("nc-"+d.addch),n=inp.value.trim();if(!n)return;chaps().push({id:uid(),subjId:d.addch,name:n,status:"pas",last:null,next:null,revs:0});commit();toast("Chapitre ajouté");document.getElementById("nc-"+d.addch)?.focus();return}
  if(d.delch){const before=snap(),c=chaps().find(c=>c.id===d.delch);S.chapters=chaps().filter(c=>c.id!==d.delch);if(!document.getElementById("modal").hidden)closeModal();commit();toast("Chapitre supprimé",before);return}
  if(d.skip){openSkip(d.skip);return}
  if(d.skipok){const before=snap();const x=S.plan.sessions.find(s=>s.id===d.skipok);x.status="skipped";x.note=document.getElementById("skNote").value.trim();if(S.timer&&S.timer.sid===x.id)S.timer=null;closeModal();commit();toast("Noté : pas fait",before);return}
  if(d.skipswap){const before=snap();const x=S.plan.sessions.find(s=>s.id===d.skipswap);const sj=document.getElementById("skSubj").value,cid=document.getElementById("skChap").value;
    const on=document.querySelector("#modal .skip-alt [data-cst].on");
    x.origSubjId=x.origSubjId||x.subjId;x.subjId=sj;x.status="done";x.note="à la place de "+subj(x.origSubjId).name;
    const c=cid&&chaps().find(c=>c.id===cid);
    if(c){x.chapId=c.id;if(on){const k=on.dataset.cst,dt=addDays(S.plan.weekStart||mondayISO(),x.day),base=dt<todayISO()?dt:todayISO();c.status=k;c.last=base;c.next=addDays(base,CST[k].d);(c.hist=c.hist||[]).push(base);c.revs=(c.revs||0)+1}}
    logDrop(x.id);logAdd(x,workOf(x.mins));
    if(S.timer&&S.timer.sid===x.id)S.timer=null;closeModal();commit();toast("Enregistré",before);return}
  if(d.undo){const before=snap();const x=S.plan.sessions.find(s=>s.id===d.undo);if(x.status==="off"){const t=todayISO();S.off=(S.off||[]).filter(z=>z!==t);S.plan.sessions.forEach(y=>{if(y.day===x.day&&y.status==="off")y.status="todo"})}x.status="todo";logDrop(x.id);commit();toast("Quête remise à faire",before);return}
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
  if(d.notion){subj(d.notion).notion=t.value.trim();commit(false);return}
});
document.addEventListener("change",e=>{
  const t=e.target,d=t.dataset;
  if(d.listed){S.listed[d.listed]=t.checked;commit(false);return}
  if(t.id==="notDone"){const n=document.getElementById("endNote");n.hidden=!t.checked;if(t.checked)n.focus();return}
  if(d.sksubj!=null){document.getElementById("skChap").innerHTML=chapOpts(t.value);return}
  if(d.daystart!=null){if(t.value){S.dayStart=t.value;commit()}return}
  if(d.examstart!=null){if(t.value){S.examStart=t.value;commit()}return}
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

/* au démarrage : succès déjà mérités débloqués sans fête, puis affichage */
try{const had=JSON.stringify([S.ach,S.lvlSeen,S.log&&S.log.length]);checkGame();celebQ=[];if(JSON.stringify([S.ach,S.lvlSeen,S.log&&S.log.length])!==had)save()}catch(e){}
render();

}
