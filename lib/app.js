// Interface de l'appli (reprise de la version Claude), branchée sur Supabase par la page.
import * as P from "./planner";
import { merge3, stable } from "./merge";
import * as SP from "./spotify";
import * as CK from "./cards";
import { INBOX, REMOVE } from "./card-inbox";
import { PATCHES } from "./patches";

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
const TABS=[{k:"today",t:"Quêtes"},{k:"cartes",t:"Cartes"},{k:"semaine",t:"Semaine"},{k:"chapitres",t:"Chapitres"},{k:"bilan",t:"Bilan"},{k:"reglages",t:"Réglages"}];
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
const subj=id=>P.subjOf(S,id);
/* heure actuelle : aujourd'hui, les quêtes restantes partent de maintenant (jamais d'horaire déjà passé) */
const nowMin=()=>{const n=new Date();return n.getHours()*60+n.getMinutes()};
const STOP=18*60;
function layoutDay(d){const td=(new Date().getDay()+6)%7;return P.dayLayout(S,d,d===td&&S.plan&&S.plan.weekStart===mondayISO()?{from:nowMin()}:{})}
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
  let streak=0; const rest=x=>(S.avail||[])[(new Date(x+"T12:00:00").getDay()+6)%7]===0; // jour sans révision prévue (ex. dimanche libre) : ne casse pas la série
  for(let k=0;k<400;k++){if(days.has(d)){streak++;d=addDays(d,-1)}else if(off.has(d)||rest(d)){d=addDays(d,-1)}else break}
  return {xp,level:Math.floor(xp/LVL)+1,inLvl:xp%LVL,streak,today:days.has(todayISO())};
}
/* ---------- joker : une journée off par semaine ---------- */
function jokerLeft(){const ws=S.plan?S.plan.weekStart:mondayISO();return (S.off||[]).filter(d=>d>=ws&&d<=addDays(ws,6)).length?0:1}
function openJoker(){
  const m=document.getElementById("modal");
  m.innerHTML=`<div class="sheet game" role="dialog" aria-modal="true" aria-labelledby="jkT"><div class="grab" aria-hidden="true"></div><button class="sheet-x" data-closemodal aria-label="Fermer"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>
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
4. Termine par 3 questions sur ce que j'ai oublié.
5. Enfin, crée des cartes de révision UNIQUEMENT sur ce que j'ai oublié ou mal dit, une par ligne, exactement au format :
Question :: Réponse
(une seule info par carte ; question courte ; réponse de 10 mots maximum, simple à redire de tête ; si c'est une liste, découpe en plusieurs cartes ; sans numéro, sans autre texte autour de la liste).`;
}
const notionUrl=s=>s&&s.notion?s.notion:"";
function links(c){
  const s=subj(c.subjId), n=notionUrl(s);
  return `<div class="links"><button class="btn" data-tutor="${c.id}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>Défi avec mon tuteur</button>${n?`<a class="btn" href="${esc(n)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 4.5h10.5a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z M5 17a3 3 0 0 1 3-3h10.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>Ouvrir le cours</a>`:""}</div>`;
}
/* ---------- CARTES : ta propre appli de cartes (algorithme d'Anki), reliée aux chapitres ---------- */
const cards=()=>S.cards||(S.cards=[]);
const cstats=()=>{const d=CK.ankiDay();if(!S.cardStats||S.cardStats.d!==d)S.cardStats={d,n:0,r:0};return S.cardStats};
function addCards(chapId,list){const c=chaps().find(c=>c.id===chapId);if(!c)return 0;let n=0;
  list.forEach(x=>{if(!x.q||!x.a)return;if(cards().some(k=>k.chapId===chapId&&k.q.trim().toLowerCase()===x.q.trim().toLowerCase()))return;cards().push(CK.newCard(chapId,c.subjId,x.q,x.a));n++});return n}
const chapName=id=>{const c=chaps().find(c=>c.id===id);return c?c.name:""};
let RV=null; // séance de révision en cours : {filter, sid, start, shown, undo:[], done}
function openReview(opts={}){RV={filter:opts.chapId?(c=>c.chapId===opts.chapId):null,chapId:opts.chapId||null,sid:opts.sid||null,start:Date.now(),shown:false,undo:[],done:0};renderReview()}
function closeReview(finished){
  if(!RV)return;
  const mins=Math.max(1,Math.round((Date.now()-RV.start)/60000)), x=RV.sid&&S.plan&&S.plan.sessions.find(s=>s.id===RV.sid);
  const q=CK.queue(cards(),cstats(),{filter:RV.filter});
  if(RV.done>0){
    // la quête « Cartes du jour » est faite quand la file du jour est vide (ou au moins une séance faite depuis la quête)
    const td=(new Date().getDay()+6)%7, ak=x||(S.plan&&S.plan.sessions.find(s=>s.day===td&&s.kind==="anki"&&s.status==="todo"));
    if(ak&&ak.status==="todo"&&(!q.next||x)){ak.status="done";logDrop(ak.id);logAdd(ak,mins)}
    else gameLog().push({d:todayISO(),m:mins,sid:"cards-"+Date.now()});
    {const now=Date.now(),d=todayISO(),R=S.focusRun&&S.focusRun.d===d&&now-S.focusRun.at<30*60000?S.focusRun:{d,m:0,at:now};R.m+=mins;R.at=now;S.focusRun=R}
  }
  const el=document.getElementById("review");if(el)el.hidden=true;
  RV=null;commit();
  if(finished)toast("Cartes du jour terminées");
}
/* ordre des cartes : une matière à la fois (on finit la matière en cours), chapitres mélangés à l'intérieur */
const mixKey=id=>{let h=2166136261;for(const ch of id)h=Math.imul(h^ch.charCodeAt(0),16777619);return h>>>0};
function pickCard(q,sid){
  const all=[...q.learn,...q.rev,...q.nw];if(!all.length)return null;
  sid=sid||(q.learn[0]||q.rev[0]||q.nw[0]).subjId;
  const learn=q.learn.filter(k=>k.subjId===sid);if(learn.length)return learn[0];
  const mix=a=>a.filter(k=>k.subjId===sid).sort((x,y)=>mixKey(x.id)-mixKey(y.id));
  return mix(q.rev)[0]||mix(q.nw)[0]||null;
}
/* fin d'une matière : écran « c'est fini, on passe à la suivante » */
function showSubjDone(el,q){
  const done=subj(RV.subj), nx=subj(RV.nextSubj), n=[...q.learn,...q.rev,...q.nw].filter(k=>k.subjId===RV.nextSubj).length||q.ahead.filter(k=>k.subjId===RV.nextSubj).length;
  const others=new Set([...q.learn,...q.rev,...q.nw].map(k=>k.subjId)).size;
  el.innerHTML=`<div class="rv-top"><button class="focus-min" data-rvclose aria-label="Quitter la révision" title="Quitter (Échap)"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button><span></span><span></span></div>
  <div class="rv-done rv-subjdone">
    <p class="kicker">${sdot(RV.subj)}${esc((done?done.name:"").toUpperCase())}</p>
    <h2 class="mega small">C'EST FINI ✓</h2>
    <p>${RV.sn||0} carte${(RV.sn||0)>1?"s":""} revue${(RV.sn||0)>1?"s":""} dans cette matière. Respire 10 secondes avant de changer de sujet.</p>
    <div class="rv-next" style="--sc:${scol(RV.nextSubj)}"><small>MATIÈRE SUIVANTE${others>1?` · encore ${others} matières`:""}</small><b>${sdot(RV.nextSubj)}${esc(nx?nx.name:"")}</b><span>${n} carte${n>1?"s":""}</span></div>
    <button class="btn primary big" data-rvnext>ON PASSE À LA SUIVANTE</button>
    <button class="btn ghost" data-rvclose data-fin="1">J'arrête là pour aujourd'hui</button>
  </div>`;
}
function renderReview(){
  let el=document.getElementById("review");
  if(!el){el=document.createElement("div");el.id="review";el.setAttribute("role","dialog");el.setAttribute("aria-modal","true");el.setAttribute("aria-label","Révision des cartes");document.body.appendChild(el)}
  el.hidden=false;
  let q=CK.queue(cards(),cstats(),{filter:RV.filter}); let c=null, ahead=false;
  // la carte en cours reste affichée jusqu'à la réponse (une carte « 1 min » qui arrive à échéance ne la remplace plus)
  const cur=RV.card&&cards().find(k=>k.id===RV.card&&!k.suspended);
  if(cur){c=cur;ahead=(cur.type===CK.LEARN||cur.type===CK.RELEARN)&&cur.due>Date.now()}
  else if(RV.subj){
    // on reste dans la matière en cours jusqu'à la dernière carte (y compris celles « à revoir dans quelques minutes »)
    c=pickCard(q,RV.subj);if(!c){const a=q.ahead.find(k=>k.subjId===RV.subj);if(a){c=a;ahead=true}}
    if(!c){const first=q.learn[0]||q.rev[0]||q.nw[0]||q.nextAhead;
      if(first){RV.nextSubj=first.subjId;showSubjDone(el,q);return}
      RV.subj=null}
  }
  if(!c&&!cur){c=pickCard(q,RV.nextSubj||null);RV.nextSubj=null;if(!c&&q.nextAhead){c=q.nextAhead;ahead=true}}
  if(c&&c.subjId!==RV.subj){RV.subj=c.subjId;RV.sn=0}
  const top=`<div class="rv-top"><button class="focus-min" data-rvclose aria-label="Quitter la révision" title="Quitter (Échap)"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>
    <div class="rv-counts" aria-label="Nouvelles, à apprendre, à revoir"><span class="n">${q.counts.n}</span><span class="l">${q.counts.l}</span><span class="r">${q.counts.r}</span></div>
    <button class="focus-min" data-rvundo ${RV.undo.length?"":"disabled"} aria-label="Annuler la dernière réponse" title="Annuler (Z)"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 9h11a5 5 0 0 1 0 10H8M4 9l4-4M4 9l4 4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>`;
  if(!c){
    const total=cards().filter(k=>!RV.filter||RV.filter(k)).length;
    el.innerHTML=`${top}<div class="rv-done"><p class="kicker">${RV.chapId?esc(chapName(RV.chapId).toUpperCase()):"CARTES DU JOUR"}</p><h2 class="mega small">${total?"C'EST FINI":"AUCUNE CARTE"}</h2>
      <p>${total?`${RV.done} carte${RV.done>1?"s":""} revue${RV.done>1?"s":""}. Les suivantes reviennent quand il faudra.`:"Ajoute des cartes depuis l'onglet Cartes, ou colle celles de ton tuteur à la fin d'une séance."}</p>
      <button class="btn primary big" data-rvclose data-fin="1">TERMINER</button></div>`;
    return;
  }
  RV.card=c.id;
  const pv=CK.preview(c), L=["À revoir","Difficile","Correct","Facile"];
  el.innerHTML=`${top}<div class="rv-card">
    <p class="kicker">${sdot(c.subjId)}${esc(subj(c.subjId)?subj(c.subjId).name.toUpperCase():"")} · ${esc(chapName(c.chapId))}${ahead?" · en avance":""} <span class="rv-state">${CK.stateOf(c)}</span></p>
    <div class="rv-q">${esc(c.q)}</div>
    ${RV.shown?`<hr><div class="rv-a">${esc(c.a)}</div>`:""}
    <button class="rv-edit" data-cedit="${c.id}" title="Modifier la carte">Modifier</button>
  </div>
  <div class="rv-acts">${RV.shown?`<div class="rv-btns">${pv.map((p,i)=>`<button class="rv-b b${i+1}" data-rvans="${i+1}"><small>${p.label}</small><b>${L[i]}</b></button>`).join("")}</div>`
    :`<button class="btn primary big" data-rvshow>AFFICHER LA RÉPONSE</button>`}
    <p class="muted small rv-keys">${RV.shown?"Clavier : 1 À revoir · 2 Difficile · 3 Correct · 4 Facile":"Clavier : espace pour afficher"}</p></div>`;
}
function rvAnswer(b){
  if(!RV||!RV.shown||Date.now()-(RV.shownAt||0)<600)return;
  const c=cards().find(k=>k.id===RV.card);if(!c)return;
  RV.undo.push({id:c.id,card:JSON.stringify(c),st:JSON.stringify(cstats())});
  const wasNew=c.type===CK.NEW;CK.answer(c,b);const st=cstats();if(wasNew)st.n++;st.r++;
  RV.done++;RV.sn=(RV.sn||0)+1;RV.shown=false;RV.card=null;save();renderReview();
}
function openDeck(chapId){
  const c=chaps().find(c=>c.id===chapId);if(!c)return;
  const ks=cards().filter(k=>k.chapId===chapId), q=CK.queue(cards(),cstats(),{filter:k=>k.chapId===chapId});
  const m=document.getElementById("modal");
  m.innerHTML=`<div class="sheet game deck" role="dialog" aria-modal="true" aria-labelledby="dkT"><div class="grab" aria-hidden="true"></div><button class="sheet-x" data-closemodal aria-label="Fermer"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>
    <p class="kicker">${esc(subj(c.subjId).name.toUpperCase())} · CARTES</p><h2 id="dkT">${esc(c.name)}</h2>
    <div class="pills"><span class="pill">${ks.length} carte${ks.length>1?"s":""}</span><span class="pill cream">${q.counts.n+q.counts.l+q.counts.r} à voir</span></div>
    ${ks.length?`<button class="btn primary big" data-crev="${chapId}">RÉVISER CE CHAPITRE</button>`:""}
    <div class="defi"><b>Ajouter une carte</b>
      <input id="cQ" placeholder="Question" autocomplete="off"><textarea id="cA" placeholder="Réponse" rows="2"></textarea>
      <button class="btn" data-cadd="${chapId}">Ajouter</button></div>
    <details class="defi"><summary><b>Coller plusieurs cartes</b> <span class="muted small">(ex. celles du tuteur)</span></summary>
      <textarea id="cBulk" rows="5" placeholder="Question :: Réponse&#10;Une carte par ligne"></textarea><button class="btn" data-cbulk="${chapId}">Ajouter ces cartes</button></details>
    ${ks.length?`<div class="clist">${ks.map(k=>`<div class="crow ${k.suspended?"susp":""}"><div><b>${esc(k.q)}</b><small>${esc(k.a)}</small></div><span class="cst">${k.suspended?"suspendue":CK.stateOf(k)}</span><button class="ic" data-cedit="${k.id}" aria-label="Modifier">✎</button></div>`).join("")}</div>`:`<p class="muted small">Pas encore de carte pour ce chapitre.</p>`}
  </div>`;
  m.hidden=false;
}
function openCardEdit(id){
  const k=cards().find(k=>k.id===id);if(!k)return;
  const m=document.getElementById("modal");
  m.innerHTML=`<div class="sheet game" role="dialog" aria-modal="true" aria-labelledby="ceT"><div class="grab" aria-hidden="true"></div><button class="sheet-x" data-closemodal aria-label="Fermer"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>
    <p class="kicker">${esc(chapName(k.chapId).toUpperCase())}</p><h2 id="ceT">Modifier la carte</h2>
    <label class="muted small" for="eQ">Question</label><textarea id="eQ" rows="2">${esc(k.q)}</textarea>
    <label class="muted small" for="eA">Réponse</label><textarea id="eA" rows="3">${esc(k.a)}</textarea>
    <p class="muted small">${CK.stateOf(k)}${k.type===CK.REVIEW?` · prochaine fois le ${frDate(k.due)} · intervalle ${k.ivl} j`:""}${k.lapses?` · oubliée ${k.lapses} fois`:""}</p>
    <div class="sheet-acts"><button class="btn primary big" data-csave="${k.id}">ENREGISTRER</button>
      <div class="row-2"><button class="btn ghost" data-csusp="${k.id}">${k.suspended?"Réactiver":"Suspendre"}</button><button class="btn ghost danger" data-cdel="${k.id}">Supprimer</button></div></div></div>`;
  m.hidden=false;
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
/* ---------- explication du jeu (XP, niveau, série, boss) ---------- */
function openGameHelp(){
  const g=game(), b=boss(), m=document.getElementById("modal");
  const row=(ic,t,big,txt)=>`<div class="gh-row"><div class="gh-ic ${ic}">${big}</div><div><b>${t}</b><p>${txt}</p></div></div>`;
  m.innerHTML=`<div class="sheet game" role="dialog" aria-modal="true" aria-labelledby="ghT"><div class="grab" aria-hidden="true"></div><button class="sheet-x" data-closemodal aria-label="Fermer"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>
    <p class="kicker">LES RÈGLES DU JEU</p><h2 id="ghT" class="mega small">COMMENT ÇA MARCHE</h2>
    ${row("xp","XP : ton temps de travail","+1","<b>1 minute de travail = 1 XP.</b> Une séance d'1 h rapporte 50 XP (50 min de travail). Journée entièrement faite : <b>+25 XP bonus</b>.")}
    ${row("lv","Niveau : tous les "+LVL+" XP",g.level,`Tu es <b>niveau ${g.level}</b>. Encore <b>${LVL-g.inLvl} XP</b> (environ ${Math.ceil((LVL-g.inLvl)/50)} séance${Math.ceil((LVL-g.inLvl)/50)>1?"s":""} d'1 h) pour passer niveau ${g.level+1}.`)}
    ${row("st","Série : jours d'affilée",`${FLAME}${g.streak}`,`<b>${g.streak} jour${g.streak>1?"s":""} de suite</b> avec au moins une quête faite. La flamme est grise tant que tu n'as rien fait aujourd'hui. Ton joker (1 par semaine) protège la série.`)}
    ${b.max?row("bo","Boss : ce qu'il reste avant les partiels",b.hp,`Chaque chapitre a 4 étapes (Découverte → À revoir → Apprentissage → Maîtrisé). Le boss a <b>1 PV par étape pas encore atteinte</b> : il lui en reste <b>${b.hp}</b> sur ${b.max}. Quand tu fais monter un chapitre d'une étape, il perd 1 PV. <b>À 0 PV, tout est maîtrisé</b> pour le ${new Date(b.ex+"T12:00:00").toLocaleDateString("fr-FR",{day:"numeric",month:"long"})}.`):""}
    <button class="btn primary big" data-closemodal>COMPRIS</button>
  </div>`;
  m.hidden=false;
}
function bossBar(compact){
  const b=boss(); if(!b.max)return"";
  const pct=Math.round(b.hp/b.max*100), ex=new Date(b.ex+"T12:00:00").toLocaleDateString("fr-FR",{day:"numeric",month:"short"});
  return `<button class="boss ${compact?"compact":""}" data-gamehelp aria-label="Boss des partiels : il lui reste ${b.hp} points de vie. Comment ça marche ?">
    <div class="boss-t"><b>BOSS · PARTIELS</b><span>${b.days>0?`J-${b.days} · ${ex}`:b.days===0?"C'est aujourd'hui":"terminé"}</span></div>
    <div class="boss-bar"><i style="width:${pct}%"></i></div>
    <div class="boss-s"><span><b>${b.hp} PV</b> restants · déjà −${b.max-b.hp}</span><span>1 étape de chapitre gagnée = −1 PV</span></div>
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
  const td=(new Date().getDay()+6)%7, L=S.plan?layoutDay(td):[], d=todayISO();
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
  return `<button class="hud" data-gamehelp aria-label="Niveau ${g.level}, ${LVL-g.inLvl} XP avant le niveau ${g.level+1}, série de ${g.streak} jour${g.streak>1?"s":""}. Comment ça marche ?">
    <div class="lvl" aria-hidden="true">${g.level}</div>
    <div class="xp"><div class="xp-t"><span>Niveau ${g.level}</span><span>${LVL-g.inLvl} XP → niv. ${g.level+1}</span></div><div class="xp-bar"><i style="width:${Math.round(g.inLvl/LVL*100)}%"></i></div></div>
    <div class="streak ${g.today?"":"dim"}" aria-hidden="true">${FLAME}<b>${g.streak}</b><small>j</small></div>
    <span class="hud-i" aria-hidden="true">?</span>
  </button>`;
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
function chapLine(x,i){const c=x.chapId&&chaps().find(c=>c.id===x.chapId);if(!c)return"";const K={quick:"test rapide",relearn:"à réapprendre",disc:"nouvelle explication",new:"nouveau chapitre",ahead:"en avance",rappel:"rappel J+1"};return `<div class="chap">→ ${esc(c.name)} ${stagePill(c,addDays(S.plan.weekStart||mondayISO(),i))}${x.status==="todo"&&K[x.kind]?` <span class="al">${K[x.kind]}</span>`:""}</div>`}
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

/* ---------- couleurs : une par matière (ordre des matières), stable partout ---------- */
const SUBJ_COLORS=["#F2B8C6","#B9A6E8","#9FC4F2","#86D0D6","#E2A8E6","#F3E3C3","#D9C29E","#B7C0D8","#F0A9A0","#C6D99A"];
function scol(id){if(id===P.ANKI)return"#ECE4DA";const i=S.subjects.findIndex(s=>s.id===id);return SUBJ_COLORS[(i<0?0:i)%SUBJ_COLORS.length]}
const sdot=id=>`<i class="sdot" style="--sc:${scol(id)}" aria-hidden="true"></i>`;
/* durée lisible : « 2 × 25 MIN » pour une séance en Pomodoros, « 25 MIN » pour un seul bloc */
function pomoLbl(x){if(x.kind==="anki")return x.mins+" MIN";const sg=P.segsOf(workOf(x.mins));return sg.length>1?`${sg.length} × ${sg[0]} MIN`:`${sg[0]} MIN`}
const durLbl=x=>pomoLbl(x).replace("MIN","min");
function sessCard(o,opts){
  const {x,a,w}=o, s=subj(x.subjId), c=x.chapId&&chaps().find(c=>c.id===x.chapId);
  const K={quick:"Défi éclair",relearn:"À réapprendre",disc:"Nouvelle explication",new:"Nouveau chapitre",ahead:"En avance",review:"Révision",rappel:"Rappel J+1 · mini feuille blanche",anki:"Cartes du jour"};
  const running=S.timer&&S.timer.sid===x.id&&(S.timer.phase==="work"||S.timer.phase==="mini");
  const xp=workOf(x.mins);
  const st=x.status==="done"?"Fait":x.status==="partial"?"Pas fini":x.status==="skipped"?"Pas fait":x.status==="off"?"Joker":"";
  if(opts.hero){
    const lv=c?Math.max(0,ORDER.indexOf(c.status)+1):0;
    return `<article class="quest" style="--sc:${scol(x.subjId)}">
      <div class="quest-top"><span>${a<=nowMin()&&x.status==="todo"?"Maintenant":fmtT(a)} → ${fmtT(w)}${K[x.kind]?" · "+K[x.kind]:""}</span><b>+${xp} XP</b></div>
      <h3>${sdot(x.subjId)}${esc(s.name)}</h3>
      ${x.kind==="rappel"?`<p class="quest-tip">10 min : écris de mémoire tout ce que tu retiens, puis vérifie avec le cours.</p>`:x.kind==="anki"?`<p class="quest-tip">${(()=>{const q=CK.queue(cards(),cstats());const n=q.counts.n+q.counts.l+q.counts.r;return cards().length?`${n} carte${n>1?"s":""} à voir aujourd'hui, avant tout contenu nouveau.`:"Pas encore de carte : ajoute-les dans l'onglet Cartes (ou via le tuteur en fin de séance)."})()}</p>`:""}
      ${c?`<p class="quest-chap">${esc(c.name)}</p>
      <div class="lvbar st-${c.status}"><span aria-hidden="true">${[1,2,3,4].map(n=>`<i class="${n<=lv?"on":""}"></i>`).join("")}</span>Niveau ${lv}/4 · ${c.status==="pas"?"à commencer":CST[c.status].t.toLowerCase()}${alertOf(c)==="late"&&c.status!=="decouverte"?" · en retard":""}</div>`:""}
      ${running?`<button class="btn primary big" data-focus>Reprendre le minuteur</button>`:`<button class="btn primary big" data-start="${x.id}">JOUER · ${pomoLbl(x)}</button>`}
      <div class="quest-sub"><button class="btn ghost" data-done="${x.id}">Déjà fait</button><button class="btn ghost" data-skip="${x.id}">Pas fait</button></div>
      ${c?links(c):""}
    </article>`;
  }
  const tone={r:"t-rose",y:"t-lav",g:"t-cream"}[s.diff]||"t-lav";
  return `<div class="qrow ${x.status}">
      <span class="qtime ${w>STOP&&x.status==="todo"?"over":""}" style="background:${scol(x.subjId)}">${fmtT(a)}</span>
      <div class="qmain"><b>${esc(s.name)}</b><small><span class="qdur">${durLbl(x)}</span>${c?" · "+esc(c.name):""}${x.chap2&&chaps().find(k=>k.id===x.chap2)?" + "+esc(chaps().find(k=>k.id===x.chap2).name):""}${st?" · "+st:""}</small></div>
      ${x.status==="todo"?`<span class="qxp">+${xp}</span>${x.day===(new Date().getDay()+6)%7&&!running?`<button class="ic go" data-start="${x.id}" aria-label="Lancer cette quête maintenant"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8 5.5v13l10-6.5z" fill="currentColor"/></svg></button>`:""}<button class="ic" data-done="${x.id}" aria-label="Marquer comme fait"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`:`<button class="ic" data-undo="${x.id}" aria-label="Remettre à faire"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9h11a5 5 0 0 1 0 10H8M4 9l4-4M4 9l4 4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`}
    </div>`;
}
const short=n=>n.replace(/^Psychologie (du |de la |)/,"").replace(/^./,c=>c.toUpperCase()).replace("Neurosciences fonctionnelles","Neurosciences").replace("Connaissance de la pratique","Pratique");
const views={
today(){
  planWeek();
  const td=(new Date().getDay()+6)%7, L=layoutDay(td);
  const todo=L.filter(o=>o.x.status==="todo"), fin=L.filter(o=>o.x.status!=="todo");
  const late=chaps().filter(c=>alertOf(c)==="late").length;
  const dl=new Date().toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"}).replace(/\./g,"").toUpperCase();
  const tmr=td<6?layoutDay(td+1).filter(o=>o.x.status==="todo"&&o.x.kind!=="anki"):[];
  return `<section class="today">
    ${RIPPLE("ripple")}
    ${hud()}
    ${bossBar(true)}
    <p class="kicker">${dl} · <span class="now">${fmtT(nowMin())}</span>${L.length?` · QUÊTE ${Math.min(fin.length+1,L.length)}/${L.length}`:""}</p>
    ${todo.length&&todo[todo.length-1].w>STOP?`<p class="late18">Il est ${fmtT(nowMin())} : ${todo.filter(o=>o.w>STOP).length} quête${todo.filter(o=>o.w>STOP).length>1?"s":""} dépasse${todo.filter(o=>o.w>STOP).length>1?"nt":""} 18 h. Fais ce qui tient avant 18 h, le reste revient automatiquement les jours suivants.</p>`:""}
    <h2 class="mega">QUÊTES<br>DU J<span>O</span>UR</h2>
    ${L.length?`<div class="segs" role="progressbar" aria-valuenow="${fin.length}" aria-valuemin="0" aria-valuemax="${L.length}" aria-label="${fin.length} quêtes sur ${L.length}">${L.map(o=>`<i class="${o.x.status==="todo"?"":"on"}"></i>`).join("")}</div>`:""}
    ${todo.length?sessCard(todo[0],{hero:true}):(S.off||[]).includes(todayISO())?`<div class="win"><b>Joker posé aujourd'hui.</b><span>Repose-toi : ta série est protégée et les chapitres reviennent demain.</span></div>`:L.length?`<div class="win"><b>Toutes les quêtes sont faites.</b><span>Soirée libre méritée.</span></div>`:`<div class="empty">Pas de quête aujourd'hui. Repos.</div>`}
    ${todo.length>1?`<h3 class="sec">Ensuite</h3><div class="qrows">${todo.slice(1).map(o=>(o.gp?`<div class="gpause"><span>Grande pause · 20 min</span><small>Sors de ta bulle : marche, mange, pas d'écran.</small></div>`:"")+sessCard(o,{})).join("")}</div>`:""}
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
    <div class="chips" role="tablist" aria-label="Matières">${all.map(s=>{const n=chaps().filter(c=>c.subjId===s.id&&alertOf(c)==="late").length;return `<button role="tab" class="chip ${s.id===S.mapSubj?"on":""}" aria-selected="${s.id===S.mapSubj}" data-mapsubj="${s.id}" style="--sc:${scol(s.id)}">${sdot(s.id)}${esc(short(s.name))}${n?` <i class="dotlate" aria-label="${n} en retard"></i>`:""}</button>`}).join("")}</div>
    <div class="stleg" aria-label="Couleurs des étapes"><span><i class="sg-decouverte"></i>Découverte</span><span><i class="sg-arevoir"></i>À revoir</span><span><i class="sg-apprentissage"></i>Apprentissage</span><span><i class="sg-maitrise"></i>Maîtrisé</span></div>
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
      <p class="small"><b>Après la 1re séance</b> sur un chapitre : rappel le lendemain (10 min, mini feuille blanche). Puis révisions à <b>J+3, J+7, J+15</b>, puis une fois par mois jusqu'aux partiels.</p>
      <p class="small">L'étape cochée corrige la date : <b>1 · Découverte</b> → nouvelle explication dès le lendemain. <b>2 · À revoir</b> → J+1, puis l'escalier repart. <b>3 · Apprentissage</b> → 3 à 7 jours. <b>4 · Maîtrisé</b> → 15 à 30 jours. Jamais après l'avant-veille des partiels.</p>
      <p class="small">Chaque jour commence par 25 min de cartes. Les rappels en retard passent avant les nouveaux chapitres.</p>
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
      <button class="setrow" data-ankion><span><b>Cartes du jour chaque matin</b><small>25 min au début de chaque jour de révision · ${S.anki===false?"désactivé":"activé"}</small></span><span class="sw ${S.anki===false?"":"on"}" aria-hidden="true"><i></i></span></button>
      <button class="setrow" data-spguide><span><b>Musique Spotify pendant le travail</b><small>${SP.connected()?"Connecté sur cet ordinateur":"Pas connecté"} · ordinateur seulement</small></span><span aria-hidden="true">›</span></button>
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
  const L=layoutDay(sel), tot=L.reduce((t,o)=>t+o.x.mins,0);
  const dd=d=>new Date(addDays(ws,d)+"T12:00:00");
  const row=o=>{const {x,a,w}=o, sj=subj(x.subjId), c=x.chapId&&chaps().find(c=>c.id===x.chapId), past=isPast(sel), tone={r:"t-rose",y:"t-lav",g:"t-cream"}[sj.diff]||"t-lav";
    const st=x.status==="done"?"fait":x.status==="partial"?"pas fini":x.status==="skipped"?"pas fait":x.status==="off"?"joker":past?"fait ou pas fait ?":"";
    return `<div class="wrow ${x.status} ${x.status==="todo"&&past?"ask":""}">
      <span class="qtime" style="background:${scol(x.subjId)}">${x.logged?"noté":fmtT(a)}</span>
      <div class="qmain"><b>${esc(sj.name)}</b><small><span class="qdur">${durLbl(x)}</span> · ${c?esc(c.name)+" · ":""}${c?(c.status==="pas"?"à commencer":CST[c.status].t.toLowerCase()):fmt(workOf(x.mins))}${x.extra?" · rattrapage":""}</small>${st?`<small class="st">${st}</small>`:""}</div>
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
cartes(){
  const q=CK.queue(cards(),cstats()), due=q.counts.n+q.counts.l+q.counts.r, all=cards();
  const mature=all.filter(k=>k.type===CK.REVIEW&&k.ivl>=21).length, young=all.filter(k=>k.type===CK.REVIEW&&k.ivl<21).length, fresh=all.filter(k=>k.type===CK.NEW).length;
  const subs=S.subjects.filter(s=>s.name.trim());
  return `<section class="cardsview">
    <h2 class="mega small">CARTES</h2>
    <div class="cbox">
      <div class="rv-counts big"><span class="n" title="Nouvelles">${q.counts.n}<small>nouvelles</small></span><span class="l" title="À apprendre">${q.counts.l}<small>à apprendre</small></span><span class="r" title="À revoir">${q.counts.r}<small>à revoir</small></span></div>
      ${due?`<button class="btn primary big" data-crev="all">RÉVISER · ${due} CARTE${due>1?"S":""}</button>`:`<p class="muted small">${all.length?(q.nextAhead?"Prochaine carte dans quelques minutes.":"Rien à réviser pour l'instant. Reviens demain."):"Pas encore de carte. Ajoute-les par chapitre ci-dessous, ou colle celles du tuteur à la fin d'une séance."}</p>`}
      <p class="muted small">Aujourd'hui : ${cstats().r} réponse${cstats().r>1?"s":""} · ${cstats().n}/${CK.CFG.newPerDay} nouvelles</p>
    </div>
    <div class="tiles"><div class="tile"><b>${all.length}</b><span>cartes</span></div><div class="tile"><b class="cream">${mature}</b><span>mûres (≥ 21 j)</span></div><div class="tile"><b class="rose">${young+fresh}</b><span>jeunes ou nouvelles</span></div></div>
    <h3 class="sec">Tes paquets</h3>
    ${subs.map(s=>{const cs=chaps().filter(c=>c.subjId===s.id);if(!cs.length)return"";
      return `<details class="dsub" ${cards().some(k=>k.subjId===s.id)?"open":""}><summary><b>${sdot(s.id)}${esc(s.name)}</b><span class="muted small">${cards().filter(k=>k.subjId===s.id).length} cartes</span></summary>
        <div class="qrows">${cs.map(c=>{const ks=cards().filter(k=>k.chapId===c.id),qq=CK.queue(cards(),cstats(),{filter:k=>k.chapId===c.id}),dd=qq.counts.n+qq.counts.l+qq.counts.r;
          return `<button class="deckrow" data-deck="${c.id}"><span class="dname">${esc(c.name)}</span><span class="dc">${ks.length?`${dd?`<i class="dot"></i>${dd} à voir · `:""}${ks.length}`:"+ ajouter"}</span></button>`}).join("")}</div></details>`}).join("")}
    <details class="mini how"><summary><b>Comment ça marche</b></summary>
      <p class="small">Même logique qu'Anki : une nouvelle carte passe par 1 min puis 10 min, puis revient le lendemain. Ensuite, chaque « Correct » allonge l'intervalle (×2,5 environ), « Difficile » le rallonge peu, « Facile » beaucoup, « À revoir » la fait réapprendre.</p>
      <p class="small">35 nouvelles cartes maximum par jour, celles des cours les plus récents d'abord : le cours vu hier a ses cartes dès le lendemain. La quête « Cartes du jour » ouvre directement ta révision chaque matin.</p>
      <p class="small">À la fin d'une séance, le bouton « Défi avec mon tuteur » demande aussi des cartes sur ce que tu as raté : colle-les dans la fenêtre de fin de séance, elles sont rangées dans le bon chapitre.</p>
    </details>
  </section>`;
},
bilan(){
  const Pl=(S.plan?S.plan.sessions:[]).filter(x=>subj(x.subjId));
  const done=Pl.filter(x=>x.status==="done").length, part=Pl.filter(x=>x.status==="partial"||x.status==="skipped"), todo=Pl.filter(x=>x.status==="todo").length;
  const over=Pl.length&&part.length/Pl.length>=.3, g=game(), ws=S.plan?S.plan.weekStart:mondayISO();
  const wxp=gameLog().filter(e=>e.d>=ws).reduce((t,e)=>t+(e.m||0),0);
  const cs=chaps(), cnt=k=>cs.filter(c=>c.status===k).length;
  const lv=[["pas","À commencer","t-none"],["decouverte","1 · Découverte","sg-decouverte"],["arevoir","2 · À revoir","sg-arevoir"],["apprentissage","3 · Apprentissage","sg-apprentissage"],["maitrise","4 · Maîtrisé","sg-maitrise"]];
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
/* ---------- musique (ordinateur) : ta playlist Spotify pendant le travail, rien à l'écran ---------- */
let musicWant=false, spErr="";
const wide=()=>window.matchMedia("(min-width: 760px)").matches;
function musicEl(){
  let el=document.getElementById("music");
  if(!el){el=document.createElement("div");el.id="music";el.hidden=true;
    el.innerHTML=`<button class="mu-b" data-mutoggle aria-label="Couper ou relancer la musique" title="Couper / relancer"><span id="muIco">❚❚</span></button><span class="mu-t" id="muName">♫ Spotify</span><button class="mu-b" data-munext aria-label="Morceau suivant" title="Morceau suivant">⏭</button><input type="range" min="0" max="100" step="5" id="muVol" aria-label="Volume de la musique"><button class="mu-b" data-muoff aria-label="Pas de musique pour cette séance" title="Pas de musique pour cette séance">✕</button>`;
    document.body.appendChild(el);
    el.querySelector("#muVol").addEventListener("input",e=>{S.music.vol=+e.target.value;SP.setVolume(S.music.vol/100);save()});
    SP.onTrack(t=>{const n=document.getElementById("muName");if(n)n.textContent="♫ "+t.name+(t.artist?" · "+t.artist:"")});
  }
  return el;
}
function syncMusic(){
  S.music=S.music||{on:true,vol:35};
  const T=S.timer, play=!!(T&&T.phase==="work"&&T.pausedLeft==null&&!T.rang&&S.music.on!==false&&!S.music.skip&&wide()&&SP.connected());
  const el=document.getElementById("music");
  if(!play){musicWant=false;SP.pause();if(el)el.hidden=true;return}
  const m=musicEl();m.hidden=false;m.querySelector("#muVol").value=S.music.vol??35;musicWant=true;
  document.getElementById("muIco").textContent=S.music.paused?"▶":"❚❚";
  if(S.music.paused){SP.pause();return}
  SP.play(S.music.playlist).then(()=>SP.setVolume((S.music.vol??35)/100)).catch(e=>{spErr=e.message||String(e);toast("Spotify : "+spErr)});
}
async function keepAwake(on){try{if(on&&!wake&&navigator.wakeLock){wake=await navigator.wakeLock.request("screen");wake.addEventListener("release",()=>{wake=null})}else if(!on&&wake){await wake.release();wake=null}}catch(e){}}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&S.timer)keepAwake(true)});
/* grande pause : après ~2 h de travail enchaîné (cartes comprises), la pause de fin de séance passe à 20 min.
   Le compteur repart à zéro après une grande pause, une coupure de plus de 30 min, ou un nouveau jour. */
function endPause(x){
  const now=Date.now(),d=todayISO(),R=S.focusRun&&S.focusRun.d===d&&now-S.focusRun.at<30*60000?S.focusRun:{d,m:0,at:now};
  R.m+=workOf(x.mins);R.at=now;
  if(R.m>=100){S.focusRun={d,m:0,at:now};return P.BIG_PAUSE}
  S.focusRun=R;return P.endPauseOf(x.mins);
}
function startTimer(x){const segs=P.segsOf(workOf(x.mins)),ms=segs[0]*60000;S.timer={sid:x.id,phase:"work",endAt:Date.now()+ms,total:ms,segs,seg:0,done:0};timerMin=false;keepAwake(true);commit()}
function nextSeg(){const T=S.timer;if(!T||!T.segs)return;delete T.segEnd;T.seg=(T.seg||0)+1;T.phase="work";T.total=T.segs[T.seg]*60000;T.endAt=Date.now()+T.total;delete T.pausedLeft;commit()}
/* rituel avant de jouer : bulle de concentration, objectif, respiration */
let brTick=null;
function openRitual(id){
  const x=S.plan.sessions.find(s=>s.id===id);if(!x)return;
  const c=x.chapId&&chaps().find(c=>c.id===x.chapId);
  const prev=x.chapId?S.plan.sessions.filter(y=>y.chapId===x.chapId&&y.id!==x.id&&y.note&&y.status!=="todo").map(y=>y.note).pop():"";
  const m=document.getElementById("modal");
  m.innerHTML=`<div class="sheet game ritual" role="dialog" aria-modal="true" aria-labelledby="rtT"><div class="grab" aria-hidden="true"></div><button class="sheet-x" data-closemodal aria-label="Fermer"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>
    <p class="kicker">AVANT DE JOUER · ${esc(subj(x.subjId).name.toUpperCase())}</p><h2 id="rtT" class="mega small">TA BULLE</h2>
    ${c?`<p class="muted">${esc(c.name)}</p>`:""}
    <button class="rt-step" data-rphone aria-pressed="false"><span class="rt-n">1</span><span><b>Téléphone dans une autre pièce</b><small>Pas juste retourné : hors de portée.</small></span><span class="rt-ok" aria-hidden="true">✓</span></button>
    <div class="rt-step static"><span class="rt-n">2</span><label for="rGoal"><b>Mon objectif pour cette séance</b><small>${prev?"Dernière fois : "+esc(prev):"Une chose précise et faisable en "+workOf(x.mins)+" min."}</small>
      <input id="rGoal" maxlength="90" value="${esc(x.goal||"")}" placeholder="ex : finir la partie 2"></label></div>
    <div class="rt-step static" id="rtBreath"><span class="rt-n">3</span><span><b>1 minute de respiration</b><small>Inspire 4 s, expire 6 s : le corps se calme, l'esprit se pose.</small></span><button class="btn" data-rbreath>Respirer</button></div>
    <button class="btn primary big" data-rgo="${x.id}">C'EST PARTI</button>
    <p class="muted small" style="text-align:center">${P.segsOf(workOf(x.mins)).length>1?P.segsOf(workOf(x.mins)).length+" Pomodoros de 25 min, 5 min de pause entre les deux":workOf(x.mins)+" min de concentration"}</p>
  </div>`;
  m.hidden=false;setTimeout(()=>document.getElementById("rGoal")?.focus(),60);
}
function startBreath(){
  const box=document.getElementById("rtBreath");if(!box)return;const t0=Date.now();
  box.classList.add("breathing");box.innerHTML=`<div class="breath" aria-hidden="true"></div><div class="breath-t"><b id="brL">Inspire</b><small id="brC">60 s</small></div><button class="btn ghost" data-rbskip>Passer</button>`;
  clearInterval(brTick);brTick=setInterval(()=>{const e=(Date.now()-t0)/1000;if(e>=60){stopBreath(true);return}const L=document.getElementById("brL"),C=document.getElementById("brC");if(!L){clearInterval(brTick);return}L.textContent=e%10<4?"Inspire":"Expire";C.textContent=Math.ceil(60-e)+" s"},250);
}
function stopBreath(show){clearInterval(brTick);brTick=null;const box=document.getElementById("rtBreath");if(show&&box){box.classList.remove("breathing");box.innerHTML=`<span class="rt-n">3</span><span><b>Respiration faite</b><small>Tu peux lancer la séance.</small></span><span class="rt-ok on" aria-hidden="true">✓</span>`}}
function renderTimer(){
  const el=document.getElementById("timer");
  const T=S.timer, x=T&&T.sid&&S.plan&&S.plan.sessions.find(s=>s.id===T.sid);
  if(!T||(T.phase!=="pause"&&(!x||!subj(x.subjId)))){renderTimer._m=null;syncMusic();el.hidden=true;el.className="";clearInterval(tick);tick=null;keepAwake(false);document.title="Mon plan de révision";return}
  el.hidden=false;
  if(!renderTimer._m||renderTimer._m!==T.phase+T.endAt+(T.pausedLeft!=null)+!!T.rang){renderTimer._m=T.phase+T.endAt+(T.pausedLeft!=null)+!!T.rang;if(T.phase==="work"&&S.music)S.music.skip=false;syncMusic()}
  const paused=T.pausedLeft!=null;
  const left=paused?T.pausedLeft:Math.max(0,T.endAt-Date.now()), total=T.total||(T.phase==="pause"?PAUSE*60000:(x?workOf(x.mins)*60000:left))||1;
  const over=T.segEnd?Math.max(0,Date.now()-T.endAt):0, shown=T.segEnd?over:left;
  const mm=Math.floor(shown/60000), ss=Math.floor(shown%60000/1000), clock=`${T.segEnd?"+":""}${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
  document.title=`${paused?"⏸ ":""}${clock} · ${T.phase==="pause"||T.phase==="mini"?"Pause":subj(x.subjId).name}`;
  const c=x&&x.chapId&&chaps().find(c=>c.id===x.chapId);
  if(timerMin){
    el.className="timerbar";
    el.innerHTML=`<button class="tb-open" data-focus aria-label="Agrandir le minuteur"><span class="mono">${paused?"⏸ ":""}${clock}</span><span>${T.phase==="pause"||T.phase==="mini"?"Pause":esc(subj(x.subjId).name)}</span></button>`;
  }else{
    const R=104, C=2*Math.PI*R, frac=Math.min(1,Math.max(0,left/total)), g=game(), mini=T.phase==="mini", pause=T.phase==="pause"||mini, nseg=T.segs?T.segs.length:1;
    const nextUp=pause&&!mini?(()=>{const td=(new Date().getDay()+6)%7;const o=layoutDay(td).find(o=>o.x.status==="todo");return o?subj(o.x.subjId).name:""})():"";
    el.className="focus "+(pause?"pause":"work");
    el.innerHTML=`${RIPPLE("ripple big")}<div class="focus-in">
      <div class="focus-top"><button class="focus-min" data-tstop aria-label="Quitter le minuteur" title="Quitter"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>
        <span class="kicker">${paused?"EN PAUSE":T.big?"GRANDE PAUSE · SORS DE TA BULLE : MARCHE, MANGE, PAS D'ÉCRAN":mini?"PETITE PAUSE · LÈVE-TOI, RESPIRE":pause?"PAUSE · LÈVE-TOI, BOIS DE L'EAU":nseg>1?`POMODORO ${(T.seg||0)+1}/${nseg} · CONCENTRATION`:"CONCENTRATION · LE CRÉNEAU EST UN MUR"}</span>
        <button class="focus-min" data-minimize aria-label="Réduire le minuteur" title="Réduire"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
      <div class="ring"><svg viewBox="0 0 240 240" aria-hidden="true"><circle class="ring-bg" cx="120" cy="120" r="${R}"/><circle class="ring-fg" cx="120" cy="120" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C*(1-frac)}"/></svg>
        <div class="ring-t"><span class="clock ${paused?"blink":""}">${clock}</span><small>${T.segEnd?(mini?"Pause terminée · temps en plus":"Pomodoro terminé · temps en plus"):paused?"en pause":pause?"avant la reprise":`+${workOf(x.mins)} XP à la fin`}</small></div></div>
      ${mini?`<h2>Petite pause</h2><p class="focus-c">Ensuite : Pomodoro ${(T.seg||0)+2}/${nseg} · ${esc(subj(x.subjId).name)}</p>`:pause?`<h2>${T.big?"Grande pause · 20 min":"Pause"}</h2>${nextUp?`<p class="focus-c">Ensuite : ${esc(nextUp)}</p>`:""}`:`<h2>${sdot(x.subjId)}${esc(subj(x.subjId).name)}</h2>${c?`<p class="focus-c">${esc(c.name)}</p>`:""}${x.goal?`<p class="focus-goal">Objectif : ${esc(x.goal)}</p>`:""}`}
      <div class="pills">${paused||T.segEnd?"":`<span class="pill">${pause?"Reprise à "+fmtT(Math.round((T.endAt-new Date().setHours(0,0,0,0))/60000)):"Pause à "+fmtT(Math.round((T.endAt-new Date().setHours(0,0,0,0))/60000))}</span>`}<span class="pill cream">${FLAME} Série ${g.streak} j</span></div>
      ${mini?`<button class="btn primary big" data-skipmini>${T.segEnd?`REPRENDRE · POMODORO ${(T.seg||0)+2}/${nseg}`:"Reprendre maintenant"}</button>`:pause?`<button class="btn primary big" data-skippause>Reprendre maintenant</button>`:T.segEnd?`<button class="btn primary big" data-startmini>LANCER LA PAUSE · 5 MIN</button><p class="muted small" style="text-align:center">Finis ta phrase, ton exercice… puis lance la pause.</p>`:`<div class="focus-acts"><button class="btn big" data-${paused?"tresume":"tpause"}>${paused?"▶ REPRENDRE":"❚❚ PAUSE"}</button><button class="btn primary big" data-endnow>J'AI FINI</button></div><button class="btn ghost restart" data-trestart>↺ Remettre à zéro</button>`}
    </div>`;
  }
  // une fois le temps écoulé (T.rang), plus de tic-tac : la fenêtre de fin s'ouvre une seule fois
  if(!tick&&!T.rang)tick=setInterval(()=>{if(S.timer&&S.timer.pausedLeft==null&&!S.timer.rang&&!S.timer.segEnd&&Date.now()>=S.timer.endAt){clearInterval(tick);tick=null;beep();try{navigator.vibrate&&navigator.vibrate([200,100,200])}catch(e){}if(S.timer.phase==="pause"){S.timer=null;commit();toast("Pause terminée : créneau suivant !")}else if(S.timer.phase==="mini"){S.timer.segEnd=true;save();renderTimer()}else if(S.timer.segs&&S.timer.seg<S.timer.segs.length-1){S.timer.segEnd=true;save();renderTimer()}else{S.timer.rang=true;timerMin=true;save();renderTimer();openEnd(S.timer.sid,true)}}else renderTimer()},1000);
}
function openEnd(sid,rang){
  const x=S.plan.sessions.find(s=>s.id===sid); if(!x)return;
  const m=document.getElementById("modal");
  const c=x.chapId&&chaps().find(c=>c.id===x.chapId), cur=c?(c.status==="pas"?"decouverte":c.status):"";
  const fromTimer=S.timer&&S.timer.sid===sid, g=game();
  m.innerHTML=`<div class="sheet game" role="dialog" aria-modal="true" aria-labelledby="endT">
    <div class="grab" aria-hidden="true"></div><button class="sheet-x" data-closemodal aria-label="Fermer"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>
    <p class="kicker">${rang?"TEMPS ÉCOULÉ":"QUÊTE TERMINÉE ?"}</p>
    <h2 id="endT" class="mega small">BIEN JOUÉ</h2>
    <div class="pills"><span class="pill rose">+${workOf(x.mins)} XP</span><span class="pill cream">${FLAME} Série ${g.today?g.streak:g.streak+1} j</span></div>
    ${c?`<label class="endchap"><span>${sdot(x.subjId)}${esc(subj(x.subjId).name)} · chapitre travaillé</span>
      <select id="endChap" data-sid="${sid}" data-rang="${rang?1:""}">${chaps().filter(k=>k.subjId===x.subjId).map(k=>`<option value="${k.id}" ${k.id===c.id?"selected":""}>${esc(k.name)}</option>`).join("")}</select>
      <small>Tu as travaillé sur un autre chapitre ? Choisis-le ici.</small></label>`:`<p class="muted">${esc(subj(x.subjId).name)}</p>`}
    ${c?`<div class="defi"><b>Défi feuille blanche</b><p>Cours fermé, écris tout ce que tu sais, puis compare. Tu retrouves…</p>${stageBox(cur)}${links(c)}</div>
    <details class="defi"><summary><b>Cartes sur ce que tu as raté</b> <span class="muted small">(${cards().filter(k=>k.chapId===c.id).length} dans ce chapitre)</span></summary>
      <p>Colle ici les cartes données par ton tuteur (une par ligne, « Question :: Réponse »), ou écris-les toi-même.</p>
      <textarea id="endCards" rows="4" placeholder="Qui a proposé le modèle écologique ? :: Bronfenbrenner"></textarea></details>`:""}
    ${c&&P.segsOf(workOf(x.mins)).length>1?(()=>{const cs=chaps().filter(k=>k.subjId===x.subjId&&k.id!==c.id),all=chaps().filter(k=>k.subjId===x.subjId),i=all.findIndex(k=>k.id===c.id),guess=(all[i+1]&&all[i+1].id!==c.id?all[i+1]:cs[0]);return cs.length?`<details class="defi" id="end2"><summary><b>Le 2e Pomodoro portait sur un autre chapitre</b></summary>
      <label class="endchap"><span>Chapitre du 2e Pomodoro</span><select id="endChap2">${cs.map(k=>`<option value="${k.id}" ${guess&&k.id===guess.id?"selected":""}>${esc(k.name)}</option>`).join("")}</select></label>
      <p>Et sur ce chapitre-là, tu retrouves…</p>${stageBox("decouverte")}</details>`:""})():""}
    <label class="check"><input type="checkbox" id="notDone"> <span>Je n'ai pas fini</span></label>
    <textarea id="endNote" placeholder="Ce qui reste à faire (ex. fin du chapitre, exercices 4 à 6)" hidden>${esc(x.note||"")}</textarea>
    <div class="sheet-acts"><button class="btn primary big" data-finish="${sid}">${fromTimer&&P.endPauseOf(x.mins)>0?`VALIDER · PAUSE ${P.endPauseOf(x.mins)} MIN`:"VALIDER"}</button>${fromTimer?"":`<button class="btn ghost" data-closemodal>Annuler</button>`}</div>
  </div>`;
  m.hidden=false;
}
document.addEventListener("change",e=>{if(e.target.id!=="endChap")return;const x=S.plan.sessions.find(s=>s.id===e.target.dataset.sid);if(!x)return;x.chapId=e.target.value;save();openEnd(x.id,!!e.target.dataset.rang)});
function openChap(id){
  const c=chaps().find(c=>c.id===id); if(!c)return;
  const m=document.getElementById("modal");
  m.innerHTML=`<div class="sheet game" role="dialog" aria-modal="true" aria-labelledby="chT">
    <div class="grab" aria-hidden="true"></div><button class="sheet-x" data-closemodal aria-label="Fermer"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>
    <p class="kicker">${esc(subj(c.subjId).name.toUpperCase())}</p>
    <h2 id="chT">${esc(c.name)}</h2>
    ${links(c)}
    <button class="btn" data-deck="${c.id}">Cartes du chapitre (${cards().filter(k=>k.chapId===c.id).length})</button>
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
  m.innerHTML=`<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="skT"><div class="grab" aria-hidden="true"></div><button class="sheet-x" data-closemodal aria-label="Fermer"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>
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
function closeModal(){clearInterval(brTick);brTick=null;const m=document.getElementById("modal");m.classList.add("closing");setTimeout(()=>{m.hidden=true;m.classList.remove("closing")},180)}
/* ---------- events ---------- */
document.addEventListener("click",e=>{
  if(e.target.id==="modal"){closeModal();return}
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
    const on=document.querySelector("#modal .defi:not(#end2) [data-cst].on"),c=x.chapId&&chaps().find(c=>c.id===x.chapId);
    if(c&&on){P.grade(c,on.dataset.cst,todayISO(),S);x.chapDone=c.id}
    {const e2=document.getElementById("end2");if(e2&&e2.open){const c2=chaps().find(k=>k.id===document.getElementById("endChap2").value),on2=e2.querySelector("[data-cst].on");if(c2&&on2&&(!c||c2.id!==c.id)){P.grade(c2,on2.dataset.cst,todayISO(),S);x.chap2=c2.id}}}
    const newC=c&&document.getElementById("endCards")?addCards(c.id,CK.parseCards(document.getElementById("endCards").value)):0;
    x.note=nd?document.getElementById("endNote").value.trim():"";
    logDrop(x.id);const wasT0=S.timer&&S.timer.sid===x.id&&(S.timer.phase==="work"||S.timer.phase==="mini");logAdd(x,wasT0&&S.timer.total?Math.min(workOf(x.mins),Math.round(((S.timer.done||0)+(S.timer.phase==="work"?S.timer.total-(S.timer.pausedLeft??Math.max(0,S.timer.endAt-Date.now())):0))/60000)) || workOf(x.mins):workOf(x.mins));
    const wasTimer=S.timer&&S.timer.sid===x.id;
    if(wasTimer){const pm=endPause(x);S.timer=pm>0?{phase:"pause",endAt:Date.now()+pm*60000,total:pm*60000,big:pm>=P.BIG_PAUSE}:null;timerMin=false}
    closeModal();commit();toast((c&&on?`+${workOf(x.mins)} XP · revu le ${frDate(c.next)}`:`+${workOf(x.mins)} XP`)+(newC?` · +${newC} carte${newC>1?"s":""}`:""),before);return}
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
  if(d.start){const xa=S.plan.sessions.find(s=>s.id===d.start);if(xa&&xa.kind==="anki"){openReview({sid:xa.id});return}}
  if(d.start){SP.activate();const x=S.plan.sessions.find(s=>s.id===d.start);try{actx=actx||new (window.AudioContext||window.webkitAudioContext)()}catch(err){}
    if(x.mins>=30&&x.kind!=="rappel"){openRitual(x.id);return}startTimer(x);return}
  if(d.gamehelp!=null){openGameHelp();return}
  if(d.rphone!=null){b.classList.toggle("on");b.setAttribute("aria-pressed",b.classList.contains("on"));return}
  if(d.rbreath!=null){startBreath();return}
  if(d.rbskip!=null){stopBreath(true);return}
  if(d.rgo){SP.activate();const x=S.plan.sessions.find(s=>s.id===d.rgo);if(!x)return;stopBreath();x.goal=(document.getElementById("rGoal")||{}).value?.trim()||"";closeModal();startTimer(x);return}
  if(d.startmini!=null){const T=S.timer;if(!T||!T.segEnd)return;T.done=(T.done||0)+T.total+Math.max(0,Date.now()-T.endAt);delete T.segEnd;T.phase="mini";T.total=P.MINI*60000;T.endAt=Date.now()+T.total;commit();return}
  if(d.skipmini!=null){if(S.timer&&S.timer.phase==="mini")nextSeg();return}
  if(d.skippause!=null){S.timer=null;commit();return}
  if(d.endnow!=null){const sid=S.timer.sid;timerMin=true;renderTimer();openEnd(sid);return}
  if(d.done){openEnd(d.done);return}
  if(d.closemodal!=null){closeModal();return}
  if(d.cst){(b.closest(".defi")||b.closest(".stagebox")).querySelectorAll("[data-cst]").forEach(z=>{z.classList.toggle("on",z===b);z.setAttribute("aria-checked",z===b)});return}
  if(d.opench){openChap(d.opench);return}
  if(d.joker!=null){openJoker();return}
  if(d.crev){closeModal();openReview(d.crev==="all"?{}:{chapId:d.crev});return}
  if(d.rvnext!=null){if(RV){RV.subj=null;RV.card=null;renderReview()}return}
  if(d.rvshow!=null){if(!RV.shown){RV.shown=true;RV.shownAt=Date.now();renderReview()}return}
  if(d.rvans){rvAnswer(+d.rvans);return}
  if(d.rvundo!=null){const u=RV&&RV.undo.pop();if(!u)return;const i=cards().findIndex(k=>k.id===u.id);if(i>=0)cards()[i]=JSON.parse(u.card);S.cardStats=JSON.parse(u.st);RV.done=Math.max(0,RV.done-1);RV.shown=true;RV.card=u.id;save();renderReview();return}
  if(d.rvclose!=null){closeReview(!!d.fin);return}
  if(d.deck){openDeck(d.deck);return}
  if(d.cadd){const q=document.getElementById("cQ").value,a=document.getElementById("cA").value;if(!q.trim()||!a.trim()){toast("Écris la question et la réponse");return}addCards(d.cadd,[{q,a}]);commit();openDeck(d.cadd);document.getElementById("cQ")?.focus();toast("Carte ajoutée");return}
  if(d.cbulk){const n=addCards(d.cbulk,CK.parseCards(document.getElementById("cBulk").value));commit();openDeck(d.cbulk);toast(n?`+${n} carte${n>1?"s":""}`:"Aucune ligne au format « Question :: Réponse »");return}
  if(d.cedit){openCardEdit(d.cedit);return}
  if(d.csave){const k=cards().find(k=>k.id===d.csave);if(k){k.q=document.getElementById("eQ").value.trim()||k.q;k.a=document.getElementById("eA").value.trim()||k.a}commit();if(RV){closeModal();renderReview()}else openDeck(k.chapId);return}
  if(d.csusp){const k=cards().find(k=>k.id===d.csusp);if(k)k.suspended=!k.suspended;commit();if(RV){closeModal();renderReview()}else openDeck(k.chapId);return}
  if(d.cdel){const before=snap(),k=cards().find(k=>k.id===d.cdel);S.cards=cards().filter(x=>x.id!==d.cdel);commit();if(RV){closeModal();renderReview()}else if(k)openDeck(k.chapId);toast("Carte supprimée",before);return}
  if(d.tpause!=null){if(!S.timer)return;S.timer.pausedLeft=Math.max(0,S.timer.endAt-Date.now());commit();return}
  if(d.tresume!=null){SP.activate();if(!S.timer||S.timer.pausedLeft==null)return;S.timer.endAt=Date.now()+S.timer.pausedLeft;delete S.timer.pausedLeft;commit();return}
  if(d.trestart!=null){if(!S.timer)return;const tot=S.timer.total||PAUSE*60000;S.timer.endAt=Date.now()+tot;delete S.timer.pausedLeft;delete S.timer.rang;commit();toast("Minuteur remis à zéro");return}
  if(d.tstop!=null){const before=snap();S.timer=null;timerMin=false;closeModal();commit();toast("Minuteur arrêté · la quête reste à faire",before);return}
  if(d.munext!=null){SP.next();return}
  if(d.mutoggle!=null){S.music.paused=!S.music.paused;syncMusic();save();return}
  if(d.spguide!=null){openSpotify();return}
  if(d.ankion!=null){S.anki=S.anki===false;commit();return}
  if(d.splogin!=null){const id=document.getElementById("spCid").value.trim();if(!id){toast("Colle d'abord ton Client ID");return}SP.setClientId(id);S.music=S.music||{on:true,vol:35};S.music.cid=id;save();setTimeout(()=>SP.login().catch(e=>toast(e.message)),300);return}
  if(d.spout!=null){SP.disconnect();closeModal();render();toast("Spotify déconnecté sur cet ordinateur");return}
  if(d.spcopy!=null){navigator.clipboard.writeText(SP.redirectUri()).then(()=>toast("Adresse copiée"),()=>{});return}
  if(d.muoff!=null){S.music.skip=true;syncMusic();toast("Musique coupée pour cette séance");return}
  if(d.musicon!=null){S.music=S.music||{on:true,vol:35};S.music.on=S.music.on===false;commit();openSpotify();return}
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
    if(c){x.chapId=c.id;if(on){const k=on.dataset.cst,dt=addDays(S.plan.weekStart||mondayISO(),x.day),base=dt<todayISO()?dt:todayISO();P.grade(c,k,base,S)}}
    logDrop(x.id);logAdd(x,workOf(x.mins));
    if(S.timer&&S.timer.sid===x.id)S.timer=null;closeModal();commit();toast("Enregistré",before);return}
  if(d.undo){const before=snap();const x=S.plan.sessions.find(s=>s.id===d.undo);if(x.status==="off"){const t=todayISO();S.off=(S.off||[]).filter(z=>z!==t);S.plan.sessions.forEach(y=>{if(y.day===x.day&&y.status==="off")y.status="todo"})}x.status="todo";logDrop(x.id);commit();toast("Quête remise à faire",before);return}
  if(d.fin){const x=S.plan.sessions.find(s=>s.id===d.sid);x.status=d.fin;
    const on=document.querySelector("#modal [data-cst].on"),c=x.chapId&&chaps().find(c=>c.id===x.chapId);
    if(c&&on){P.grade(c,on.dataset.cst,todayISO(),S);x.chapDone=c.id}x.note=document.getElementById("endNote").value.trim();S.timer=S.timer&&S.timer.sid===x.id?(()=>{const pm=endPause(x);return pm>0?{phase:"pause",endAt:Date.now()+pm*60000,total:pm*60000,big:pm>=P.BIG_PAUSE}:null})():S.timer;document.getElementById("modal").hidden=true;commit();return}
  if(d.extra){const x=S.plan.sessions.find(s=>s.id===d.extra);const day=+document.getElementById("rd-"+x.id).value,m=+document.getElementById("rm-"+x.id).value;S.plan.sessions.push({id:uid(),subjId:x.subjId,mins:m,day,status:"todo",note:"",extra:true});x.status="done";x.note=(x.note?x.note+" · ":"")+"rattrapage prévu "+DAYS[day];commit();return}
  if(d.newweek!=null){S.timer=null;generatePlan(true);S.tab="today";commit();return}
});
document.addEventListener("input",e=>{
  const t=e.target,d=t.dataset;
  if(d.name){subj(d.name).name=t.value;commit(false);return}
  if(d.coef){subj(d.coef).coef=t.value===""?"":Number(t.value);commit(false);return}
  if(d.notion){subj(d.notion).notion=t.value.trim();commit(false);return}
  if(d.spplaylist!=null){S.music=S.music||{on:true,vol:35};S.music.playlist=t.value.trim();SP.restart();commit(false);return}
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
document.addEventListener("keydown",e=>{
  if(RV&&!document.getElementById("review").hidden&&document.getElementById("modal").hidden&&!/INPUT|TEXTAREA/.test((e.target.tagName||""))){
    if((e.key===" "||e.key==="Enter")&&document.querySelector("#review [data-rvnext]")){e.preventDefault();RV.subj=null;RV.card=null;renderReview();return}
    if(e.key===" "||e.key==="Enter"){e.preventDefault();if(!RV.shown){RV.shown=true;RV.shownAt=Date.now();renderReview()}else rvAnswer(3);return}
    if(RV.shown&&/^[1-4]$/.test(e.key)){e.preventDefault();rvAnswer(+e.key);return}
    if(e.key==="z"||e.key==="Z"){document.querySelector("[data-rvundo]")?.click();return}
    if(e.key==="Escape"){closeReview(false);return}
  }if(e.key==="Enter"&&e.target.id&&e.target.id.startsWith("nc-")){e.preventDefault();document.querySelector(`[data-addch="${e.target.id.slice(3)}"]`)?.click();return}if(e.key==="Escape"){if(!document.getElementById("modal").hidden)closeModal();else if(S.timer&&!timerMin){timerMin=true;renderTimer()}}});


/* ---------- calendrier (abonnement .ics) ---------- */
function openSpotify(){
  const m=document.getElementById("modal"), on=SP.connected(), cid=SP.clientId()||(S.music&&S.music.cid)||"", ru=SP.redirectUri();
  m.innerHTML=`<div class="sheet game" role="dialog" aria-modal="true" aria-labelledby="spT"><div class="grab" aria-hidden="true"></div><button class="sheet-x" data-closemodal aria-label="Fermer"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>
    <p class="kicker">MUSIQUE · ORDINATEUR</p><h2 id="spT" class="mega small">SPOTIFY</h2>
    ${on?`<p>Connecté. Ta playlist démarre quand tu lances une quête et se coupe pendant les pauses.</p>
      <button class="setrow" data-musicon><span><b>Musique pendant le travail</b><small>${(S.music&&S.music.on===false)?"désactivée":"activée"}</small></span><span class="sw ${(S.music&&S.music.on===false)?"":"on"}" aria-hidden="true"><i></i></span></button>
      <label class="setrow col" for="spPl"><span><b>Ta playlist</b><small>Colle le lien d'une playlist Spotify (Partager › Copier le lien). Vide = une playlist « jazz instrumental » trouvée pour toi.</small></span><input id="spPl" data-spplaylist value="${esc((S.music&&S.music.playlist)||"")}" placeholder="https://open.spotify.com/playlist/…"></label>
      <button class="btn ghost danger" data-spout>Déconnecter Spotify</button>`
    :`<ol class="steps-sp">
      <li>Ouvre <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener">developer.spotify.com/dashboard</a> et connecte-toi avec ton compte Spotify.</li>
      <li>Clique <b>Create app</b>. Nom : <i>Révisions</i>. Description : <i>Musique pendant mes révisions</i>.</li>
      <li>Dans <b>Redirect URIs</b>, colle cette adresse puis clique <b>Add</b> :<div class="copyrow"><code>${esc(ru)}</code><button class="btn" data-spcopy>Copier</button></div></li>
      <li>Coche <b>Web API</b> et <b>Web Playback SDK</b>, accepte les conditions, puis <b>Save</b>.</li>
      <li>Dans l'app créée : <b>Settings</b> › copie le <b>Client ID</b> et colle-le ici :<input id="spCid" value="${esc(cid)}" placeholder="Client ID (32 caractères)" autocomplete="off"></li>
      <li>Si Spotify refuse la connexion : onglet <b>User Management</b> › ajoute ton nom et l'e-mail de ton compte Spotify.</li>
    </ol>
    <div class="sheet-acts"><button class="btn primary big" data-splogin>SE CONNECTER À SPOTIFY</button></div>`}
  </div>`;
  m.hidden=false;
}
function openCal(){
  const m=document.getElementById("modal");
  const web=icsUrl.replace(/^https?:/,"webcal:");
  m.innerHTML=`<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="calT"><button class="sheet-x" data-closemodal aria-label="Fermer"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>
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

setInterval(()=>{if(document.visibilityState==="visible"&&document.getElementById("modal").hidden&&!(document.activeElement&&/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))&&(S.tab==="today"||S.tab==="semaine"))render()},60000);
/* nouvelles règles de révision (rappel J+1, escalier J+3/J+7/J+15/mois, Anki) : mise à niveau unique */
if((S.rulesV||0)<2){
  chaps().forEach(c=>{const h=(c.hist||[]).slice().sort();if(c.step==null)c.step=Math.max(0,Math.min(5,h.length-1));
    if(h.length===1&&c.status!=="pas"&&c.status!=="decouverte"){const r=addDays(h[0],1);c.rappel=true;if(!c.next||c.next>r)c.next=r}});
  if(S.plan)S.plan.lockedDay=null;
  S.rulesV=2;save();
}
/* rappels trop anciens (> 7 jours) : remplacés par une séance pour réapprendre ; on recalcule la journée une fois */
if((S.rulesV||0)<3){if(S.plan){S.plan.lockedDay=null;const t=S.timer&&S.plan.sessions.find(x=>x.id===S.timer.sid);if(t&&t.kind==="rappel"&&t.status==="todo")S.timer=null}S.rulesV=3;save()}
/* corrections ponctuelles demandées à Claude (une seule fois) */
{const done=S.patched||(S.patched={});let ch=false;for(const p of PATCHES){if(done[p.id])continue;try{p.run(S)}catch(e){}done[p.id]=1;ch=true}if(ch)save()}
/* cartes préparées par Claude : ajoutées une seule fois (une carte supprimée ne revient pas) */
{const seen=S.cardInbox||(S.cardInbox={});let n=0,ch=false;
  for(const id of REMOVE){if(seen["-"+id])continue;seen["-"+id]=1;ch=true;S.cards=cards().filter(k=>k.id!==id)}
  for(const x of INBOX){if(seen[x.id])continue;const c=chaps().find(k=>k.id===x.chapId);if(!c)continue;seen[x.id]=1;ch=true;
    if(cards().some(k=>k.id===x.id||k.q===x.q))continue;cards().push({...CK.newCard(x.chapId,c.subjId,x.q,x.a),id:x.id});n++}
  if(ch)save();if(n)setTimeout(()=>toast(`+${n} carte${n>1?"s":""} préparée${n>1?"s":""} pour toi`),600);
}
/* Spotify : on prépare le lecteur dès l'ouverture sur ordinateur (pour qu'il puisse jouer au clic sur JOUER) */
if(SP.connected()&&wide()&&!(S.music&&S.music.on===false))SP.init(((S.music&&S.music.vol)??35)/100).catch(e=>{spErr=e.message});
if(!SP.clientId()&&S.music&&S.music.cid)SP.setClientId(S.music.cid);
/* au démarrage : succès déjà mérités débloqués sans fête, puis affichage */
try{const had=JSON.stringify([S.ach,S.lvlSeen,S.log&&S.log.length]);checkGame();celebQ=[];if(JSON.stringify([S.ach,S.lvlSeen,S.log&&S.log.length])!==had)save()}catch(e){}
render();

}
