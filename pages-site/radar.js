/* Baqer Sniper app (gold design). Built from the approved design + real data/engine. */
(function(){
'use strict';
/* =========================================================
   Data & state
   ========================================================= */
const C = {gold:'#d4af6a', sell:'#e5484d', buy:'#3fb68b', liq:'#6ea8ff', ivory:'#f4efe6', muted:'#a39b8d', line:'#2a2620', grid:'#18170f', rsi:'#b48cff'};
const PALETTE = ['#d4af6a','#e5484d','#3fb68b','#6ea8ff','#f4efe6'];
const ASSETS = {
  XAU:{name:'الذهب', sym:'XAU/USD', cat:'fx', dec:2, src:'bq', id:'XAUUSD'},
  XAG:{name:'الفضة', sym:'XAG/USD', cat:'fx', dec:3, src:'bq', id:'XAGUSD'},
  EUR:{name:'يورو / دولار', sym:'EUR/USD', cat:'fx', dec:5, src:'bq', id:'EURUSD'},
  GBP:{name:'باوند / دولار', sym:'GBP/USD', cat:'fx', dec:5, src:'bq', id:'GBPUSD'},
  BTC:{name:'بيتكوين', sym:'BTC/USDT', cat:'crypto', dec:2, src:'bn', id:'BTCUSDT'},
  ETH:{name:'إيثريوم', sym:'ETH/USDT', cat:'crypto', dec:2, src:'bn', id:'ETHUSDT'},
  SOL:{name:'سولانا', sym:'SOL/USDT', cat:'crypto', dec:2, src:'bn', id:'SOLUSDT'},
  XRP:{name:'ريبل', sym:'XRP/USDT', cat:'crypto', dec:4, src:'bn', id:'XRPUSDT'}
};
const TFS = {'15m':15,'1H':60,'4H':240};
const ROUTES = [
  {id:'home', name:'الرئيسية', icon:'<path d="M3 11l9-7 9 7v9H3z"/>', bottom:true},
  {id:'markets', name:'الأسواق', icon:'<path d="M5 20V10M12 20V4M19 20v-7"/>', bottom:true},
  {id:'chart', name:'الشارت والتحليل', short:'الشارت', icon:'<path d="M4 18l5-6 4 3 7-8"/>', bottom:true},
  {id:'trades', name:'الصفقات', icon:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>', bottom:true},
  {id:'agenda', name:'الأجندة', icon:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'},
  {id:'alerts', name:'التنبيهات', icon:'<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>'},
  {id:'prefs', name:'الإعدادات', icon:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>'},
  {id:'more', name:'المزيد', icon:'<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>', bottomOnly:true}
];
const store = {
  get(k,d){ try{ const v=localStorage.getItem('mrpro-'+k); return v==null?d:JSON.parse(v); }catch(e){ return d; } },
  set(k,v){ try{ localStorage.setItem('mrpro-'+k, JSON.stringify(v)); }catch(e){} }
};
const S = {
  route:'home', asset:'XAU', tf:'15m', cache:{}, price:{}, prevPrice:{},
  prefs: Object.assign({balance:10000, risk:1, tf:'15m', minConf:65, clock:12, sound:true, push:true, schools:{ict:true,snr:true,pa:true,wyc:true,elw:true}}, store.get('prefs',{})),
  favs: store.get('favs',['XAU','BTC','EUR','ETH']),
  alerts: store.get('alerts',null),
  history: store.get('history',[]),
  analysis:{},
  ch:{tool:'cursor', color:PALETTE[0], magnet:true, show:{ema20:true,ema50:false,rsi:true,ict:true,lv:true}, bw:9, right:null, draft:null, dragging:false, pan:null, hover:null, pointers:new Map(), pinch:null, full:false, panelTab:'plan'},
  mkCat:'all', mkQuery:'', tradesTab:'orders', alertsTab:'active', agendaDay:0
};
S.tf = S.prefs.tf;
if(!S.alerts){ S.alerts=[
  {id:3, asset:'*', type:'signal', on:true, note:'إشارة مؤكدة بثقة فوق الحد الأدنى'}
]; }
S.alerts=S.alerts.filter(x=>x.type!=='news');

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (v,d) => v==null||isNaN(v) ? '—' : Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const fp = (a,v) => fmt(v, ASSETS[a].dec);
const pct = v => (v>=0?'+':'')+v.toFixed(2)+'%';

/* ---------- real market data (replaces the sample generator) ----------
   Gold, silver and FX: biquote.io (OHLC + live SignalR ticks). Crypto: Binance (klines + live miniTicker).
   Every decision is computed from CLOSED candles only (Analysis.closedBars), so nothing repaints. */
const ENG = window.Analysis, SCHOOLS = window.Schools;
const TF_IV = {'15m':'15m','1H':'1h','4H':'4h'};
const TF_MS = tf => TFS[tf]*60000;
const PROFILE = {'15m':'balanced','1H':'balanced','4H':'balanced'}; // same as the server monitor
const sleep = ms => new Promise(r=>setTimeout(r,ms));
S.lastTick = {}; S.fetchedAt = {}; S.live = {bq:false, bn:false}; S.loaded = false;

function toBarsBQ(j){
  return ((j&&j.bars)||[]).map(b=>({t:Date.parse(b.openTime), o:+b.open, h:+b.high, l:+b.low, c:+b.close, v:+(b.tickVolume||1)}))
    .filter(b=>isFinite(b.t)&&isFinite(b.o)&&isFinite(b.c)&&b.h>=b.l&&b.c>0).sort((x,y)=>x.t-y.t);
}
function dedupe(bars){ const out=[]; bars.forEach(b=>{ const L=out[out.length-1]; if(L&&L.t===b.t) out[out.length-1]=b; else out.push(b); }); return out; }
async function fetchBars(a, tf){
  const A=ASSETS[a], iv=TF_IV[tf]; let r, bars;
  if(A.src==='bq'){
    r=await fetch('https://biquote.io/api/'+A.id+'/ohlc?interval='+iv,{cache:'no-store'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    bars=toBarsBQ(await r.json());
  } else {
    r=await fetch('https://api.binance.com/api/v3/klines?symbol='+A.id+'&interval='+iv+'&limit=500',{cache:'no-store'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    bars=(await r.json()).map(k=>({t:+k[0], o:+k[1], h:+k[2], l:+k[3], c:+k[4], v:+k[5]})).filter(b=>isFinite(b.c)&&b.c>0);
  }
  bars=dedupe(bars).slice(-500);
  if(bars.length<62) throw new Error('not enough candles');
  return bars;
}
function setSeries(a, tf, bars){
  const s={a, tf, c:bars}; derive(s); S.cache[a+'|'+tf]=s; S.fetchedAt[a+'|'+tf]=Date.now();
  // Before the first live tick, the last candle close is the price.
  if(!S.lastTick[a] || Date.now()-S.lastTick[a]>60000){ const p=bars[bars.length-1].c; if(S.price[a]==null) S.prevPrice[a]=p; S.price[a]=p; }
}
function series(a, tf){ return S.cache[a+'|'+tf]; }

// Loads every asset on every timeframe. An asset whose data cannot be loaded is removed from the
// app for this visit (never shown with made-up numbers).
async function loadAll(onProgress){
  const jobs=[]; Object.keys(ASSETS).forEach(a=>Object.keys(TFS).forEach(tf=>jobs.push([a,tf])));
  const failed=new Set(); let done=0;
  async function run(job){
    const [a,tf]=job;
    for(let k=0;k<3;k++){
      try{ setSeries(a,tf,await fetchBars(a,tf)); break; }
      catch(e){ if(k===2) failed.add(a); else await sleep(700*(k+1)); }
    }
    done++; if(onProgress) onProgress(done, jobs.length);
  }
  const q=jobs.slice();
  await Promise.all([0,1,2,3].map(async()=>{ while(q.length) await run(q.shift()); }));
  failed.forEach(a=>{ delete ASSETS[a]; Object.keys(TFS).forEach(tf=>delete S.cache[a+'|'+tf]); });
  S.favs=S.favs.filter(f=>ASSETS[f]); if(!S.favs.length) S.favs=Object.keys(ASSETS).slice(0,4);
  if(!ASSETS[S.asset]) S.asset=Object.keys(ASSETS)[0];
  S.loaded=true;
  return Object.keys(ASSETS).length;
}
// After a candle closes, the provider's exact candle replaces the one built from ticks.
let refreshing=false;
async function refreshClosed(){
  if(refreshing||!S.loaded) return; refreshing=true;
  const now=Date.now(), touched=[];
  try{
    for(const tf of Object.keys(TFS)){
      const ms=TF_MS(tf), bar=Math.floor(now/ms);
      if(now-bar*ms<20000) continue; // give the provider 20 s to finalise the candle
      for(const a of Object.keys(ASSETS)){
        const k=a+'|'+tf, at=S.fetchedAt[k]||0;
        const stale = Math.floor(at/ms)!==bar || (S.live[ASSETS[a].src]===false && now-at>60000);
        if(!stale) continue;
        try{ setSeries(a,tf,await fetchBars(a,tf)); touched.push(k); }catch(e){ S.fetchedAt[k]=now-ms+60000; }
      }
    }
  } finally { refreshing=false; }
  if(touched.length){ autoScan(); if(['home','markets','scanner'].includes(S.route) && !document.querySelector('.sheetwrap') && !document.activeElement?.closest?.('input,textarea,select')) render(); }
}

// ---------- live ticks ----------
function applyTick(a, p, t){
  if(!ASSETS[a] || !isFinite(p) || p<=0) return;
  S.price[a]=p; S.lastTick[a]=Date.now();
  Object.keys(TFS).forEach(tf=>{
    const s=S.cache[a+'|'+tf]; if(!s) return;
    const c=s.c, ms=TF_MS(tf), t0=Math.floor(t/ms)*ms, L=c[c.length-1];
    if(t0===L.t){ L.c=p; if(p>L.h) L.h=p; if(p<L.l) L.l=p; }
    else if(t0>L.t){ c.push({t:t0, o:L.c, h:Math.max(L.c,p), l:Math.min(L.c,p), c:p, v:0}); if(c.length>500) c.shift(); derive(s); }
  });
}
function bqSymbols(){ return Object.keys(ASSETS).filter(a=>ASSETS[a].src==='bq'); }
function bnSymbols(){ return Object.keys(ASSETS).filter(a=>ASSETS[a].src==='bn'); }
function startBiquote(){
  if(!('WebSocket' in window) || !bqSymbols().length) return;
  let ws; try{ ws=new WebSocket('wss://biquote.io/hubs/tick'); }catch(e){ return; }
  ws.onopen=()=>{ ws.send(JSON.stringify({protocol:'json',version:1})+'\u001e'); ws.send(JSON.stringify({type:1,target:'Subscribe',arguments:[bqSymbols().map(a=>ASSETS[a].id)]})+'\u001e'); };
  ws.onmessage=ev=>{
    String(ev.data).split('\u001e').forEach(part=>{
      if(!part) return; let m; try{ m=JSON.parse(part); }catch(e){ return; }
      if(m.type!==1||m.target!=='ReceiveTick'||!m.arguments||!m.arguments[0]) return;
      const t=m.arguments[0], a=bqSymbols().find(k=>ASSETS[k].id===t.symbol); if(!a) return;
      S.live.bq=true; applyTick(a, +t.mid, Date.parse(t.timestamp)||Date.now());
    });
  };
  ws.onclose=()=>{ S.live.bq=false; setTimeout(startBiquote,4000); };
  ws.onerror=()=>{ try{ ws.close(); }catch(e){} };
}
function startBinance(){
  if(!('WebSocket' in window) || !bnSymbols().length) return;
  const streams=bnSymbols().map(a=>ASSETS[a].id.toLowerCase()+'@miniTicker').join('/');
  let ws; try{ ws=new WebSocket('wss://stream.binance.com:9443/stream?streams='+streams); }catch(e){ return; }
  ws.onmessage=ev=>{ let m; try{ m=JSON.parse(ev.data); }catch(e){ return; } const d=m&&m.data; if(!d||!d.s) return;
    const a=bnSymbols().find(k=>ASSETS[k].id===d.s); if(!a) return; S.live.bn=true; applyTick(a, +d.c, +d.E||Date.now()); };
  ws.onclose=()=>{ S.live.bn=false; setTimeout(startBinance,4000); };
  ws.onerror=()=>{ try{ ws.close(); }catch(e){} };
}
// Fallback when the Binance stream is blocked: poll the price every 5 s.
async function pollBinance(){
  const list=bnSymbols(); if(!list.length) return;
  const quiet=list.every(a=>Date.now()-(S.lastTick[a]||0)>15000); if(!quiet) return;
  try{ const r=await fetch('https://api.binance.com/api/v3/ticker/price?symbols='+encodeURIComponent(JSON.stringify(list.map(a=>ASSETS[a].id))),{cache:'no-store'});
    if(!r.ok) return; (await r.json()).forEach(x=>{ const a=list.find(k=>ASSETS[k].id===x.symbol); if(a) applyTick(a,+x.price,Date.now()); }); }catch(e){}
}
const liveNow = ()=> S.live.bq || S.live.bn;

function derive(s){ const c=s.c; s.ema20=ema(c,20); s.ema50=ema(c,50); s.rsi=rsi(c,14); s.atr=atr(c,14); s.fvgs=findFvg(c,s.atr); s.sw=findSwings(c); }
function ema(c,n){const k=2/(n+1),o=[];let e=c[0].c;c.forEach((d,i)=>{e=i?d.c*k+e*(1-k):d.c;o.push(e);});return o;}
function rsi(c,n){const o=new Array(c.length).fill(null);let g=0,l=0;for(let i=1;i<c.length;i++){const d=c[i].c-c[i-1].c;if(i<=n){g+=Math.max(d,0);l+=Math.max(-d,0);if(i===n){g/=n;l/=n;o[i]=100-100/(1+g/(l||1e-9));}}else{g=(g*(n-1)+Math.max(d,0))/n;l=(l*(n-1)+Math.max(-d,0))/n;o[i]=100-100/(1+g/(l||1e-9));}}return o;}
function atr(c,n){const o=[];let a=0;c.forEach((d,i)=>{const tr=i?Math.max(d.h-d.l,Math.abs(d.h-c[i-1].c),Math.abs(d.l-c[i-1].c)):d.h-d.l;a=i<n?(a*i+tr)/(i+1):(a*(n-1)+tr)/n;o.push(a);});return o;}
function findFvg(c,at){
  const res=[];
  for(let i=2;i<c.length;i++){
    let z=null;
    if(c[i-2].l>c[i].h) z={i:i-2, top:c[i-2].l, bot:c[i].h, dir:-1};
    else if(c[i-2].h<c[i].l) z={i:i-2, top:c[i].l, bot:c[i-2].h, dir:1};
    if(!z || (z.top-z.bot) < at[i]*.25) continue;
    let filled=false; for(let j=i+1;j<c.length;j++){ if(z.dir<0? c[j].h>=z.top : c[j].l<=z.bot){filled=true;break;} }
    if(!filled){ z.size=(z.top-z.bot)/at[i]; res.push(z); }
  }
  return res.slice(-6);
}
function findSwings(c){
  const hs=[],ls=[],k=4;
  for(let i=k;i<c.length-k;i++){ let H=true,Lw=true; for(let j=1;j<=k;j++){ if(c[i-j].h>=c[i].h||c[i+j].h>c[i].h) H=false; if(c[i-j].l<=c[i].l||c[i+j].l<c[i].l) Lw=false; } if(H) hs.push({i,p:c[i].h}); if(Lw) ls.push({i,p:c[i].l}); }
  return {hs, ls, hi:hs[hs.length-1]||null, lo:ls[ls.length-1]||null};
}
function last(a){ return S.price[a]; }
function change24(a){ const s=series(a,'1H').c; const n=s.length-1; return (last(a)-s[n-24].c)/s[n-24].c*100; }
function range24(a){ const s=series(a,'1H').c.slice(-24); return {lo:Math.min(...s.map(d=>d.l)), hi:Math.max(...s.map(d=>d.h))}; }
function trendOf(a){ const s=series(a,'1H'), n=s.c.length-1; const e20=s.ema20[n], e50=s.ema50[n]; if(Math.abs(e20-e50)/e50 < .0008) return 'flat'; return e20>e50?'up':'down'; }
const TREND = {up:['صاعد','up'], down:['هابط','dn'], flat:['محايد','mut']};

/* ---------- analysis: the real engine (analysis.js + schools.js) ----------
   Five schools on every timeframe, closed candles only. A trade plan exists only when the ICT/SMC
   engine confirms a setup; otherwise the result is "wait" and no entry/stop/targets are shown. */
const SC_ID = {ict:'ict', snr:'snr', pa:'pa', wyc:'wyckoff', elw:'elliott'};
const SC_SHORT = {ict:'ICT', snr:'S/R', pa:'PA', wyckoff:'WYC', elliott:'EW'};
const SCH_CACHE = {};
function closedC(a, tf){ const s=S.cache[a+'|'+tf]; return s ? ENG.closedBars(s.c, TF_MS(tf), Date.now()) : []; }
function schoolsOf(a, tf){
  const c=closedC(a,tf); if(c.length<60) return null;
  const L=c[c.length-1], k=c.length+':'+L.t+':'+L.c, hit=SCH_CACHE[a+'|'+tf];
  if(hit && hit.k===k) return hit.v;
  const v=SCHOOLS.all(c, PROFILE[tf]); SCH_CACHE[a+'|'+tf]={k, v}; return v;
}
function enabledIds(){ const P=S.prefs.schools||{}; const ids=Object.keys(SC_ID).filter(k=>P[k]!==false).map(k=>SC_ID[k]); return ids.length? ids : SCHOOLS.ORDER.slice(); }
function frameVotes(a, tf){
  const f=schoolsOf(a,tf); if(!f) return [];
  const ids=enabledIds();
  return f.rows.filter(r=>ids.includes(r.id)).map(r=>({id:r.id, k:r.title.ar, short:SC_SHORT[r.id], bear:r.bias==='bear', bull:r.bias==='bull', ready:r.ready, v:r.label.ar, strength:r.strength, lines:r.lines.ar}));
}
function frameBias(votes){
  const b=votes.filter(v=>v.bull).length, s=votes.filter(v=>v.bear).length, need=Math.ceil(votes.length/2);
  return b>=need && b>s ? 'bull' : s>=need && s>b ? 'bear' : 'neutral';
}
function votesFor(s){ return frameVotes(s.a, s.tf); }
function analyze(a, tf){
  const c=closedC(a,tf);
  const tfs=Object.keys(TFS), mtf=tfs.map(t=>({tf:t, votes:frameVotes(a,t)})), votes=frameVotes(a,tf);
  const r = c.length>=60 ? ENG.analyze(c, PROFILE[tf], null) : {ready:false};
  // A setup is reported on the candle it forms on; after that the trade stays open until its stop or
  // first target. An open trade is therefore still the current plan, even when the newest candle has
  // no fresh setup (this is what the phone notification announced).
  // The trade the phone notification announced (server monitor) comes first, then the app's own journal.
  const open = serverOpenFor(a, tf) || (S.journal||[]).filter(e=>e.status==='open' && e.inst===a && e.tf===tf).sort((x,y)=>y.t-x.t)[0];
  const fresh = r.ready ? r.signal : null;
  const sig = fresh || (open ? {dir:open.dir, entry:open.entry, sl:open.sl, tp1:open.tp1, tp2:open.tp2, tp3:open.tp3, grade:open.grade, key:'open', active:true, since:open.t} : null);
  const bias = sig ? (sig.dir==='SHORT'?'bear':'bull') : frameBias(votes);
  const sell = bias==='bear';
  const agree = bias==='neutral' ? 0 : votes.filter(v=>sell?v.bear:v.bull).length;
  const aligned = bias==='neutral' ? 0 : mtf.filter(m=>frameBias(m.votes)===bias).length;
  const gradeB = sig ? ({A:10,B:5,C:0}[sig.grade]||0) : 0;
  const conf = Math.round(Math.max(5, Math.min(97, 35 + (votes.length? agree/votes.length*35 : 0) + aligned/tfs.length*17 + gradeB)));
  const L=c[c.length-1]||{t:0,c:S.price[a]}, at=r.atr||0;
  const A={a, tf, sell, bias, wait:!sig, active:!!(sig&&sig.active), since:sig&&sig.since, conf, votes, agree, mtf, aligned, nTf:tfs.length, barT:L.t, at:Date.now(), grade:sig?sig.grade:null, price:L.c, key:sig?sig.key:null};
  if(sig){
    A.mid=sig.entry; A.lo=sig.entry-0.15*at; A.hi=sig.entry+0.15*at; A.sl=sig.sl; A.risk=Math.abs(sig.entry-sig.sl);
    A.tps=[sig.tp1,sig.tp2,sig.tp3].filter(v=>isFinite(v));
  } else {
    const f=schoolsOf(a,tf), sn=f && f.rows.find(x=>x.id==='snr');
    A.sup = sn && sn.support ? sn.support.p : null; A.res = sn && sn.resistance ? sn.resistance.p : null;
    A.mid=L.c; A.lo=L.c; A.hi=L.c; A.sl=null; A.tps=[]; A.risk=0;
  }
  S.analysis[a+'|'+tf]=A; return A;
}
// The plan drawn on the chart and used by buttons: only a confirmed setup has one.
function planOf(a, tf){ const A=S.analysis[a+'|'+tf]; return A && !A.wait && A.tps.length===3 ? A : null; }
const decTitle = A => A.wait ? (A.bias==='neutral' ? 'انتظار · لا اتجاه واضح' : 'انتظار · الميل '+(A.sell?'هابط':'صاعد')) : (A.sell?'صفقة بيع':'صفقة شراء')+(A.active?' قائمة':'');
const decCol = A => A.wait ? C.gold : (A.sell?C.sell:C.buy);
const sigWord = A => A.wait ? 'انتظار' : (A.sell?'بيع':'شراء');
function miniPlan(a, A){
  if(A.wait) return `<div class="minigrid"><div>السعر<b class="gold">${fp(a,A.price)}</b></div><div>دعم<b class="up">${A.sup!=null?fp(a,A.sup):'—'}</b></div><div>مقاومة<b class="dn">${A.res!=null?fp(a,A.res):'—'}</b></div><div>المدارس<b>${A.agree}/${A.votes.length}</b></div></div><p class="note" style="margin:8px 0 0">لا توجد صفقة مؤكدة الآن. التطبيق ينبّهك عند ظهور إشارة.</p>`;
  return `<div class="minigrid"><div>الدخول<b class="gold">${fp(a,A.mid)}</b></div><div>الوقف<b class="dn">${fp(a,A.sl)}</b></div><div>الهدف 1<b class="up">${fp(a,A.tps[0])}</b></div><div>الهدف 3<b class="up">${fp(a,A.tps[2])}</b></div></div>`;
}
function analystLine(A){
  const n=ASSETS[S.asset]?ASSETS[S.asset].name:'السوق';
  if(!A) return 'السوق خريطة. اقرأ الاتجاه أولاً، ثم انتظر السعر في منطقتك.';
  if(A.wait) return n+': لا توجد صفقة مؤكدة الآن. لا أدخل إلا إذا اتفقت المدارس والأطر.';
  return A.sell ? n+' ضعيف على أغلب المدارس. انتظر الارتداد لمنطقة الدخول ولا تطارد السعر.' : n+' يحاول الصعود. الدخول فقط من منطقة قوية مع وقف واضح.';
}

/* ---------- open trades from the server monitor (same trades as the phone notifications) ---------- */
const SRV_INST = {XAU:'XAU', EURUSD:'EUR', GBPUSD:'GBP', BTC:'BTC'}, SRV_TF = {'15m':'15m','1h':'1H','4h':'4H'};
S.serverOpen = [];
function serverOpenFor(a, tf){
  return S.serverOpen.filter(o=>o.a===a && o.tf===tf).sort((x,y)=>y.t-x.t)[0] || null;
}
async function loadServerOpen(){
  if(!window.PUSH_WORKER) return;
  try{
    const r=await fetch(PUSH_WORKER+'/open',{cache:'no-store'}); if(!r.ok) return;
    const j=await r.json(), list=(j.open||[]).map(o=>({a:SRV_INST[o.inst], tf:SRV_TF[o.tf], dir:o.dir, entry:+o.entry, sl:+o.sl, tp1:+o.tp1, tp2:+o.tp2, tp3:+o.tp3, t:+o.t, tpHits:o.tpHits||0, grade:null, server:true}))
      .filter(o=>ASSETS[o.a] && TFS[o.tf] && isFinite(o.entry) && isFinite(o.sl));
    const changed = JSON.stringify(list)!==JSON.stringify(S.serverOpen);
    S.serverOpen=list;
    if(changed){ list.forEach(o=>analyze(o.a,o.tf)); Object.keys(S.analysis).forEach(k=>{ const [a,tf]=k.split('|'); analyze(a,tf); });
      if(['home','chart','schools'].includes(S.route) && !document.querySelector('.sheetwrap') && !document.activeElement?.closest?.('input,textarea,select')) render(); }
  }catch(e){}
}

/* ---------- automatic signals + journal (each event announced once) ---------- */
S.journal = store.get('journal', []);
S.autoSeen = {};
function claimOnce(key){
  try{ const raw=localStorage.getItem('mrpro-claimed'), m=raw?JSON.parse(raw):{}, now=Date.now();
    if(m[key]) return false;
    Object.keys(m).forEach(k=>{ if(now-m[k]>7*864e5) delete m[k]; });
    m[key]=now; localStorage.setItem('mrpro-claimed', JSON.stringify(m)); return true;
  }catch(e){ return true; }
}
function notifyUser(title, body, kind, tag){
  island(title, body, kind);
  if(S.prefs.sound) beep();
  // Phone notifications come from one place only: the server monitor (Web Push via sw.js), so the
  // same signal never arrives twice. Here the app shows it inside the screen.
  S.history.unshift({kind:kind||'', title, body, at:Date.now()}); S.history=S.history.slice(0,40); saveAlerts();
  const d=$('bellDot'); if(d) d.hidden=false;
}
function beep(){ try{ const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return; const ac=beep.ac||(beep.ac=new AC()), o=ac.createOscillator(), g=ac.createGain(); o.frequency.value=880; g.gain.setValueAtTime(.0001,ac.currentTime); g.gain.exponentialRampToValueAtTime(.15,ac.currentTime+.02); g.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+.35); o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime+.4); }catch(e){} }
function signalAlertOn(){ return S.alerts.some(x=>x.type==='signal' && x.on); }
// When the app opens, the last few closed candles are replayed (silently) so a setup that formed while
// the app was closed is in the journal and still shown as the open trade until its stop or target.
const BACKFILL_BARS = 16;
function backfillJournal(done){
  const jobs=[]; Object.keys(ASSETS).forEach(a=>Object.keys(TFS).forEach(tf=>jobs.push([a,tf])));
  const step=()=>{
    const job=jobs.shift(); if(!job){ S.journal=S.journal.slice(-400); store.set('journal',S.journal); rebuildJournal(); if(done) done(); return; }
    const [a,tf]=job, c=closedC(a,tf), ms=TF_MS(tf);
    for(let i=Math.max(60,c.length-1-BACKFILL_BARS); i<c.length-1; i++){
      const r=ENG.analyze(c.slice(0,i+1), PROFILE[tf], null); if(!(r.ready&&r.signal)) continue;
      const g=r.signal, t=c[i].t; if(ENG.isRepeat(S.journal,a,tf,g.dir,t,ms)) continue;
      const e={id:ENG.setupId(a,tf,g.dir,t), inst:a, tf, dir:g.dir, entry:g.entry, sl:g.sl, tp1:g.tp1, tp2:g.tp2, tp3:g.tp3, t, status:'open', grade:g.grade, backfill:true};
      const ex=ENG.resolveExit(e,c); if(ex){ e.status=ex.status; e.closeT=ex.closeT; }
      S.journal.push(e);
    }
    setTimeout(step,0);
  };
  step();
}
function autoScan(){
  if(!S.loaded) return;
  let changed=false; const now=Date.now();
  Object.keys(ASSETS).forEach(a=>Object.keys(TFS).forEach(tf=>{
    const c=closedC(a,tf); if(c.length<60) return;
    const ms=TF_MS(tf), L=c[c.length-1], k=a+'|'+tf;
    // close open trades on stop or first target
    S.journal.forEach(e=>{
      if(e.status!=='open' || e.inst!==a || e.tf!==tf) return;
      const ex=ENG.resolveExit(e, c); if(!ex) return;
      e.status=ex.status; e.closeT=ex.closeT; changed=true;
      if(now-ex.closeT<=3*ms && claimOnce('x|'+e.id)){
        const won=ex.status==='win', R=won? Math.abs(e.tp1-e.entry)/(Math.abs(e.entry-e.sl)||1) : 1;
        notifyUser(won?'صفقة رابحة':'صفقة خاسرة', ASSETS[a].name+' · '+tf+' · '+(won?'+':'−')+R.toFixed(1)+'R', won?'buy':'sell', 'x|'+e.id);
      }
    });
    if(S.autoSeen[k]===L.t) return; S.autoSeen[k]=L.t;
    const A=analyze(a,tf);
    if(A.wait || A.active) return;
    const dir=A.sell?'SHORT':'LONG';
    if(ENG.isRepeat(S.journal, a, tf, dir, L.t, ms)) return;
    const e={id:ENG.setupId(a,tf,dir,L.t), inst:a, tf, dir, entry:A.mid, sl:A.sl, tp1:A.tps[0], tp2:A.tps[1], tp3:A.tps[2], t:L.t, status:'open', conf:A.conf, grade:A.grade};
    S.journal.push(e); changed=true;
    // Only a setup on the candle that just closed is announced; older ones are recorded silently.
    if(now-(L.t+ms)<=2*ms && signalAlertOn() && A.conf>=S.prefs.minConf && claimOnce('o|'+e.id))
      notifyUser('إشارة جديدة · '+ASSETS[a].name, (A.sell?'بيع':'شراء')+' · '+tf+' · دخول '+fp(a,A.mid)+' · وقف '+fp(a,A.sl)+' · ثقة '+A.conf+'%', A.sell?'sell':'buy', 'o|'+e.id);
  }));
  if(changed){ S.journal=S.journal.slice(-400); store.set('journal', S.journal); rebuildJournal(); }
}
// Journal shown in "سجل الصفقات": closed automatic signals + closed practice trades.
function rebuildJournal(){
  if(typeof JOURNAL==='undefined') return;
  const now=Date.now(), days=t=>Math.max(0,Math.floor((now-t)/864e5));
  const auto=S.journal.filter(e=>e.status==='win'||e.status==='loss').map(e=>({a:e.inst, sell:e.dir==='SHORT', r:e.status==='win'? +(Math.abs(e.tp1-e.entry)/(Math.abs(e.entry-e.sl)||1)).toFixed(1) : -1, d:days(e.closeT||e.t), tf:e.tf, t:e.closeT||e.t}));
  const manual=(S.closed||[]).map(c=>Object.assign({t:c.t||now}, c));
  JOURNAL.length=0; auto.concat(manual).filter(j=>ASSETS[j.a]).sort((x,y)=>y.t-x.t).forEach(j=>JOURNAL.push(j));
}

function pendingOrders(a){
  const s=series(a,'15m'), price=last(a), at=s.atr[s.c.length-1], out=[];
  s.fvgs.forEach(z=>{
    const sellSide = z.bot>price, buySide = z.top<price; if(!sellSide && !buySide) return;
    const sell=sellSide, entry=(z.top+z.bot)/2, sl= sell? z.top+at*.5 : z.bot-at*.5, risk=Math.abs(sl-entry);
    const tps=[1.5,2.5,4].map(k=>entry+(sell?-1:1)*k*risk);
    const withTrend = (trendOf(a)==='down')===sell;
    const strength = Math.min(97, Math.round(58 + Math.min(z.size,1.6)*18 + (withTrend?6:0)));
    out.push({sell, lo:z.bot, hi:z.top, entry, sl, tps, rr:Math.abs(tps[2]-entry)/risk, dist:Math.abs(price-entry), withTrend, strength});
  });
  return out.sort((x,y)=>y.strength-x.strength).slice(0,4);
}

/* ---------- UI heartbeat: live prices arrive from the streams; this repaints them ---------- */
function tick(){
  if(!S.loaded) return;
  Object.values(S.cache).forEach(s=>{ const n=s.c.length-1; if(n<1) return; const k=2/21; s.ema20[n]=s.c[n].c*k+s.ema20[n-1]*(1-k); const k2=2/51; s.ema50[n]=s.c[n].c*k2+s.ema50[n-1]*(1-k2); });
  checkAlerts(); liveUpdate();
  Object.keys(ASSETS).forEach(a=>{ S.prevPrice[a]=S.price[a]; });
}
function checkAlerts(){
  S.alerts.forEach(al=>{
    if(!al.on || al.type!=='price' || !ASSETS[al.asset] || S.prevPrice[al.asset]==null) return;
    const p=S.price[al.asset], q=S.prevPrice[al.asset];
    const hit = al.cond==='above' ? (q<al.p && p>=al.p) : (q>al.p && p<=al.p);
    if(hit && claimOnce('pa|'+al.id+'|'+al.p)){ al.on=false; S.history.unshift({asset:al.asset, p:al.p, cond:al.cond, at:Date.now(), note:al.note}); S.history=S.history.slice(0,30); saveAlerts();
      toast('تنبيه سعر · '+ASSETS[al.asset].name, (al.cond==='above'?'تجاوز السعر ':'نزل السعر تحت ')+fp(al.asset,al.p)); $('bellDot').hidden=false; }
  });
}
function saveAlerts(){ store.set('alerts',S.alerts); store.set('history',S.history); }

/* ---------- toasts ---------- */
function toast(title, body){
  const t=document.createElement('div'); t.className='toast'; t.setAttribute('role','status');
  t.innerHTML='<b>'+esc(title)+'</b><span class="mut">'+esc(body)+'</span>';
  $('toasts').appendChild(t); setTimeout(()=>t.remove(), 5200);
}

/* ---------- sessions (real clock) ---------- */
const SESS = [{n:'سيدني',s:21,e:6},{n:'طوكيو',s:0,e:9},{n:'لندن',s:7,e:16},{n:'نيويورك',s:12,e:21}];
const KILL = [{n:'كيل زون لندن',s:7,e:10},{n:'كيل زون نيويورك',s:12,e:15}];
function inSess(h,x){ return x.s<x.e ? (h>=x.s && h<x.e) : (h>=x.s || h<x.e); }
function sessNow(){ const d=new Date(), h=d.getUTCHours()+d.getUTCMinutes()/60; return {h, open:SESS.filter(x=>inSess(h,x)), kill:KILL.find(x=>inSess(h,x))}; }
function updateSess(){ const s=sessNow(); $('sessTxt').textContent = s.kill ? s.kill.n+' الآن' : (s.open.length ? s.open.map(x=>x.n).join(' · ')+' مفتوحة' : 'السوق هادئ'); }

/* =========================================================
   Router & shell
   ========================================================= */
function navLinks(){
  $('sidenav').innerHTML = ROUTES.filter(r=>!r.bottomOnly).map(r=>'<a href="#'+r.id+'" data-r="'+r.id+'"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">'+r.icon+'</svg>'+r.name+(r.id==='alerts'?'<span class="badge" id="alertBadge"></span>':'')+'</a>').join('');
  $('bnav').innerHTML = ROUTES.filter(r=>r.bottom||r.bottomOnly).map(r=>'<a href="#'+r.id+'" data-r="'+r.id+'"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">'+r.icon+'</svg>'+(r.short||r.name)+'</a>').join('');
}
function route(){
  let id=(location.hash||'#home').slice(1); if(!ROUTES.find(r=>r.id===id)) id='home';
  S.route=id;
  document.querySelectorAll('[data-r]').forEach(a=>{ const on=a.dataset.r===id || (a.dataset.r==='more' && ['agenda','alerts','prefs'].includes(id)); on?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current'); });
  $('ptitle').textContent = ROUTES.find(r=>r.id===id).name;
  if(id==='alerts') $('bellDot').hidden=true;
  render(); window.scrollTo(0,0);
}
function render(){
  const v=$('view'); chartTeardown();
  v.innerHTML = '<div class="screen">'+(VIEWS[S.route]||VIEWS.home)()+'</div>';
  (AFTER[S.route]||(()=>{}))();
  const n=S.alerts.filter(a=>a.on).length; const b=$('alertBadge'); if(b){ b.textContent=n; b.hidden=!n; }
  S.reveal=false; countUp();
}
function liveUpdate(){
  document.querySelectorAll('[data-live]').forEach(el=>{
    const a=el.dataset.live, kind=el.dataset.kind||'price';
    if(kind==='price'){ const up=S.price[a]>=S.prevPrice[a]; el.textContent=fp(a,S.price[a]); el.style.color = S.price[a]===S.prevPrice[a]?'':(up?C.buy:C.sell); setTimeout(()=>{el.style.color='';},500); }
    if(kind==='raw'){ el.textContent=fp(a,S.price[a]); }
    if(kind==='chg'){ const v=change24(a); el.textContent=pct(v); el.className='num ltr '+(v>=0?'up':'dn'); }
  });
  if(S.route==='chart') chartDraw();
}

/* ---------- small renderers ---------- */
function sparkSVG(a, w, h, col){
  const s=series(a,'1H').c.slice(-48).map(d=>d.c), lo=Math.min(...s), hi=Math.max(...s);
  const pts=s.map((v,i)=>(i/(s.length-1)*w).toFixed(1)+','+(h-2-(v-lo)/(hi-lo||1)*(h-4)).toFixed(1)).join(' ');
  col = col || (s[s.length-1]>=s[0]?C.buy:C.sell);
  return '<svg class="spark" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" aria-hidden="true"><polyline points="'+pts+'" fill="none" stroke="'+col+'" stroke-width="1.5"/><polyline points="0,'+h+' '+pts+' '+w+','+h+'" fill="'+col+'" opacity=".08"/></svg>';
}
function gauge(v, col){ const d=(226*v/100).toFixed(0); return '<svg width="84" height="84" viewBox="0 0 86 86" role="img" aria-label="الثقة '+v+'%"><circle cx="43" cy="43" r="36" fill="none" stroke="#2a2620" stroke-width="4"/><circle class="garc" style="color:'+(col||C.gold)+'" cx="43" cy="43" r="36" fill="none" stroke="'+(col||C.gold)+'" stroke-width="4" stroke-linecap="round" stroke-dasharray="'+d+' 226" transform="rotate(-90 43 43)"/><text x="43" y="46" text-anchor="middle" font-family="DM Mono" font-size="19" fill="#f4efe6">'+v+'%</text><text x="43" y="61" text-anchor="middle" font-family="Tajawal" font-size="10" fill="#a39b8d">الثقة</text></svg>'; }
function ladder(a, A){
  const row=(col,name,val,ring)=>'<div class="lrow"><span class="ldot" style="'+(ring?'border:2px solid '+col:'background:'+col)+'"></span><span class="mut">'+name+'</span><b class="num ltr" style="font-weight:500;color:'+col+'">'+val+'</b></div>';
  return row(C.sell,'الوقف',fp(a,A.sl)) + row(C.gold,'منطقة الدخول',fp(a,A.lo)+' – '+fp(a,A.hi)) + A.tps.map((t,k)=>row(C.buy,'الهدف '+(k+1)+' · '+(Math.abs(t-A.mid)/(A.risk||1)).toFixed(1)+'R',fp(a,t),k<2)).join('');
}
function sizeFor(a, entry, sl){ const riskAmt=S.prefs.balance*S.prefs.risk/100, dist=Math.abs(entry-sl); return {riskAmt, units: dist? riskAmt/dist : 0}; }

/* =========================================================
   Views
   ========================================================= */
const VIEWS = {}, AFTER = {};

VIEWS.home = function(){
  const a='XAU', A=S.analysis[a+'|'+S.tf], s=sessNow(), J=journalStats();
  const hr=new Date().getHours(), greet=hr<12?'صباح الخير':'مساء الخير';
  const r24=range24(a), ch=change24(a), s15=series(a,'15m'), n15=s15.c.length-1, pos=Math.max(0,Math.min(100,(last(a)-r24.lo)/(r24.hi-r24.lo||1)*100));
  const trends=Object.keys(ASSETS).map(trendOf), bull=trends.filter(t=>t==='up').length, bear=trends.filter(t=>t==='down').length, senti=Math.round(50+(bull-bear)/trends.length*50);
  const movers=Object.keys(ASSETS).map(k=>({k,c:change24(k)})).sort((x,y)=>Math.abs(y.c)-Math.abs(x.c));
  const nextNews=EVENTS.slice().sort((x,y)=>((x.h-s.h+24)%24)-((y.h-s.h+24)%24)).slice(0,3);
  const decision = A ? `
      <div class="decision"><div><div class="label">القرار · ${ASSETS[a].name} · <span class="ltr">${A.tf}</span></div>
        <h2 class="pulse" style="color:${decCol(A)}">${decTitle(A)}</h2>
        <div class="label">${A.aligned} من ${A.nTf} أطر · اتفاق ${A.agree} من ${A.votes.length}</div></div>${gauge(A.conf)}</div>
      <div class="minigrid"><div>الدخول<b class="gold">${fp(a,A.mid)}</b></div><div>الوقف<b class="dn">${fp(a,A.sl)}</b></div><div>الهدف 1<b class="up">${fp(a,A.tps[0])}</b></div><div>الهدف 3<b class="up">${fp(a,A.tps[2])}</b></div></div>
      <div style="margin-top:12px">${confRows(A)}</div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><a class="btn sm" href="#chart" style="min-height:42px">الخطة على الشارت</a><button class="btn outline sm" data-act="alert-entry" style="min-height:42px">نبّهني عند الدخول</button></div>`
    : `<div class="label">${ASSETS[a].name} · <span class="ltr">${S.tf}</span></div>
      <h2 style="font-family:var(--f-display);font-size:30px;margin:6px 0 4px">جاهز للتحليل</h2>
      <p class="mut" style="margin:0 0 16px;font-size:13.5px;line-height:1.7">خمس مدارس على ثلاثة أطر زمنية، في قرار واحد مع الدخول والوقف والأهداف.</p>
      <div style="display:grid;gap:8px;margin-bottom:16px">${['ICT + SMC','الدعم والمقاومة','حركة السعر','وايكوف','إليوت وفيبوناتشي'].map(n=>`<div class="conf-row"><span>${n}</span><div class="cbar"><i style="width:0"></i></div><span class="mut num">—</span></div>`).join('')}</div>
      <button class="btn" data-act="run-home" style="width:100%"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></svg>تشغيل التحليل على الذهب</button>`;
  return `
  <div class="sechead"><div><div class="label">${greet}</div><div style="font-family:var(--f-display);font-size:30px;font-weight:700;line-height:1.2">غرفة القيادة</div></div><div class="sub">${new Date().toLocaleDateString('ar',{weekday:'long',day:'numeric',month:'long'})}</div></div>
  <div class="bento">
    <section class="card pad s5" aria-label="الذهب مباشر">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <div><div style="font-family:var(--f-display);font-size:20px;font-weight:600">${ASSETS[a].name}</div><div class="label">مباشر</div></div>
        <div><div class="eyebrow">XAU/USD · LIVE</div><div class="bigprice" data-live="${a}" data-kind="raw">${fp(a,last(a))}</div><div class="num ltr ${ch>=0?'up':'dn'}" style="text-align:right;font-size:13px" data-live="${a}" data-kind="chg">${pct(ch)}</div></div>
      </div>
      ${bigSpark(a)}
      <div style="display:grid;gap:6px;margin-top:6px"><div class="rbar"><i style="right:calc(${(100-pos).toFixed(1)}% - 2px)"></i></div><div class="label num ltr" style="display:flex;justify-content:space-between"><span>L ${fp(a,r24.lo)}</span><span class="mut">المدى اليومي</span><span>H ${fp(a,r24.hi)}</span></div></div>
      <div class="chips" style="margin-top:12px"><span class="mchip">RSI<b>${s15.rsi[n15].toFixed(1)}</b></span><span class="mchip">ATR<b>${fmt(s15.atr[n15],2)}</b></span><span class="mchip">EMA20<b>${fmt(s15.ema20[n15],2)}</b></span><span class="mchip">الاتجاه<b class="${TREND[trendOf(a)][1]}" style="font-family:var(--f-body)">${TREND[trendOf(a)][0]}</b></span></div>
      <div style="display:flex;gap:8px;margin-top:14px"><a class="btn ghost sm" href="#chart" data-open="XAU">افتح الشارت</a><a class="btn ghost sm" href="#trades">الأوامر المعلقة</a></div>
    </section>

    <section class="card lux ${A?(A.wait?'':(A.sell?'sell':'buy')):''} ${S.reveal?'reveal':''} pad hero s4" aria-label="القرار">${decision}</section>

    <section class="card pad s3" aria-label="ساعة الجلسات">
      <div class="sechead" style="margin-bottom:4px"><h2>ساعة الجلسات</h2><span class="sub num">UTC</span></div>
      ${dialSVG()}
      <ul class="list" style="margin-top:4px">${SESS.map((x,k)=>{const on=inSess(s.h,x);return `<li style="display:flex;justify-content:space-between;padding:6px 0;font-size:12.5px"><span><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${DIALC[k]};margin-inline-end:8px;opacity:${on?1:.35}"></i>${x.n}</span><span class="${on?'up':'mut'}">${on?'مفتوحة':'مغلقة'}</span></li>`;}).join('')}</ul>
    </section>

    <section class="card pad s5" aria-label="خريطة السوق">
      <div class="sechead"><h2>خريطة السوق</h2><span class="sub">تغيّر 24 ساعة</span></div>
      <div class="heat">${Object.keys(ASSETS).map(k=>{const c=change24(k), al=Math.min(.55,.12+Math.abs(c)/6), bg=c>=0?`rgba(63,182,139,${al})`:`rgba(229,72,77,${al})`; return `<a class="tile" href="#chart" data-open="${k}" style="background:linear-gradient(160deg,${bg},rgba(10,10,11,.5))"><span class="n">${ASSETS[k].name}</span><span><span class="c">${pct(c)}</span><br><span class="p" data-live="${k}" data-kind="raw">${fp(k,last(k))}</span></span></a>`;}).join('')}</div>
    </section>

    <section class="card pad s3" aria-label="ميل السوق">
      <div class="sechead" style="margin-bottom:0"><h2>ميل السوق</h2><span class="sub">${bull} صاعد · ${bear} هابط</span></div>
      ${sentiSVG(senti)}
      <div class="label" style="text-align:center;margin-top:-6px">${senti<40?'السوق يميل للهبوط':senti>60?'السوق يميل للصعود':'السوق متوازن'}</div>
      <ul class="list" style="margin-top:10px">${movers.slice(0,3).map(m=>`<li style="display:flex;justify-content:space-between;padding:7px 0;font-size:13px"><span>${ASSETS[m.k].name}</span><b class="num ltr ${m.c>=0?'up':'dn'}" style="font-weight:500">${pct(m.c)}</b></li>`).join('')}</ul>
    </section>

    <section class="card pad s4" aria-label="المفضلة">
      <div class="sechead"><h2>المفضلة</h2><a href="#markets" style="font-size:13px">كل الأسواق</a></div>
      <ul class="list">${S.favs.slice(0,5).map(f=>`
        <li><a href="#chart" data-open="${f}" style="display:grid;grid-template-columns:1fr auto auto;gap:12px;align-items:center;padding:9px 0;color:inherit;text-decoration:none">
          <span><b style="font-size:14px">${ASSETS[f].name}</b><br><span class="label num ltr">${ASSETS[f].sym}</span></span>
          ${sparkSVG(f,70,26)}
          <span style="text-align:left"><b class="num ltr" style="font-weight:500" data-live="${f}">${fp(f,last(f))}</b><br><span data-live="${f}" data-kind="chg" class="num ltr ${change24(f)>=0?'up':'dn'}" style="font-size:12px">${pct(change24(f))}</span></span>
        </a></li>`).join('')}</ul>
    </section>

    <section class="card pad s6" aria-label="الأداء">
      <div class="sechead"><h2>أداؤك هذا الشهر</h2><a href="#trades" data-tab="journal" style="font-size:13px">السجل الكامل</a></div>
      <div class="stats" style="grid-template-columns:repeat(4,1fr)">
        <div class="stat"><span class="label">نسبة النجاح</span><b data-count="${J.win}" data-suf="%">${J.win}%</b></div>
        <div class="stat"><span class="label">صافي العائد</span><b class="up ltr" style="text-align:right" data-count="${J.r.toFixed(1)}" data-dec="1" data-pre="+" data-suf="R">+${J.r.toFixed(1)}R</b></div>
        <div class="stat"><span class="label">متوسط الربح</span><b class="ltr" style="text-align:right">${J.avgW.toFixed(1)}R</b></div>
        <div class="stat"><span class="label">الصفقات</span><b data-count="${J.n}">${J.n}</b></div>
      </div>
      <div style="margin-top:10px">${equitySVG()}</div>
      <p class="note">من سجل إشارات التطبيق.</p>
    </section>

    <section class="card pad s3" aria-label="التنبيهات">
      <div class="sechead"><h2>التنبيهات</h2><a href="#alerts" style="font-size:13px">إدارة</a></div>
      <ul class="list">${S.alerts.filter(x=>x.on).slice(0,4).map(x=>`<li style="padding:9px 0;font-size:13px"><span>${alertTitle(x)}</span>${x.note?`<br><span class="label">${esc(x.note)}</span>`:''}</li>`).join('') || '<li><p class="empty" style="padding:10px 0">لا توجد تنبيهات نشطة.</p></li>'}</ul>
    </section>

    <section class="card pad s3" aria-label="الأخبار القادمة">
      <div class="sechead"><h2>الأخبار القادمة</h2><a href="#agenda" style="font-size:13px">الأجندة</a></div>
      <ul class="list">${nextNews.map(e=>`<li class="newsrow"><span class="impact" aria-label="تأثير">${[1,2,3].map(i=>`<i style="background:${i<=e.imp?(e.imp===3?C.sell:C.gold):''}"></i>`).join('')}</span><span>${esc(e.n)}</span><span class="num mut" style="font-size:11.5px">${esc(e.cur)}</span></li>`).join('')}</ul>
      <p class="note">من الأجندة الاقتصادية.</p>
    </section>
  </div>`;
};
const DIALC=['#6ea8ff','#b48cff','#3fb68b','#d4af6a'];
function dialSVG(){
  const s=sessNow(), P=(r,h)=>{const g=(h/24*360-90)*Math.PI/180; return [100+r*Math.cos(g),100+r*Math.sin(g)];};
  const arc=(r,a0,a1)=>{ const sp=((a1-a0)+24)%24||24; const [x0,y0]=P(r,a0),[x1,y1]=P(r,a0+sp-.001); return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${sp>12?1:0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
  const R=[82,70,58,46];
  const ticks=[...Array(24)].map((_,h)=>{const [x0,y0]=P(92,h),[x1,y1]=P(h%6?95:98,h); return `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="${h%6?'#3a342b':'#a39b8d'}" stroke-width="${h%6?1:1.5}"/>`;}).join('');
  const labs=[0,6,12,18].map(h=>{const [x,y]=P(80+30,h); return '';}).join('');
  const [hx,hy]=P(88,s.h); const d=new Date(); const lt=String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
  return `<svg viewBox="0 0 200 200" width="100%" style="max-width:230px;display:block;margin:0 auto;direction:ltr" role="img" aria-label="ساعة الجلسات">
    <defs><radialGradient id="dg" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="rgba(212,175,106,.16)"/><stop offset="1" stop-color="rgba(212,175,106,0)"/></radialGradient></defs>
    <circle cx="100" cy="100" r="99" fill="url(#dg)"/>${ticks}
    ${SESS.map((x,k)=>{const on=inSess(s.h,x); return `<circle cx="100" cy="100" r="${R[k]}" fill="none" stroke="#1e1c19" stroke-width="7"/><path d="${arc(R[k],x.s,x.e)}" fill="none" stroke="${DIALC[k]}" stroke-width="7" stroke-linecap="round" opacity="${on?1:.3}" ${on?`style="filter:drop-shadow(0 0 5px ${DIALC[k]})"`:''}/>`;}).join('')}
    ${KILL.map(k=>`<path d="${arc(92,k.s,k.e)}" fill="none" stroke="#e5484d" stroke-width="2.5" opacity=".8"/>`).join('')}
    <line x1="100" y1="100" x2="${hx.toFixed(1)}" y2="${hy.toFixed(1)}" stroke="#f4efe6" stroke-width="2" stroke-linecap="round" style="filter:drop-shadow(0 0 4px #fff)"/><circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="3.5" fill="#fff"/>
    <circle cx="100" cy="100" r="30" fill="#0e0d0c" stroke="#2a2620"/>
    <text x="100" y="99" text-anchor="middle" font-family="DM Mono" font-size="15" fill="#f4efe6">${lt}</text>
    <text x="100" y="114" text-anchor="middle" font-family="Tajawal" font-size="8.5" fill="${s.kill?'#d4af6a':'#a39b8d'}">${s.kill?'كيل زون':'توقيتك'}</text>
    <text x="100" y="12" text-anchor="middle" font-family="DM Mono" font-size="7" fill="#a39b8d">00</text><text x="192" y="102" text-anchor="middle" font-family="DM Mono" font-size="7" fill="#a39b8d">06</text><text x="100" y="196" text-anchor="middle" font-family="DM Mono" font-size="7" fill="#a39b8d">12</text><text x="8" y="102" text-anchor="middle" font-family="DM Mono" font-size="7" fill="#a39b8d">18</text>
  </svg>`;
}
function sentiSVG(v){
  const rot=(v/100*180-90).toFixed(1);
  return `<svg viewBox="0 0 200 120" width="100%" style="max-width:240px;display:block;margin:6px auto 0;direction:ltr" role="img" aria-label="ميل السوق ${v} من 100">
    <defs><linearGradient id="sg" x1="0" x2="1"><stop offset="0" stop-color="#e5484d"/><stop offset=".5" stop-color="#d4af6a"/><stop offset="1" stop-color="#3fb68b"/></linearGradient></defs>
    <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="#1e1c19" stroke-width="14" stroke-linecap="round"/>
    <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="url(#sg)" stroke-width="14" stroke-linecap="round" opacity=".9" style="filter:drop-shadow(0 0 6px rgba(212,175,106,.4))"/>
    <g class="needle" style="transform:rotate(${rot}deg)"><line x1="100" y1="100" x2="100" y2="32" stroke="#f4efe6" stroke-width="2.5" stroke-linecap="round" style="filter:drop-shadow(0 0 4px #fff)"/></g>
    <circle cx="100" cy="100" r="7" fill="#f4efe6"/><circle cx="100" cy="100" r="3" fill="#0a0a0b"/>
    <text x="20" y="118" text-anchor="middle" font-family="Tajawal" font-size="9" fill="#a39b8d">هبوط</text><text x="180" y="118" text-anchor="middle" font-family="Tajawal" font-size="9" fill="#a39b8d">صعود</text>
  </svg>`;
}
function bigSpark(a){
  const s=series(a,'1H').c.slice(-72).map(d=>d.c), lo=Math.min(...s), hi=Math.max(...s), w=520, h=120, up=s[s.length-1]>=s[0], col=up?C.buy:C.sell;
  const pts=s.map((v,i)=>[(i/(s.length-1))*w, h-8-(v-lo)/(hi-lo||1)*(h-20)]);
  const d='M'+pts.map(p=>p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' L');
  const lp=pts[pts.length-1];
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="none" style="display:block;height:120px;margin-top:10px" aria-hidden="true">
    <defs><linearGradient id="bsg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#d4af6a" stop-opacity=".35"/><stop offset="1" stop-color="#d4af6a" stop-opacity="0"/></linearGradient></defs>
    ${[.25,.5,.75].map(k=>`<line x1="0" x2="${w}" y1="${(h*k).toFixed(0)}" y2="${(h*k).toFixed(0)}" stroke="#1e1c19" stroke-dasharray="2 6"/>`).join('')}
    <path d="${d} L${w} ${h} L0 ${h}Z" fill="url(#bsg)"/>
    <path d="${d}" fill="none" stroke="#e6c27a" stroke-width="2" style="filter:drop-shadow(0 0 6px rgba(212,175,106,.7))" vector-effect="non-scaling-stroke"/>
    <circle cx="${lp[0].toFixed(1)}" cy="${lp[1].toFixed(1)}" r="4" fill="${col}"><animate attributeName="r" values="3;7;3" dur="1.6s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;.4;1" dur="1.6s" repeatCount="indefinite"/></circle>
  </svg>`;
}
function confluence(A){ return enabledIds().map(id=>{ let ag=0,t=0; A.mtf.forEach(m=>{ const v=m.votes.find(x=>x.id===id); if(!v) return; t++; if(A.bias!=='neutral' && (A.sell?v.bear:v.bull)) ag++; }); return {n:SCHOOLS.NAMES[id].ar, p:Math.round(ag/(t||1)*100)}; }); }
function confRows(A){ return confluence(A).map((c,k)=>{ const col=c.p>=70?(A.sell?C.sell:C.buy):c.p>=50?C.gold:C.muted; return `<div class="conf-row"><span>${c.n}</span><div class="cbar"><i style="width:${c.p}%;background:${col};color:${col};animation-delay:${k*.08}s"></i></div><b class="num ltr" style="font-weight:500;color:${col}">${c.p}%</b></div>`; }).join(''); }
function statStrip(a){ const sr=series(a,S.tf), n=sr.c.length-1, r=range24(a), ch=change24(a), t=TREND[trendOf(a)];
  const mtf=Object.keys(TFS).map(tf=>{ const b=votesFor(series(a,tf)).filter(v=>v.bear).length; return {tf,d:b>=4?-1:b<=2?1:0}; });
  return `<div class="statstrip"><div>تغيّر 24س<b class="${ch>=0?'up':'dn'}">${pct(ch)}</b></div><div>أعلى 24س<b>${fp(a,r.hi)}</b></div><div>أدنى 24س<b>${fp(a,r.lo)}</b></div><div>ATR 14<b>${fmt(sr.atr[n],ASSETS[a].dec)}</b></div><div>RSI 14<b>${sr.rsi[n].toFixed(1)}</b></div><div>الاتجاه<b class="${t[1]}" style="font-family:var(--f-body)">${t[0]}</b></div><div>اتجاه الأطر<span class="mtfchips">${mtf.map(m=>`<span style="background:${m.d<0?'rgba(229,72,77,.16)':m.d>0?'rgba(63,182,139,.16)':'#1e1c19'};color:${m.d<0?C.sell:m.d>0?C.buy:C.muted}">${m.tf} ${m.d<0?'↓':m.d>0?'↑':'–'}</span>`).join('')}</span></div></div>`; }
AFTER.home = function(){
  const v=$('view');
  v.querySelectorAll('[data-open]').forEach(el=>el.addEventListener('click',()=>{ S.asset=el.dataset.open; }));
  const r=v.querySelector('[data-act="run-home"]'); if(r) r.onclick=()=>{ S.asset='XAU'; runScan('XAU',S.tf,()=>{ S.reveal=true; toast('اكتمل التحليل','الذهب · '+S.tf); render(); }); };
  const e=v.querySelector('[data-act="alert-entry"]'); if(e) e.onclick=()=>{ const A=S.analysis['XAU|'+S.tf]; addAlert('XAU', A.sell?'above':'below', A.sell?A.lo:A.hi, 'منطقة الدخول'); };
  const j=v.querySelector('[data-tab="journal"]'); if(j) j.onclick=()=>{ S.tradesTab='journal'; };
};

VIEWS.markets = function(){
  const cats=[['all','الكل'],['fav','المفضلة'],['fx','معادن وعملات'],['crypto','كريبتو'],['idx','مؤشرات']];
  return `
  <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
    <label class="field" style="flex:1 1 240px"><span style="position:absolute;width:1px;height:1px;overflow:hidden">بحث</span><input id="mkq" type="search" placeholder="ابحث بالاسم أو الرمز…" value="${esc(S.mkQuery)}"></label>
    <div style="display:flex;gap:6px;overflow-x:auto" role="group" aria-label="الفئات">${cats.map(([k,n])=>`<button class="chip" data-cat="${k}" aria-pressed="${S.mkCat===k}">${n}</button>`).join('')}</div>
  </div>
  <section class="card" style="overflow-x:auto">
    <table class="mtable">
      <thead><tr><th style="width:44px"></th><th>الأصل</th><th class="hide-s">آخر 48 ساعة</th><th>السعر</th><th>24 ساعة</th><th class="hide-s">المدى اليومي</th><th class="hide-s">الاتجاه</th></tr></thead>
      <tbody id="mkbody"></tbody>
    </table>
  </section>
  <p class="note">اضغط على أي أصل لفتح الشارت والتحليل. الأسعار مباشرة.</p>`;
};
function marketRows(){
  const q=S.mkQuery.trim().toLowerCase();
  const list=Object.keys(ASSETS).filter(a=>{ const A=ASSETS[a]; if(S.mkCat==='fav' && !S.favs.includes(a)) return false; if(!['all','fav'].includes(S.mkCat) && A.cat!==S.mkCat) return false; return !q || A.name.includes(q) || A.sym.toLowerCase().includes(q); });
  $('mkbody').innerHTML = list.map(a=>{ const A=ASSETS[a], ch=change24(a), r=range24(a), t=TREND[trendOf(a)], pos=Math.max(0,Math.min(100,(last(a)-r.lo)/(r.hi-r.lo||1)*100));
    return `<tr class="row" data-open="${a}">
      <td><button class="star" data-fav="${a}" aria-pressed="${S.favs.includes(a)}" aria-label="مفضلة ${A.name}"><svg width="18" height="18" viewBox="0 0 24 24" fill="${S.favs.includes(a)?'currentColor':'none'}" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/></svg></button></td>
      <td><b>${A.name}</b><br><span class="label num ltr">${A.sym}</span></td>
      <td class="hide-s">${sparkSVG(a,110,30)}</td>
      <td><b class="num ltr" style="font-weight:500" data-live="${a}">${fp(a,last(a))}</b></td>
      <td><span data-live="${a}" data-kind="chg" class="num ltr ${ch>=0?'up':'dn'}">${pct(ch)}</span></td>
      <td class="hide-s"><div class="range" title="${fp(a,r.lo)} – ${fp(a,r.hi)}"><i style="right:${(100-pos).toFixed(0)}%"></i></div><div class="label num ltr" style="font-size:10.5px;margin-top:4px;display:flex;justify-content:space-between;width:110px"><span>${fp(a,r.lo)}</span><span>${fp(a,r.hi)}</span></div></td>
      <td class="hide-s"><span class="tag ${t[1]}">${t[0]}</span></td></tr>`; }).join('') || '<tr><td colspan="7"><p class="empty" style="padding:16px">لا توجد نتائج. جرّب اسماً آخر.</p></td></tr>';
}
AFTER.markets = function(){
  marketRows();
  $('mkq').addEventListener('input',e=>{ S.mkQuery=e.target.value; marketRows(); });
  $('view').querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{ S.mkCat=b.dataset.cat; $('view').querySelectorAll('[data-cat]').forEach(x=>x.setAttribute('aria-pressed',String(x===b))); marketRows(); });
  $('mkbody').addEventListener('click',e=>{
    const f=e.target.closest('[data-fav]'); if(f){ e.stopPropagation(); const a=f.dataset.fav; S.favs = S.favs.includes(a)? S.favs.filter(x=>x!==a) : [...S.favs,a]; store.set('favs',S.favs); marketRows(); return; }
    const r=e.target.closest('[data-open]'); if(r){ S.asset=r.dataset.open; location.hash='#chart'; }
  });
};

/* ---------- chart view ---------- */
VIEWS.chart = function(){
  const a=S.asset, A=ASSETS[a];
  return `
  <div class="chartwrap ${S.ch.full?'full':''}" id="cwrap">
    <section class="card chartcard" aria-label="الشارت">
      <div class="bar">
        <button class="assetsel" id="pickAsset" aria-label="تغيير الأصل"><b>${A.name}</b><span class="label num ltr">${A.sym}</span><b class="num ltr" style="font-weight:500" data-live="${a}">${fp(a,last(a))}</b><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
        <div class="seg" id="tfs" role="group" aria-label="الإطار الزمني">${Object.keys(TFS).map(t=>`<button data-tf="${t}" aria-pressed="${t===S.tf}">${t}</button>`).join('')}</div>
        <button class="tog" data-show="ema20" aria-pressed="${S.ch.show.ema20}"><i style="color:#d4af6a"></i>EMA 20</button>
        <button class="tog" data-show="ema50" aria-pressed="${S.ch.show.ema50}"><i style="color:#6ea8ff"></i>EMA 50</button>
        <button class="tog" data-show="rsi" aria-pressed="${S.ch.show.rsi}"><i style="color:#b48cff"></i>RSI</button>
        <button class="tog" data-show="ict" aria-pressed="${S.ch.show.ict}"><i style="color:#e5484d"></i>طبقة ICT</button>
        <button class="tog" data-show="lv" aria-pressed="${S.ch.show.lv}"><i style="color:#3fb68b"></i>الخطة</button>
        <span class="spacer"></span>
        <button class="tog" id="zin" aria-label="تكبير">+</button>
        <button class="tog" id="zout" aria-label="تصغير">−</button>
        <button class="tog" id="zfit">آخر الشموع</button>
        <button class="tog" id="full" aria-pressed="${S.ch.full}" aria-label="ملء الشاشة"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>
      </div>
      ${statStrip(a)}
      <div class="rail" id="rail" role="toolbar" aria-label="أدوات الرسم"></div>
      <div class="stage" id="stage"><canvas id="cv"></canvas><div class="ohlc" id="ohlc"></div><div class="hint" id="hint" hidden></div></div>
      <div class="cfoot"><div class="legend"><span style="--c:#e5484d">وقف</span><span style="--c:#d4af6a">دخول</span><span style="--c:#3fb68b">أهداف</span><span style="--c:#6ea8ff">سيولة</span></div><span class="spacer"></span><span>اسحب للتحريك · عجلة أو إصبعين للتكبير · <span class="num">Esc</span> مؤشر · <span class="num">Ctrl+Z</span> تراجع · <span class="num">Delete</span> حذف آخر رسم</span></div>
    </section>
    <aside class="panel" id="cpanel" aria-label="التحليل"></aside>
  </div>`;
};
function panelHTML(){
  const a=S.asset, A=S.analysis[a+'|'+S.tf], tab=S.ch.panelTab;
  const head = A ? `
    <div class="decision"><div><div class="label">القرار · ${ASSETS[a].name} · <span class="ltr">${S.tf}</span></div><h2 class="pulse" style="color:${decCol(A)}">${decTitle(A)}</h2><div class="label">اتفاق ${A.agree} من ${A.votes.length} · ${A.aligned} من ${A.nTf} أطر</div></div>${gauge(A.conf)}</div>
    <div style="display:flex;gap:8px;margin-top:12px"><button class="btn" id="run" style="flex:1">إعادة التحليل</button><button class="btn outline sm" id="copyPlan" style="min-height:46px">نسخ</button></div>`
  : `<div class="label">التحليل الذكي · ${ASSETS[a].name} · <span class="ltr">${S.tf}</span></div><h2 style="font-family:var(--f-display);font-size:28px;margin:4px 0 2px">جاهز للتحليل</h2><p class="label" style="margin:0 0 12px">يرسم القرار والخطة على الشارت مباشرة.</p><button class="btn" id="run" style="width:100%"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></svg>تشغيل التحليل</button>`;
  let body='';
  if(tab==='plan'){
    if(!A) body='<p class="empty">ستظهر هنا مستويات الدخول والوقف والأهداف وحجم الصفقة المقترح.</p>';
    else { const sz=sizeFor(a,A.mid,A.sl); body = `<div class="label" style="margin-bottom:4px">توافق المدارس مع القرار</div>${confRows(A)}<div style="height:10px"></div><div class="list">${ladder(a,A)}</div>
      <div style="margin-top:12px;border-radius:14px;border:1px solid var(--line);padding:12px;background:var(--bg);display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
        <div><span class="mut">المخاطرة (${S.prefs.risk}%)</span><br><b class="num ltr" style="font-weight:500;font-size:15px">$${fmt(sz.riskAmt,0)}</b></div>
        <div><span class="mut">الحجم المقترح</span><br><b class="num ltr" style="font-weight:500;font-size:15px">${fmt(sz.units, sz.units<10?3:1)}</b> <span class="mut">وحدة</span></div>
      </div>
      <button class="btn outline sm" id="alertEntry" style="width:100%;margin-top:10px">نبّهني عند الوصول لمنطقة الدخول</button>
      <div style="margin-top:12px;border-radius:14px;padding:10px 12px;border:1px solid rgba(229,72,77,.35);background:rgba(229,72,77,.05);font-size:12.5px"><b class="dn">يُلغى إذا:</b> أغلقت شمعة <span class="ltr">${S.tf}</span> ${A.sell?'فوق':'تحت'} <span class="num ltr">${fp(a,A.sl)}</span> أو انكسر الهيكل عكس الاتجاه.</div>`; }
  } else if(tab==='why'){
    body = !A ? '<p class="empty">شغّل التحليل لعرض الشروط.</p>' : `<ul class="list checks">${A.votes.map(v=>{const ok=v.bear===A.sell;return `<li><span><span class="${ok?'up':'dn'}">${ok?'✓':'✕'}</span> ${v.k}</span><span class="mut ${/^[-\d]/.test(v.v)?'num ltr':''}" style="font-size:12px">${v.v}</span></li>`;}).join('')}</ul>`;
  } else if(tab==='mtf'){
    body = !A ? '<p class="empty">شغّل التحليل لعرض توافق الأطر.</p>' : `<table class="matrix"><thead><tr><th></th>${A.votes.map(v=>`<th>${v.short}</th>`).join('')}</tr></thead><tbody>${A.mtf.map(r=>`<tr><td>${r.tf}</td>${r.votes.map(v=>`<td style="color:${v.bear?C.sell:C.buy}">${v.bear?'↓':'↑'}</td>`).join('')}</tr>`).join('')}</tbody></table><p class="note" style="margin-top:8px">${A.aligned} من ${A.nTf} أطر تؤكد ${A.sell?'البيع':'الشراء'}.</p>`;
  } else if(tab==='draw'){
    const D=getDrawings();
    body = `<div class="h" style="margin:0 0 6px"><span class="label">${D.length} رسم على ${ASSETS[a].name} · <span class="ltr">${S.tf}</span></span>${D.length?'<button class="btn ghost sm" id="clearD">مسح الكل</button>':''}</div>
      <ul class="list drawlist">${D.length? D.map((d,k)=>`<li><span class="c" style="background:${d.color}"></span><span>${NAMES[d.type]}</span><span class="mut ${d.type==='text'?'':'num ltr'}" style="font-size:11.5px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.type==='text'?esc(d.text):drawVal(d)}</span>${d.type==='hline'?`<button class="mini" data-alert="${k}" aria-label="تنبيه عند هذا السعر" title="تنبيه عند هذا السعر"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/></svg></button>`:''}<button class="mini" data-del="${k}" aria-label="حذف">×</button></li>`).join('') : '<li><p class="empty" style="padding:6px 0">اختر أداة من الشريط وارسم على الشارت. الخط الأفقي يمكن تحويله لتنبيه سعر.</p></li>'}</ul>`;
  }
  return `<section class="card lux ${A?(A.wait?'':(A.sell?'sell':'buy')):''} ${S.reveal?'reveal':''} pad">${head}</section>
  <section class="card pad">
    <div class="tabs" role="tablist" aria-label="تفاصيل" style="margin-bottom:10px">${[['plan','الخطة'],['why','الشروط'],['mtf','الأطر'],['draw','رسوماتي']].map(([k,n])=>`<button role="tab" data-ptab="${k}" aria-selected="${tab===k}">${n}</button>`).join('')}</div>
    ${body}
  </section>
  <p class="note">تحليل تعليمي من شموع مغلقة فقط · ليس نصيحة مالية.</p>`;
}
function renderPanel(){
  const p=$('cpanel'); if(!p) return; p.innerHTML=panelHTML();
  const a=S.asset;
  $('run').onclick=()=>{ runScan(a,S.tf,()=>{ S.reveal=true; S.ch.show.lv=true; const t=document.querySelector('[data-show="lv"]'); if(t) t.setAttribute('aria-pressed','true'); toast('اكتمل التحليل', ASSETS[a].name+' · '+S.tf); renderPanel(); chartDraw(); }); };
  S.reveal=false;
  p.querySelectorAll('[data-ptab]').forEach(b=>b.onclick=()=>{ S.ch.panelTab=b.dataset.ptab; renderPanel(); });
  const ae=$('alertEntry'); if(ae) ae.onclick=()=>{ const A=planOf(a,S.tf); if(!A){ toast('لا توجد صفقة مؤكدة','شغّل الرادار أولاً'); return; } addAlert(a, A.sell?'above':'below', A.sell?A.lo:A.hi, 'منطقة الدخول'); };
  const cp=$('copyPlan'); if(cp) cp.onclick=()=>{ const A=S.analysis[a+'|'+S.tf]; const txt=`${ASSETS[a].sym} ${S.tf} ${A.sell?'SELL':'BUY'}\nEntry ${fp(a,A.lo)} - ${fp(a,A.hi)}\nSL ${fp(a,A.sl)}\nTP1 ${fp(a,A.tps[0])}\nTP2 ${fp(a,A.tps[1])}\nTP3 ${fp(a,A.tps[2])}`; (navigator.clipboard?navigator.clipboard.writeText(txt):Promise.reject()).then(()=>toast('تم النسخ','خطة الصفقة في الحافظة'),()=>toast('تعذّر النسخ','انسخ القيم من الخطة يدوياً')); };
  const cd=$('clearD'); if(cd) cd.onclick=()=>{ setDrawings([]); renderPanel(); chartDraw(); };
  p.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{ const D=getDrawings(); D.splice(+b.dataset.del,1); setDrawings(D); renderPanel(); chartDraw(); });
  p.querySelectorAll('[data-alert]').forEach(b=>b.onclick=()=>{ const d=getDrawings()[+b.dataset.alert]; addAlert(a, d.p>last(a)?'above':'below', d.p, 'من خط على الشارت'); });
}

/* ---------- chart engine ---------- */
const TOOLS=[
  {id:'cursor',name:'المؤشر والتحريك',svg:'<path d="M5 3l14 7-6 2-2 6z"/>'},
  {id:'trend',name:'خط اتجاه',svg:'<path d="M4 19L20 5"/><circle cx="4" cy="19" r="1.8"/><circle cx="20" cy="5" r="1.8"/>'},
  {id:'ray',name:'شعاع',svg:'<path d="M4 18L21 6"/><circle cx="4" cy="18" r="1.8"/>'},
  {id:'hline',name:'خط أفقي',svg:'<path d="M3 12h18"/><circle cx="12" cy="12" r="1.8"/>'},
  {id:'channel',name:'قناة متوازية',svg:'<path d="M3 15L15 5M9 19L21 9"/>'},
  {id:'rect',name:'منطقة',svg:'<rect x="4" y="7" width="16" height="10" rx="1.5"/>'},
  {id:'fib',name:'فيبوناتشي',svg:'<path d="M4 5h16M4 9.5h16M4 14h16M4 19h16"/>'},
  {id:'long',name:'صفقة شراء',svg:'<rect x="4" y="4" width="16" height="8" rx="1"/><rect x="4" y="12" width="16" height="6" rx="1" opacity=".5"/>'},
  {id:'short',name:'صفقة بيع',svg:'<rect x="4" y="6" width="16" height="6" rx="1" opacity=".5"/><rect x="4" y="12" width="16" height="8" rx="1"/>'},
  {id:'text',name:'نص',svg:'<path d="M5 6h14M12 6v13"/>'},
  {id:'pen',name:'رسم حر',svg:'<path d="M4 18c3-6 5 2 8-4s5-6 8-8"/>'},
  {id:'measure',name:'قياس',svg:'<path d="M5 19V5M5 19h14"/><path d="M8 16l9-9"/>'},
  {id:'eraser',name:'ممحاة',svg:'<path d="M15 4l5 5-9 9H6l-3-3z"/><path d="M10 9l5 5"/>'}
];
const NAMES={trend:'خط اتجاه',ray:'شعاع',hline:'خط أفقي',channel:'قناة متوازية',rect:'منطقة',fib:'فيبوناتشي',long:'صفقة شراء',short:'صفقة بيع',text:'نص',pen:'رسم حر',measure:'قياس'};
const TWO=['trend','ray','rect','fib','measure','long','short','channel'];
const FIBS=[0,.236,.382,.5,.618,.786,1];
let cv, ctx, W=0, H=0, L={}, ro=null;
const dkey=()=>'draw-'+S.asset+'-'+S.tf;
function getDrawings(){ if(!S._d || S._dk!==dkey()){ S._d=store.get(dkey(),[]); S._dk=dkey(); } return S._d; }
function setDrawings(D){ S._d=D; S._dk=dkey(); store.set(dkey(),D); }
function drawVal(d){ const a=S.asset; if(d.type==='hline') return fp(a,d.p); if(d.a&&d.b) return fp(a,d.a.p)+' → '+fp(a,d.b.p); if(d.pts) return d.pts.length+' pts'; return ''; }

function chartTeardown(){ if(ro){ ro.disconnect(); ro=null; } if(S.ch.raf){ cancelAnimationFrame(S.ch.raf); S.ch.raf=null; } cv=null; }
AFTER.chart = function(){
  cv=$('cv'); ctx=cv.getContext('2d'); const st=$('stage');
  buildRail(); renderPanel();
  const ck=S.asset+'|'+S.tf; if(S.ch.right==null||S.ch.key!==ck){ S.ch.right=series(S.asset,S.tf).c.length-1+6; S.ch.key=ck; }
  $('tfs').onclick=e=>{const b=e.target.closest('[data-tf]'); if(!b) return; S.tf=b.dataset.tf; S.ch.right=null; render();};
  $('view').querySelectorAll('[data-show]').forEach(b=>b.onclick=()=>{ const k=b.dataset.show; S.ch.show[k]=!S.ch.show[k]; b.setAttribute('aria-pressed',String(S.ch.show[k])); chartDraw(); });
  $('zin').onclick=()=>zoomAt(L.x1*.7,S.ch.bw*1.25); $('zout').onclick=()=>zoomAt(L.x1*.7,S.ch.bw/1.25);
  $('zfit').onclick=()=>{ S.ch.bw=9; S.ch.right=series(S.asset,S.tf).c.length-1+6; chartDraw(); };
  $('full').onclick=()=>{ S.ch.full=!S.ch.full; $('cwrap').classList.toggle('full',S.ch.full); $('full').setAttribute('aria-pressed',String(S.ch.full)); };
  $('pickAsset').onclick=openPalette;
  bindPointer();
  ro=new ResizeObserver(()=>{ const r=st.getBoundingClientRect(), dpr=window.devicePixelRatio||1; W=r.width; H=r.height; cv.width=Math.round(W*dpr); cv.height=Math.round(H*dpr); ctx.setTransform(dpr,0,0,dpr,0,0); chartDraw(); });
  ro.observe(st);
  setTool(S.ch.tool,true);
  let lastF=0; const loopF=t=>{ if(!cv) return; if(t-lastF>40 && !matchMedia('(prefers-reduced-motion: reduce)').matches){ lastF=t; chartDraw(); } S.ch.raf=requestAnimationFrame(loopF); }; S.ch.raf=requestAnimationFrame(loopF);
};
function buildRail(){
  const r=$('rail');
  r.innerHTML = TOOLS.map(t=>`<button class="tool" data-tool="${t.id}" aria-pressed="${S.ch.tool===t.id}" aria-label="${t.name}" title="${t.name}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${t.svg}</svg></button>`).join('')
   + `<hr><button class="tool" id="magnet" aria-pressed="${S.ch.magnet}" aria-label="مغناطيس" title="مغناطيس: التصاق بأسعار الشمعة"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M6 4v8a6 6 0 0 0 12 0V4"/><path d="M6 8h4M14 8h4"/></svg></button>
     <button class="tool" id="undo" aria-label="تراجع" title="تراجع"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg></button><hr>`
   + PALETTE.map(c=>`<button class="sw" data-color="${c}" aria-pressed="${S.ch.color===c}" aria-label="لون" style="background:${c}"></button>`).join('');
  r.onclick=e=>{ const b=e.target.closest('button'); if(!b) return;
    if(b.dataset.tool) setTool(b.dataset.tool);
    else if(b.dataset.color){ S.ch.color=b.dataset.color; r.querySelectorAll('.sw').forEach(s=>s.setAttribute('aria-pressed',String(s===b))); }
    else if(b.id==='magnet'){ S.ch.magnet=!S.ch.magnet; b.setAttribute('aria-pressed',String(S.ch.magnet)); }
    else if(b.id==='undo') undo();
  };
}
function undo(){ const D=getDrawings(); D.pop(); setDrawings(D); if(S.ch.panelTab==='draw') renderPanel(); chartDraw(); }
function setTool(t,silent){ S.ch.tool=t; S.ch.draft=null; if(!cv) return; document.querySelectorAll('.tool[data-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tool===t))); cv.style.cursor=t==='cursor'?'grab':t==='eraser'?'not-allowed':t==='text'?'text':'crosshair';
  if(silent) return; if(t==='eraser') hint('اضغط على أي رسم لحذفه'); else if(t==='text') hint('اضغط على الشارت لكتابة نص'); else if(t==='hline') hint('اضغط على السعر لوضع خط أفقي'); else if(t==='channel') hint('ارسم الخط الأول، ثم اضغط لتحديد عرض القناة'); else if(NAMES[t]) hint('اسحب على الشارت لرسم '+NAMES[t]); else hideHint(); }
let hintT; function hint(t){ const h=$('hint'); if(!h) return; h.textContent=t; h.hidden=false; clearTimeout(hintT); hintT=setTimeout(hideHint,4000); }
function hideHint(){ const h=$('hint'); if(h) h.hidden=true; }

function layout(s){
  const axisW=W<500?58:72, timeH=22, rsiH=S.ch.show.rsi?Math.round(H*.19):0;
  L={x1:W-axisW, y0:26, y1:H-timeH-rsiH-(rsiH?6:0), rsiTop:H-timeH-rsiH, rsiBot:H-timeH, axisW, timeH};
  const n=s.c.length, maxR=n-1+(L.x1/S.ch.bw)*.6; S.ch.right=Math.max(10,Math.min(maxR,S.ch.right));
  const i0=Math.max(0,Math.floor(S.ch.right-L.x1/S.ch.bw)-1), i1=Math.min(n-1,Math.ceil(S.ch.right));
  let lo=Infinity,hi=-Infinity; for(let i=i0;i<=i1;i++){ lo=Math.min(lo,s.c[i].l); hi=Math.max(hi,s.c[i].h); }
  const A=planOf(S.asset,S.tf); if(A&&S.ch.show.lv){ lo=Math.min(lo,...A.tps,A.sl,A.lo); hi=Math.max(hi,...A.tps,A.sl,A.hi); }
  const pad=(hi-lo)*.08||1; L.min=lo-pad*2.6; L.max=hi+pad; L.i0=i0; L.i1=i1;
}
const X=i=>L.x1-(S.ch.right-i)*S.ch.bw-S.ch.bw/2, Y=p=>L.y0+(L.max-p)/(L.max-L.min)*(L.y1-L.y0);
const I=x=>S.ch.right-(L.x1-x-S.ch.bw/2)/S.ch.bw, P=y=>L.max-(y-L.y0)/(L.y1-L.y0)*(L.max-L.min);
function toData(x,y,snap){ let i=I(x),p=P(y); if(snap&&S.ch.magnet){ const s=series(S.asset,S.tf), ir=Math.round(i), d=s.c[ir]; if(d){ let best=null,bd=1e9; for(const v of [d.o,d.h,d.l,d.c]){ const dy=Math.abs(Y(v)-y); if(dy<bd){bd=dy;best=v;} } if(bd<28){p=best;i=ir;} } } return {i,p}; }
function niceStep(r){const pw=Math.pow(10,Math.floor(Math.log10(r)));const n=r/pw;return (n<1.5?1:n<3?2:n<7?5:10)*pw;}
function fmtT(t){const d=new Date(t);if(TFS[S.tf]>=1440)return d.getDate()+'/'+(d.getMonth()+1);let h=d.getHours();const m=String(d.getMinutes()).padStart(2,'0');if(S.prefs.clock===12){const ap=h>=12?'pm':'am';h=h%12||12;return h+':'+m+ap;}return String(h).padStart(2,'0')+':'+m;}

function chartDraw(){
  if(!cv||!W) return;
  const s=series(S.asset,S.tf), c=s.c, a=S.asset, dec=ASSETS[a].dec, A=planOf(a,S.tf);
  layout(s); ctx.clearRect(0,0,W,H); const bgG=ctx.createRadialGradient(W*.45,H*.35,10,W*.45,H*.35,Math.max(W,H)*.8); bgG.addColorStop(0,'rgba(30,24,14,.92)'); bgG.addColorStop(1,'rgba(8,8,9,.96)'); ctx.fillStyle=bgG; ctx.fillRect(0,0,W,H); const NOW=performance.now();
  const step=niceStep((L.max-L.min)/6); ctx.font='11px "DM Mono", monospace'; ctx.textBaseline='middle'; ctx.textAlign='left';
  const sd = step<.01?4:step<.1?3:step<1?2:step<10?1:0;
  for(let v=Math.ceil(L.min/step)*step; v<=L.max; v+=step){ const y=Math.round(Y(v))+.5; if(y<L.y0-4||y>L.y1) continue; ctx.strokeStyle=C.grid; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(L.x1,y); ctx.stroke(); ctx.fillStyle=C.muted; ctx.fillText(fmt(v,sd),L.x1+8,y); }
  const every=Math.max(1,Math.ceil(90/S.ch.bw)); ctx.textAlign='center';
  for(let i=L.i0;i<=L.i1;i++){ if(i%every) continue; const x=Math.round(X(i))+.5; if(x<24||x>L.x1-24) continue; ctx.strokeStyle=C.grid; ctx.beginPath(); ctx.moveTo(x,L.y0); ctx.lineTo(x,L.y1); ctx.stroke(); ctx.fillStyle=C.muted; ctx.fillText(fmtT(c[i].t),x,H-L.timeH/2); }
  ctx.strokeStyle=C.line; ctx.beginPath(); ctx.moveTo(L.x1+.5,0); ctx.lineTo(L.x1+.5,H); ctx.moveTo(0,H-L.timeH+.5); ctx.lineTo(W,H-L.timeH+.5); ctx.stroke();
  ctx.save(); ctx.beginPath(); ctx.rect(0,L.y0-20,L.x1,L.y1-L.y0+20); ctx.clip();
  // watermark
  ctx.fillStyle='rgba(212,175,106,.05)'; ctx.font='600 46px "El Messiri", serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(ASSETS[a].sym, L.x1/2, (L.y0+L.y1)/2);
  if(S.ch.show.ict){
    s.fvgs.forEach(z=>{ const xa=X(z.i),ya=Y(z.top),yb=Y(z.bot); const fg=ctx.createLinearGradient(xa,0,L.x1,0); fg.addColorStop(0,z.dir<0?'rgba(229,72,77,.32)':'rgba(63,182,139,.32)'); fg.addColorStop(1,z.dir<0?'rgba(229,72,77,.03)':'rgba(63,182,139,.03)'); ctx.fillStyle=fg; ctx.strokeStyle=z.dir<0?'rgba(229,72,77,.45)':'rgba(63,182,139,.45)'; ctx.fillRect(xa,ya,L.x1-xa,yb-ya); ctx.setLineDash([3,3]); ctx.strokeRect(xa+.5,ya+.5,L.x1-xa,yb-ya); ctx.setLineDash([]); ctx.fillStyle=z.dir<0?'#ff8a8e':'#7fd9b3'; ctx.font='10px "DM Mono"'; ctx.textAlign='left'; ctx.textBaseline='top'; ctx.fillText(z.dir<0?'FVG−':'FVG+',xa+4,ya+2); });
    [['hi','BSL',s.sw.hi],['lo','SSL',s.sw.lo]].forEach(([k,lab,w])=>{ if(!w) return; const y=Math.round(Y(w.p))+.5; ctx.strokeStyle=C.liq; ctx.setLineDash([5,4]); ctx.beginPath(); ctx.moveTo(X(w.i),y); ctx.lineTo(L.x1,y); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle=C.liq; ctx.font='10px "DM Mono"'; ctx.textAlign='left'; ctx.textBaseline=k==='hi'?'bottom':'top'; ctx.fillText(lab+' '+fmt(w.p,dec),X(w.i)+4,k==='hi'?y-2:y+2); });
  }
  { let mv=0; for(let i=L.i0;i<=L.i1;i++) mv=Math.max(mv,c[i].v||0); const vh=(L.y1-L.y0)*.15, bv=Math.max(1,Math.floor(S.ch.bw*.62)); for(let i=L.i0;i<=L.i1;i++){ const d=c[i], hh=(d.v||0)/(mv||1)*vh, x=Math.round(X(i)); ctx.fillStyle=d.c>=d.o?'rgba(63,182,139,.22)':'rgba(229,72,77,.22)'; ctx.fillRect(x-Math.floor(bv/2),L.y1-hh,bv,hh);} ctx.fillStyle='rgba(163,155,141,.7)'; ctx.font='10px "DM Mono"'; ctx.textAlign='left'; ctx.textBaseline='bottom'; ctx.fillText('VOL',6,L.y1-2); }
  const body=Math.max(1,Math.floor(S.ch.bw*.62));
  for(let i=L.i0;i<=L.i1;i++){ const d=c[i],x=Math.round(X(i)),col=d.c>=d.o?C.buy:C.sell; ctx.strokeStyle=col; ctx.fillStyle=col; ctx.beginPath(); ctx.moveTo(x+.5,Y(d.h)); ctx.lineTo(x+.5,Y(d.l)); ctx.stroke(); const yo=Y(d.o),yc=Y(d.c); ctx.shadowColor=col; ctx.shadowBlur=S.ch.bw>4?9:0; ctx.fillRect(x-Math.floor(body/2),Math.min(yo,yc),body,Math.max(1,Math.abs(yc-yo))); ctx.shadowBlur=0; }
  { const lc0=c[c.length-1], lx=X(c.length-1), ly=Y(lc0.c), pu=.5+.5*Math.sin(NOW/320), lcol=lc0.c>=lc0.o?C.buy:C.sell; ctx.save(); ctx.globalAlpha=.35+.35*pu; ctx.strokeStyle=lcol; ctx.setLineDash([2,4]); ctx.beginPath(); ctx.moveTo(0,ly); ctx.lineTo(L.x1,ly); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha=1; ctx.fillStyle=lcol; ctx.shadowColor=lcol; ctx.shadowBlur=18; ctx.beginPath(); ctx.arc(lx,ly,3.5,0,7); ctx.fill(); ctx.globalAlpha=.5*(1-pu); ctx.beginPath(); ctx.arc(lx,ly,4+10*pu,0,7); ctx.fill(); ctx.restore(); }
  const line=(arr,col)=>{ctx.strokeStyle=col;ctx.lineWidth=1.6;ctx.shadowColor=col;ctx.shadowBlur=10;ctx.beginPath();for(let i=L.i0;i<=L.i1;i++){const x=X(i),y=Y(arr[i]);i===L.i0?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.stroke();ctx.lineWidth=1;ctx.shadowBlur=0;};
  if(S.ch.show.ema20) line(s.ema20,C.gold); if(S.ch.show.ema50) line(s.ema50,C.liq);
  if(A&&S.ch.show.lv){ const xs=X(c.length-1)-S.ch.bw*8; ctx.fillStyle='rgba(212,175,106,.14)'; ctx.fillRect(xs,Y(A.hi),L.x1-xs,Y(A.lo)-Y(A.hi)); ctx.strokeStyle='rgba(212,175,106,.6)'; ctx.strokeRect(xs+.5,Y(A.hi)+.5,L.x1-xs,Y(A.lo)-Y(A.hi)); hl(A.sl,C.sell,xs,[]); A.tps.forEach(t=>hl(t,C.buy,xs,[5,4])); }
  getDrawings().forEach(d=>paint(d,false)); if(S.ch.draft) paint(S.ch.draft,true);
  (S.positions||[]).filter(p=>p.a===a).forEach(p=>{ const y=Math.round(Y(p.entry))+.5; ctx.save(); ctx.strokeStyle='#f4efe6'; ctx.setLineDash([6,4]); ctx.lineWidth=1.2; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(L.x1,y); ctx.stroke(); ctx.setLineDash([]); const st=posState(p); const txt=(p.sell?'بيع ':'شراء ')+(st.pnl>=0?'+$':'-$')+fmt(Math.abs(st.pnl),2); ctx.font='600 11px Tajawal, sans-serif'; const tw=ctx.measureText(txt).width+16; ctx.fillStyle=st.pnl>=0?'rgba(63,182,139,.92)':'rgba(229,72,77,.92)'; ctx.fillRect(8,y-11,tw,22); ctx.fillStyle='#fff'; ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText(txt,16,y); ctx.restore(); });
  ctx.restore();
  const lc=c[c.length-1]; tag(lc.c, lc.c>=lc.o?C.buy:C.sell, '#0a0a0b');
  if(A&&S.ch.show.lv){ tag(A.sl,C.sell,'#fff','SL'); tag(A.mid,C.gold,'#1a1408','IN'); A.tps.forEach((t,k)=>tag(t,C.buy,'#06140e','TP'+(k+1))); }
  getDrawings().filter(d=>d.type==='hline').forEach(d=>tag(d.p,d.color,'#0a0a0b'));
  if(S.ch.show.rsi){
    const t=L.rsiTop,b=L.rsiBot,ry=v=>t+(100-v)/100*(b-t);
    ctx.strokeStyle=C.line; ctx.beginPath(); ctx.moveTo(0,t-3+.5); ctx.lineTo(W,t-3+.5); ctx.stroke();
    ctx.fillStyle='rgba(180,140,255,.06)'; ctx.fillRect(0,ry(70),L.x1,ry(30)-ry(70));
    ctx.setLineDash([3,4]); ctx.strokeStyle='#3a3329'; [70,30].forEach(v=>{ctx.beginPath();ctx.moveTo(0,ry(v)+.5);ctx.lineTo(L.x1,ry(v)+.5);ctx.stroke();}); ctx.setLineDash([]);
    ctx.save(); ctx.beginPath(); ctx.rect(0,t,L.x1,b-t); ctx.clip(); ctx.strokeStyle=C.rsi; ctx.lineWidth=1.3; ctx.beginPath(); let st=false; for(let i=L.i0;i<=L.i1;i++){const v=s.rsi[i]; if(v==null) continue; const x=X(i),y=ry(v); st?ctx.lineTo(x,y):(ctx.moveTo(x,y),st=true);} ctx.stroke(); ctx.restore(); ctx.lineWidth=1;
    ctx.fillStyle=C.muted; ctx.font='10px "DM Mono"'; ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText('70',L.x1+8,ry(70)); ctx.fillText('30',L.x1+8,ry(30));
    const hi=S.ch.hover?Math.min(c.length-1,Math.max(0,Math.round(I(S.ch.hover.x)))):c.length-1; ctx.fillStyle=C.rsi; ctx.textBaseline='top'; ctx.fillText('RSI 14  '+(s.rsi[hi]==null?'—':s.rsi[hi].toFixed(1)),8,t+4);
  }
  if(S.ch.hover&&S.ch.tool!=='pen'){ const {x,y}=S.ch.hover; if(x<L.x1&&y<H-L.timeH){ ctx.strokeStyle='rgba(244,239,230,.35)'; ctx.setLineDash([4,4]); ctx.beginPath(); ctx.moveTo(x+.5,0); ctx.lineTo(x+.5,H-L.timeH); if(y<L.y1){ctx.moveTo(0,y+.5);ctx.lineTo(L.x1,y+.5);} ctx.stroke(); ctx.setLineDash([]); if(y<L.y1) tag(P(y),'#2a2620',C.ivory); const ir=Math.round(I(x)); if(c[ir]){ const tx=fmtT(c[ir].t); ctx.font='11px "DM Mono"'; const tw=ctx.measureText(tx).width+12; ctx.fillStyle='#2a2620'; ctx.fillRect(x-tw/2,H-L.timeH+1,tw,L.timeH-2); ctx.fillStyle=C.ivory; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(tx,x,H-L.timeH/2);} } }
  const i=S.ch.hover?Math.round(I(S.ch.hover.x)):c.length-1, d=c[Math.min(c.length-1,Math.max(0,i))];
  if(d){ const col=d.c>=d.o?C.buy:C.sell, ix=c.indexOf(d); $('ohlc').innerHTML=`<span>${ASSETS[a].sym} · ${S.tf}</span><span>O <b>${fmt(d.o,dec)}</b></span><span>H <b>${fmt(d.h,dec)}</b></span><span>L <b>${fmt(d.l,dec)}</b></span><span>C <b style="color:${col}">${fmt(d.c,dec)}</b></span>${S.ch.show.ema20?`<span style="color:#d4af6a">EMA20 ${fmt(s.ema20[ix],dec)}</span>`:''}`; }
}
function hl(p,col,xs,dash){const y=Math.round(Y(p))+.5;ctx.strokeStyle=col;ctx.lineWidth=1.3;ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(xs,y);ctx.lineTo(L.x1,y);ctx.stroke();ctx.setLineDash([]);ctx.lineWidth=1;}
function tag(p,bg,fg,label){ const y=Y(p); if(y<L.y0-10||y>L.y1+6) return; ctx.font='11px "DM Mono"'; let t=(label?label+' ':'')+fmt(p,ASSETS[S.asset].dec); ctx.fillStyle=bg; ctx.fillRect(L.x1+1,y-9,L.axisW-1,18); ctx.fillStyle=fg; ctx.textAlign='left'; ctx.textBaseline='middle'; while(ctx.measureText(t).width>L.axisW-8&&t.length>3) t=t.slice(0,-1); ctx.fillText(t,L.x1+5,y); }
function paint(d,draft){
  const dec=ASSETS[S.asset].dec; ctx.strokeStyle=d.color; ctx.fillStyle=d.color; ctx.lineWidth=1.8; ctx.setLineDash(draft?[6,4]:[]);
  const dot=(x,y)=>{ctx.beginPath();ctx.arc(x,y,3.5,0,7);ctx.fill();};
  if(d.type==='trend'||d.type==='ray'){ const x1=X(d.a.i),y1=Y(d.a.p); let x2=X(d.b.i),y2=Y(d.b.p); if(d.type==='ray'&&x2!==x1){ const k=(y2-y1)/(x2-x1), xe=x2>x1?L.x1:0; y2=y1+k*(xe-x1); x2=xe; } ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke(); dot(x1,y1); if(d.type==='trend') dot(x2,y2); }
  else if(d.type==='hline'){ const y=Y(d.p); ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(L.x1,y); ctx.stroke(); }
  else if(d.type==='channel'){ const x1=X(d.a.i),y1=Y(d.a.p),x2=X(d.b.i),y2=Y(d.b.p), off=d.off!=null? (Y(d.a.p+d.off)-y1) : 0; ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.moveTo(x1,y1+off);ctx.lineTo(x2,y2+off);ctx.stroke(); ctx.globalAlpha=.1; ctx.beginPath(); ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.lineTo(x2,y2+off);ctx.lineTo(x1,y1+off);ctx.closePath();ctx.fill(); ctx.globalAlpha=1; ctx.setLineDash([3,4]); ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(x1,y1+off/2); ctx.lineTo(x2,y2+off/2); ctx.stroke(); }
  else if(d.type==='rect'){ const x1=X(d.a.i),y1=Y(d.a.p),x2=X(d.b.i),y2=Y(d.b.p); ctx.globalAlpha=.16; ctx.fillRect(Math.min(x1,x2),Math.min(y1,y2),Math.abs(x2-x1),Math.abs(y2-y1)); ctx.globalAlpha=1; ctx.strokeRect(Math.min(x1,x2),Math.min(y1,y2),Math.abs(x2-x1),Math.abs(y2-y1)); }
  else if(d.type==='fib'){ const x1=X(d.a.i),x2=X(d.b.i),xl=Math.min(x1,x2),xr=Math.max(x1,x2)+60; ctx.lineWidth=1; ctx.font='10px "DM Mono"'; ctx.textAlign='left'; ctx.textBaseline='bottom'; FIBS.forEach(f=>{const p=d.b.p+(d.a.p-d.b.p)*f,y=Y(p); ctx.globalAlpha=(f===.618||f===.5)?1:.65; ctx.beginPath();ctx.moveTo(xl,y);ctx.lineTo(xr,y);ctx.stroke(); ctx.fillText(f.toFixed(3)+'  '+fmt(p,dec),xl+3,y-2);}); ctx.globalAlpha=1; }
  else if(d.type==='long'||d.type==='short'){ const lg=d.type==='long', x1=X(d.a.i), x2=Math.max(X(d.b.i),x1+40), ye=Y(d.a.p), risk=Math.abs(d.b.p-d.a.p), tp=d.a.p+(lg?1:-1)*risk*2, ys=Y(d.a.p+(lg?-1:1)*risk), yt=Y(tp);
    ctx.globalAlpha=.18; ctx.fillStyle=C.buy; ctx.fillRect(x1,Math.min(ye,yt),x2-x1,Math.abs(yt-ye)); ctx.fillStyle=C.sell; ctx.fillRect(x1,Math.min(ye,ys),x2-x1,Math.abs(ys-ye)); ctx.globalAlpha=1;
    ctx.strokeStyle=C.gold; ctx.beginPath(); ctx.moveTo(x1,ye); ctx.lineTo(x2,ye); ctx.stroke();
    ctx.font='10.5px "DM Mono"'; ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillStyle=C.ivory; ctx.fillText('TP '+fmt(tp,dec)+'  2.0R',x1+5,(ye+yt)/2); ctx.fillText('SL '+fmt(d.a.p+(lg?-1:1)*risk,dec),x1+5,(ye+ys)/2); }
  else if(d.type==='text'){ ctx.font='600 14px Tajawal, sans-serif'; ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.direction='rtl'; ctx.fillText(d.text,X(d.a.i),Y(d.a.p)); ctx.direction='ltr'; }
  else if(d.type==='pen'){ ctx.lineJoin='round'; ctx.lineCap='round'; ctx.beginPath(); d.pts.forEach((q,k)=>{const x=X(q.i),y=Y(q.p); k?ctx.lineTo(x,y):ctx.moveTo(x,y);}); ctx.stroke(); }
  else if(d.type==='measure'){ const x1=X(d.a.i),y1=Y(d.a.p),x2=X(d.b.i),y2=Y(d.b.p),up=d.b.p>=d.a.p,col=up?C.buy:C.sell; ctx.fillStyle=up?'rgba(63,182,139,.14)':'rgba(229,72,77,.14)'; ctx.fillRect(Math.min(x1,x2),Math.min(y1,y2),Math.abs(x2-x1),Math.abs(y2-y1)); ctx.strokeStyle=col; ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); const df=d.b.p-d.a.p, pc=df/d.a.p*100, bars=Math.abs(Math.round(d.b.i-d.a.i)); const txt=(df>=0?'+':'')+fmt(df,dec)+'  ('+(pc>=0?'+':'')+pc.toFixed(2)+'%)  '+bars+' bars'; ctx.font='11px "DM Mono"'; const tw=ctx.measureText(txt).width+14,bx=(x1+x2)/2-tw/2,by=Math.min(y1,y2)-26; ctx.fillStyle='#0a0a0b'; ctx.fillRect(bx,by,tw,20); ctx.setLineDash([]); ctx.strokeRect(bx+.5,by+.5,tw,20); ctx.fillStyle=col; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(txt,(x1+x2)/2,by+10); }
  ctx.setLineDash([]); ctx.lineWidth=1;
}
function segD(px,py,x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1,l=dx*dx+dy*dy;let t=l?((px-x1)*dx+(py-y1)*dy)/l:0;t=Math.max(0,Math.min(1,t));return Math.hypot(px-(x1+t*dx),py-(y1+t*dy));}
function hit(x,y){ let best=-1,bd=10; getDrawings().forEach((d,k)=>{ let dist=1e9;
  if(d.type==='hline') dist=Math.abs(Y(d.p)-y);
  else if(d.type==='text') dist=Math.hypot(x-X(d.a.i)-20,y-Y(d.a.p))-20;
  else if(d.pts){ for(let j=1;j<d.pts.length;j++) dist=Math.min(dist,segD(x,y,X(d.pts[j-1].i),Y(d.pts[j-1].p),X(d.pts[j].i),Y(d.pts[j].p))); }
  else if(d.a&&d.b){ const x1=Math.min(X(d.a.i),X(d.b.i)),x2=Math.max(X(d.a.i),X(d.b.i))+(d.type==='fib'?60:0),y1=Math.min(Y(d.a.p),Y(d.b.p)),y2=Math.max(Y(d.a.p),Y(d.b.p)); if(['trend','ray','channel'].includes(d.type)) dist=segD(x,y,X(d.a.i),Y(d.a.p),X(d.b.i),Y(d.b.p)); else dist=(x>=x1&&x<=x2&&y>=y1-30&&y<=y2+30)?0:1e9; }
  if(dist<bd){bd=dist;best=k;} }); return best; }
function commit(d){ const D=getDrawings(); delete d.sx; delete d.sy; delete d.pending; delete d.stage2; D.push(d); setDrawings(D); S.ch.draft=null; hideHint(); if(S.ch.panelTab==='draw') renderPanel(); chartDraw(); }
function zoomAt(x,nbw){ const i=I(x); S.ch.bw=Math.max(2.5,Math.min(40,nbw)); S.ch.right=i+(L.x1-x-S.ch.bw/2)/S.ch.bw; chartDraw(); }
function placeText(q){
  const st=$('stage'), inp=document.createElement('input'); inp.className='textin'; inp.style.left=Math.min(q.x,W-160)+'px'; inp.style.top=(q.y-17)+'px'; inp.setAttribute('aria-label','نص على الشارت'); inp.placeholder='اكتب ثم Enter';
  st.appendChild(inp); inp.focus(); const pt=toData(q.x,q.y,false);
  const done=ok=>{ const v=inp.value.trim(); inp.remove(); if(ok&&v) commit({type:'text',a:pt,text:v.slice(0,60),color:S.ch.color}); };
  inp.addEventListener('keydown',e=>{ e.stopPropagation(); if(e.key==='Enter') done(true); if(e.key==='Escape') done(false); });
  inp.addEventListener('blur',()=>done(true));
}
function bindPointer(){
  const pos=e=>{const r=cv.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
  cv.addEventListener('pointerdown',e=>{
    const q=pos(e); cv.setPointerCapture(e.pointerId); S.ch.pointers.set(e.pointerId,q);
    if(S.ch.pointers.size===2){ const [a,b]=[...S.ch.pointers.values()]; S.ch.pinch={d:Math.hypot(a.x-b.x,a.y-b.y),bw:S.ch.bw}; S.ch.pan=null; S.ch.draft=null; return; }
    const t=S.ch.tool;
    if(q.x>L.x1||q.y>L.y1||t==='cursor'){ S.ch.pan={x:q.x,right:S.ch.right}; if(t==='cursor') cv.style.cursor='grabbing'; return; }
    if(t==='eraser'){ const k=hit(q.x,q.y); if(k>=0){ const D=getDrawings(); D.splice(k,1); setDrawings(D); if(S.ch.panelTab==='draw') renderPanel(); chartDraw(); } return; }
    if(t==='hline'){ commit({type:'hline',p:toData(q.x,q.y,true).p,color:S.ch.color}); return; }
    if(t==='text'){ placeText(q); return; }
    if(t==='pen'){ S.ch.draft={type:'pen',pts:[toData(q.x,q.y,false)],color:S.ch.color}; S.ch.dragging=true; return; }
    const d=toData(q.x,q.y,true), dr=S.ch.draft;
    if(dr && dr.stage2){ commit(dr); return; }
    if(dr && dr.pending){ dr.b=d; if(dr.type==='channel'){ dr.pending=false; dr.stage2=true; dr.off=0; hint('حرّك لتحديد عرض القناة ثم اضغط'); chartDraw(); return; } commit(dr); return; }
    S.ch.draft={type:t,a:d,b:{...d},color:S.ch.color,sx:q.x,sy:q.y}; S.ch.dragging=true;
  });
  cv.addEventListener('pointermove',e=>{
    const q=pos(e); if(S.ch.pointers.has(e.pointerId)) S.ch.pointers.set(e.pointerId,q);
    if(S.ch.pinch&&S.ch.pointers.size===2){ const [a,b]=[...S.ch.pointers.values()]; zoomAt((a.x+b.x)/2,S.ch.pinch.bw*Math.hypot(a.x-b.x,a.y-b.y)/S.ch.pinch.d); return; }
    S.ch.hover={x:q.x,y:q.y};
    if(S.ch.pan){ S.ch.right=S.ch.pan.right-(q.x-S.ch.pan.x)/S.ch.bw; chartDraw(); return; }
    const dr=S.ch.draft;
    if(dr){ if(dr.type==='pen'){ if(S.ch.dragging) dr.pts.push(toData(q.x,q.y,false)); } else if(dr.stage2){ const p=P(q.y), i=I(q.x); const t=(i-dr.a.i)/((dr.b.i-dr.a.i)||1); const base=dr.a.p+(dr.b.p-dr.a.p)*t; dr.off=p-base; } else dr.b=toData(q.x,q.y,true); }
    chartDraw();
  });
  const up=e=>{
    S.ch.pointers.delete(e.pointerId); if(S.ch.pointers.size<2) S.ch.pinch=null; const q=pos(e);
    if(S.ch.pan){ S.ch.pan=null; cv.style.cursor=S.ch.tool==='cursor'?'grab':'crosshair'; return; }
    const dr=S.ch.draft;
    if(dr&&S.ch.dragging){ S.ch.dragging=false;
      if(dr.type==='pen'){ dr.pts.length>1?commit(dr):(S.ch.draft=null); return; }
      if(Math.hypot(q.x-dr.sx,q.y-dr.sy)<6){ dr.pending=true; hint('اضغط النقطة الثانية لإكمال '+NAMES[dr.type]); }
      else if(dr.type==='channel'){ dr.stage2=true; dr.off=0; hint('حرّك لتحديد عرض القناة ثم اضغط'); }
      else commit(dr);
    }
  };
  cv.addEventListener('pointerup',up); cv.addEventListener('pointercancel',up);
  cv.addEventListener('pointerleave',()=>{ S.ch.hover=null; chartDraw(); });
  cv.addEventListener('wheel',e=>{ e.preventDefault(); const q=pos(e); zoomAt(q.x,S.ch.bw*(e.deltaY<0?1.12:1/1.12)); },{passive:false});
}

/* ---------- trades view ---------- */
const JOURNAL=[];
function journalStats(){ const n=JOURNAL.length, w=JOURNAL.filter(j=>j.r>0).length, r=JOURNAL.reduce((s,j)=>s+j.r,0); return {n, win:n?Math.round(w/n*100):0, r, avgW:JOURNAL.filter(j=>j.r>0).reduce((s,j)=>s+j.r,0)/(w||1)}; }
VIEWS.trades = function(){
  const tab=S.tradesTab, a=S.asset;
  let body='';
  if(tab==='orders'){
    const O=pendingOrders(a);
    body=`<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="label">الأصل:</span>${Object.keys(ASSETS).map(k=>`<button class="chip" data-oa="${k}" aria-pressed="${k===a}">${ASSETS[k].name}</button>`).join('')}</div>
    <p class="label" style="margin:0">مناطق فجوات سعرية غير مُغلقة على <span class="ltr">15m</span>، مرتبة حسب القوة. السعر الآن <b class="num ltr gold" data-live="${a}">${fp(a,last(a))}</b></p>
    <div class="grid g-2">${O.map(o=>{ const sz=sizeFor(a,o.entry,o.sl); return `
      <article class="card lux ${o.sell?'sell':'buy'} order">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
          <div><b style="font-family:var(--f-display);font-size:20px;color:${o.sell?C.sell:C.buy}">${o.sell?'بيع معلّق':'شراء معلّق'}</b> <span class="label num ltr">${o.sell?'Sell Limit':'Buy Limit'}</span><div style="font-size:12px;margin-top:2px" class="${o.withTrend?'up':'gold'}">${o.withTrend?'مع الاتجاه الرئيسي':'عكس الاتجاه · بحذر'}</div></div>
          <div style="text-align:center"><b class="num" style="font-weight:500;font-size:20px">${o.strength}%</b><div class="label" style="font-size:10.5px">قوة المنطقة</div></div>
        </div>
        <div class="bar5"><i style="width:${o.strength}%;background:${o.strength>85?C.buy:C.gold}"></i></div>
        <div class="zone"><span class="mut">منطقة الدخول</span><b class="num ltr gold" style="font-weight:500">${fp(a,o.lo)} – ${fp(a,o.hi)}</b></div>
        <div class="kv3"><div>الدخول<b class="gold">${fp(a,o.entry)}</b></div><div>الوقف<b class="dn">${fp(a,o.sl)}</b></div><div>العائد<b>1 : ${o.rr.toFixed(1)}</b></div></div>
        <div class="label num ltr" style="margin-top:10px;text-align:right;color:${C.buy}">TP ${o.tps.map(t=>fp(a,t)).join(' · ')}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap">
          <span class="label">يبعد <b class="num ltr" style="color:var(--ivory);font-weight:500">${fp(a,o.dist)}</b> · الحجم <b class="num ltr" style="color:var(--ivory);font-weight:500">${fmt(sz.units,sz.units<10?3:1)}</b></span>
          <span style="display:flex;gap:6px"><button class="btn ghost sm" data-ocopy='${JSON.stringify({s:o.sell,e:o.entry,sl:o.sl,tp:o.tps})}'>نسخ</button><button class="btn sm" data-oalert="${o.entry}" data-osell="${o.sell}">تنبيه</button></span>
        </div>
      </article>`;}).join('') || '<p class="empty">لا توجد مناطق قوية قريبة الآن على هذا الأصل.</p>'}</div>`;
  } else if(tab==='journal'){
    const J=journalStats();
    body=`<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      <div class="card pad"><div class="label">نسبة النجاح</div><b class="num" style="font-size:26px;font-weight:500">${J.win}%</b></div>
      <div class="card pad"><div class="label">صافي العائد</div><b class="num ltr ${J.r>=0?'up':'dn'}" style="font-size:26px;font-weight:500;display:block;text-align:right">${(J.r>=0?'+':'')+J.r.toFixed(1)}R</b></div>
      <div class="card pad"><div class="label">متوسط الربح</div><b class="num ltr" style="font-size:26px;font-weight:500;display:block;text-align:right">${J.avgW.toFixed(1)}R</b></div>
      <div class="card pad"><div class="label">الصفقات</div><b class="num" style="font-size:26px;font-weight:500">${J.n}</b></div>
    </div>
    <section class="card pad"><div class="h"><h2>منحنى الأداء</h2><span class="label">بالـ R</span></div>${equitySVG()}</section>
    <section class="card" style="overflow-x:auto"><table class="mtable"><thead><tr><th>الأصل</th><th>الاتجاه</th><th>الإطار</th><th>منذ</th><th>النتيجة</th></tr></thead><tbody>${JOURNAL.map(j=>`<tr><td><b>${ASSETS[j.a].name}</b></td><td class="${j.sell?'dn':'up'}">${j.sell?'بيع':'شراء'}</td><td class="num ltr">${j.tf}</td><td class="mut">${j.d} ${j.d>2&&j.d<11?'أيام':'يوم'}</td><td><b class="num ltr ${j.r>0?'up':'dn'}" style="font-weight:500">${(j.r>0?'+':'')+j.r}R</b></td></tr>`).join('')}</tbody></table></section>
    <p class="note">كل إشارة يرصدها التطبيق تُسجَّل تلقائياً وتُغلق عند الوقف أو الهدف الأول، ومعها صفقاتك التجريبية.</p>`;
  } else {
    const A=planOf(a,S.tf);
    const e0 = A? A.mid : last(a), s0 = A? A.sl : last(a)*(1-.003);
    body=`<div class="grid g-2">
      <section class="card pad"><div class="h"><h2>حاسبة حجم الصفقة</h2></div>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">
          <label class="field">رصيد الحساب ($)<input id="cb" type="number" inputmode="decimal" value="${S.prefs.balance}"></label>
          <label class="field">نسبة المخاطرة (%)<input id="cr" type="number" step="0.1" inputmode="decimal" value="${S.prefs.risk}"></label>
          <label class="field">سعر الدخول<input id="ce" type="number" step="any" inputmode="decimal" value="${(+e0).toFixed(ASSETS[a].dec)}"></label>
          <label class="field">وقف الخسارة<input id="cs" type="number" step="any" inputmode="decimal" value="${(+s0).toFixed(ASSETS[a].dec)}"></label>
          <label class="field" style="grid-column:1/-1">الأصل<select id="ca">${Object.keys(ASSETS).map(k=>`<option value="${k}" ${k===a?'selected':''}>${ASSETS[k].name} · ${ASSETS[k].sym}</option>`).join('')}</select></label>
        </div>
        <p class="note" style="margin-top:10px">${A?'القيم معبأة من آخر تحليل.':'شغّل التحليل لتعبئة الدخول والوقف تلقائياً.'}</p>
      </section>
      <section class="card lux pad"><div class="h"><h2>النتيجة</h2></div><div class="calc-out" id="cout"></div></section>
    </div>`;
  }
  return `<div class="tabs" role="tablist" aria-label="الصفقات">${[['orders','الأوامر المعلقة'],['journal','سجل الصفقات'],['calc','حاسبة المخاطرة']].map(([k,n])=>`<button role="tab" data-tt="${k}" aria-selected="${tab===k}">${n}</button>`).join('')}</div>${body}`;
};
function equitySVG(){ if(!JOURNAL.length) return '<p class="empty" style="padding:14px 0">لا توجد صفقات مغلقة بعد. كل إشارة يرصدها التطبيق تُسجَّل هنا تلقائياً.</p>'; let acc=0; const pts=[0,...JOURNAL.slice().reverse().map(j=>acc+=j.r)]; const w=600,h=140,lo=Math.min(0,...pts),hi=Math.max(...pts); const xy=pts.map((v,i)=>[(i/(pts.length-1))*(w-40)+30, h-16-(v-lo)/(hi-lo||1)*(h-30)]);
  const zy=h-16-(0-lo)/(hi-lo||1)*(h-30);
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="منحنى الأداء" style="display:block;direction:ltr"><line x1="30" y1="${zy}" x2="${w-10}" y2="${zy}" stroke="#2a2620" stroke-dasharray="3 4"/><text x="24" y="${zy+4}" text-anchor="end" font-family="DM Mono" font-size="10" fill="#a39b8d">0R</text><text x="24" y="${xy.reduce((m,p)=>Math.min(m,p[1]),h)+4}" text-anchor="end" font-family="DM Mono" font-size="10" fill="#a39b8d">${hi.toFixed(1)}R</text><polyline points="${xy.map(p=>p.join(',')).join(' ')}" fill="none" stroke="#d4af6a" stroke-width="2"/><polyline points="30,${zy} ${xy.map(p=>p.join(',')).join(' ')} ${w-10},${zy}" fill="#d4af6a" opacity=".08"/>${xy.map((p,i)=>i?`<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${pts[i]>=pts[i-1]?C.buy:C.sell}"/>`:'').join('')}</svg>`; }
AFTER.trades = function(){
  const v=$('view');
  v.querySelectorAll('[data-tt]').forEach(b=>b.onclick=()=>{ S.tradesTab=b.dataset.tt; render(); });
  v.querySelectorAll('[data-oa]').forEach(b=>b.onclick=()=>{ S.asset=b.dataset.oa; render(); });
  v.querySelectorAll('[data-oalert]').forEach(b=>b.onclick=()=>{ const p=+b.dataset.oalert, sell=b.dataset.osell==='true'; addAlert(S.asset, sell?'above':'below', p, sell?'بيع معلّق':'شراء معلّق'); });
  v.querySelectorAll('[data-ocopy]').forEach(b=>b.onclick=()=>{ const o=JSON.parse(b.dataset.ocopy), a=S.asset; const txt=`${ASSETS[a].sym} ${o.s?'SELL LIMIT':'BUY LIMIT'} ${fp(a,o.e)}\nSL ${fp(a,o.sl)}\nTP ${o.tp.map(t=>fp(a,t)).join(' / ')}`; (navigator.clipboard?navigator.clipboard.writeText(txt):Promise.reject()).then(()=>toast('تم النسخ','الأمر المعلّق في الحافظة'),()=>toast('تعذّر النسخ','انسخ القيم يدوياً')); });
  if(S.tradesTab==='calc'){ const upd=()=>{ const b=+$('cb').value||0, r=+$('cr').value||0, e=+$('ce').value, s=+$('cs').value, a=$('ca').value, dist=Math.abs(e-s), amt=b*r/100, units=dist?amt/dist:0, sell=s>e;
      const tps=[1.5,2.5,4].map(k=>e+(sell?-1:1)*k*dist);
      $('cout').innerHTML=`<div><span class="label">مبلغ المخاطرة</span><b>$${fmt(amt,2)}</b></div><div><span class="label">مسافة الوقف</span><b>${fmt(dist,ASSETS[a].dec)}</b></div><div><span class="label">حجم الصفقة (وحدات)</span><b class="gold">${fmt(units,units<10?4:2)}</b></div><div><span class="label">قيمة المركز</span><b>$${fmt(units*e,0)}</b></div>${tps.map((t,k)=>`<div><span class="label">الهدف ${k+1} · ${[1.5,2.5,4][k]}R</span><b class="up">${fmt(t,ASSETS[a].dec)}</b><span class="label num">+$${fmt(amt*[1.5,2.5,4][k],0)}</span></div>`).join('')}<div><span class="label">الاتجاه</span><b class="${sell?'dn':'up'}" style="font-family:var(--f-body)">${dist?(sell?'بيع':'شراء'):'—'}</b></div>`; };
    ['cb','cr','ce','cs','ca'].forEach(id=>$(id).addEventListener('input',upd)); upd(); }
};

/* ---------- agenda ---------- */
const EVENTS=[]; S.newsState='loading';
async function loadNews(){
  try{
    const r=await fetch('/api/news',{cache:'no-store',credentials:'same-origin'}); const j=await r.json(); if(!r.ok) throw new Error('news');
    const d0=new Date(); d0.setHours(0,0,0,0); EVENTS.length=0;
    (j.calendar||[]).forEach(e=>{ const t=Date.parse(e.time); if(!isFinite(t)) return; const d=new Date(t), dd=new Date(t); dd.setHours(0,0,0,0);
      const day=Math.round((dd-d0)/864e5); if(day<0||day>2) return;
      const im=String(e.impact||''), imp=/high|3/.test(im)?3:/med|2/.test(im)?2:1;
      EVENTS.push({t, day, h:d.getUTCHours()+d.getUTCMinutes()/60, n:String(e.event||''), cur:String(e.country||''), imp, f:e.forecast!=null&&e.forecast!==''?String(e.forecast):'—', p:e.previous!=null&&e.previous!==''?String(e.previous):'—'}); });
    EVENTS.sort((x,y)=>x.t-y.t); S.newsState='ok';
  }catch(e){ S.newsState='err'; }
  if(S.route==='agenda') render();
}
VIEWS.agenda = function(){
  const days=[...Array(3)].map((_,k)=>{const d=new Date(); d.setDate(d.getDate()+k); return d;});
  const names=['أحد','اثنين','ثلاثاء','أربعاء','خميس','جمعة','سبت'];
  const s=sessNow(), nowPct=s.h/24*100;
  const ev=EVENTS.filter(e=>e.day===S.agendaDay);
  const ht=h=>{const d=new Date(); d.setUTCHours(Math.floor(h),Math.round((h%1)*60),0,0); let hh=d.getHours(); const mm=String(d.getMinutes()).padStart(2,'0'); if(S.prefs.clock===12){const ap=hh>=12?'م':'ص'; hh=hh%12||12; return hh+':'+mm+' '+ap;} return String(hh).padStart(2,'0')+':'+mm;};
  return `
  <div class="days" role="group" aria-label="اليوم">${days.map((d,k)=>`<button data-day="${k}" aria-pressed="${S.agendaDay===k}">${k===0?'اليوم':names[d.getDay()]}<br><b class="num" style="font-weight:500">${d.getDate()}</b></button>`).join('')}</div>
  <section class="card pad" aria-label="الجلسات">
    <div class="h"><h2>الجلسات بتوقيت <span class="num">UTC</span></h2><span class="gold" style="font-size:13px">${s.kill?s.kill.n+' الآن':'لا كيل زون الآن'}</span></div>
    <div class="timeline ltr">
      ${SESS.map((x,k)=>{ const segs = x.s<x.e ? [[x.s,x.e]] : [[x.s,24],[0,x.e]]; const on=inSess(s.h,x); return `<div class="tl-row" style="top:${k*28}px">${segs.map(([a,b])=>`<div class="tl-bar" style="left:${a/24*100}%;width:${(b-a)/24*100}%;background:${on?(x.n==='نيويورك'?C.gold:C.buy):'#2a2620'}"></div>`).join('')}<span class="tl-lab" style="left:${segs[0][0]/24*100}%;color:${on?C.ivory:C.muted}">${x.n}</span></div>`; }).join('')}
      ${S.agendaDay===0?`<div class="tl-now" style="left:${nowPct}%" title="الآن"></div>`:''}
    </div>
    <div class="label num ltr" style="display:flex;justify-content:space-between;margin-top:4px"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
  </section>
  <section class="card" aria-label="الأخبار">
    <ul class="list">${ev.map(e=>`<li style="display:grid;grid-template-columns:76px 1fr auto;gap:12px;align-items:center;padding:14px 18px">
      <span class="num mut" style="font-size:13px">${ht(e.h)}</span>
      <span><b style="font-size:14.5px">${esc(e.n)}</b><br><span class="label"><span class="num">${esc(e.cur)}</span> · المتوقع ${esc(e.f)} · السابق ${esc(e.p)}</span></span>
      <span class="impact" role="img" aria-label="تأثير ${e.imp===3?'عالٍ':e.imp===2?'متوسط':'منخفض'}">${[1,2,3].map(i=>`<i style="background:${i<=e.imp?(e.imp===3?C.sell:C.gold):''}"></i>`).join('')}</span></li>`).join('') || `<li><p class="empty" style="padding:16px">${S.newsState==='loading'?'جارٍ تحميل الأجندة…':S.newsState==='err'?'تعذّر تحميل الأجندة الآن.':'لا أخبار مهمة في هذا اليوم.'}</p></li>`}</ul>
  </section>
  <p class="note">الجلسات محسوبة من ساعتك. الأخبار من الأجندة الاقتصادية بتوقيتك المحلي.</p>`;
};
AFTER.agenda = function(){ $('view').querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{ S.agendaDay=+b.dataset.day; render(); }); };

/* ---------- alerts ---------- */
function alertTitle(x){ if(x.type==='price' && !ASSETS[x.asset]) return 'تنبيه سعر'; if(x.type==='price') return `${ASSETS[x.asset].name} ${x.cond==='above'?'فوق':'تحت'} <span class="num ltr">${fp(x.asset,x.p)}</span>`; if(x.type==='signal') return 'إشارة مؤكدة بثقة '+S.prefs.minConf+'% فأكثر (كل الأسواق والأطر)'; return 'خبر عالي التأثير'; }
function addAlert(asset,cond,p,note){ const id=Date.now(); S.alerts.unshift({id,asset,type:'price',cond,p,on:true,note:note||''}); saveAlerts(); toast('تم إنشاء التنبيه', ASSETS[asset].name+' '+(cond==='above'?'فوق ':'تحت ')+fp(asset,p)); const b=$('alertBadge'); if(b){ const n=S.alerts.filter(a=>a.on).length; b.textContent=n; b.hidden=!n; } if(S.route==='alerts') render(); }
VIEWS.alerts = function(){
  const tab=S.alertsTab;
  const list = tab==='active' ? `<ul class="list">${S.alerts.map(x=>`<li style="display:grid;grid-template-columns:40px 1fr auto auto;gap:12px;align-items:center;padding:14px 18px">
      <span style="width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:${x.type==='price'?'rgba(212,175,106,.12)':x.type==='signal'?'rgba(63,182,139,.12)':'rgba(229,72,77,.12)'};color:${x.type==='price'?C.gold:x.type==='signal'?C.buy:C.sell}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${x.type==='price'?'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>':x.type==='signal'?'<path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/>':'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/>'}</svg></span>
      <span><b style="font-size:14.5px">${alertTitle(x)}</b><br><span class="label">${x.note?esc(x.note):(x.type==='price'?'السعر الآن '+fp(x.asset,last(x.asset)):'')}</span></span>
      <button class="switch" role="switch" aria-checked="${x.on}" data-tog="${x.id}" aria-label="تشغيل التنبيه"></button>
      <button class="mini" data-rm="${x.id}" aria-label="حذف التنبيه">×</button></li>`).join('') || '<li><p class="empty" style="padding:16px">لا توجد تنبيهات.</p></li>'}</ul>`
    : `<ul class="list">${S.history.filter(h=>h.title||ASSETS[h.asset]).map(h=>`<li style="display:flex;justify-content:space-between;gap:12px;padding:14px 18px"><span>${h.title?`<b class="${h.kind==='sell'?'dn':h.kind==='buy'?'up':''}">${esc(h.title)}</b><br><span class="label">${esc(h.body||'')}</span>`:`<b>${ASSETS[h.asset].name}</b> ${h.cond==='above'?'تجاوز':'نزل تحت'} <span class="num ltr">${fp(h.asset,h.p)}</span><br><span class="label">${h.note?esc(h.note):''}</span>`}</span><span class="label num">${new Date(h.at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</span></li>`).join('') || '<li><p class="empty" style="padding:16px">لم يصل أي تنبيه بعد. التنبيهات تعمل مع حركة السعر الحية.</p></li>'}</ul>`;
  return `<div class="grid g-2" style="align-items:start">
    <section style="display:flex;flex-direction:column;gap:12px;min-width:0">
      <div class="tabs" role="tablist" aria-label="التنبيهات">${[['active','النشطة ('+S.alerts.filter(a=>a.on).length+')'],['history','السجل ('+S.history.length+')']].map(([k,n])=>`<button role="tab" data-at="${k}" aria-selected="${tab===k}">${n}</button>`).join('')}</div>
      <div class="card">${list}</div>
    </section>
    <section class="card lux pad" aria-label="تنبيه جديد">
      <div class="h"><h2>تنبيه سعر جديد</h2></div>
      <form id="af" class="grid" style="gap:12px">
        <label class="field">الأصل<select id="aa">${Object.keys(ASSETS).map(k=>`<option value="${k}" ${k===S.asset?'selected':''}>${ASSETS[k].name}</option>`).join('')}</select></label>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">
          <label class="field">الشرط<select id="ac"><option value="above">السعر يتجاوز</option><option value="below">السعر ينزل تحت</option></select></label>
          <label class="field">السعر<input id="ap" type="number" step="any" inputmode="decimal" required value="${(+last(S.asset)).toFixed(ASSETS[S.asset].dec)}"></label>
        </div>
        <label class="field">ملاحظة (اختياري)<input id="an" maxlength="60" placeholder="مثلاً: قاع جلسة آسيا"></label>
        <button class="btn" type="submit">إنشاء التنبيه</button>
        <p class="note">يمكنك أيضاً تحويل أي خط أفقي على الشارت إلى تنبيه من تبويب «رسوماتي».</p>
      </form>
    </section>
  </div>`;
};
AFTER.alerts = function(){
  const v=$('view');
  v.querySelectorAll('[data-at]').forEach(b=>b.onclick=()=>{ S.alertsTab=b.dataset.at; render(); });
  v.querySelectorAll('[data-tog]').forEach(b=>b.onclick=()=>{ const x=S.alerts.find(a=>a.id==b.dataset.tog); x.on=!x.on; saveAlerts(); render(); });
  v.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{ S.alerts=S.alerts.filter(a=>a.id!=b.dataset.rm); saveAlerts(); render(); });
  $('aa').onchange=e=>{ $('ap').value=(+last(e.target.value)).toFixed(ASSETS[e.target.value].dec); };
  $('af').onsubmit=e=>{ e.preventDefault(); const p=parseFloat($('ap').value); if(!isFinite(p)) return; addAlert($('aa').value,$('ac').value,p,$('an').value.trim()); render(); };
};

/* ---------- prefs ---------- */
VIEWS.prefs = function(){
  const P=S.prefs, sc=[['ict','ICT + SMC'],['snr','الدعم والمقاومة'],['pa','حركة السعر'],['wyc','وايكوف'],['elw','إليوت وفيبوناتشي']];
  return `<div class="grid g-2" style="align-items:start">
    <section class="card lux pad"><div class="h"><h2>الحساب والمخاطرة</h2></div>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">
        <label class="field">رصيد الحساب ($)<input id="p-bal" type="number" inputmode="decimal" value="${P.balance}"></label>
        <label class="field">المخاطرة لكل صفقة (%)<input id="p-risk" type="number" step="0.1" inputmode="decimal" value="${P.risk}"></label>
        <label class="field">إطار الدخول الافتراضي<select id="p-tf">${Object.keys(TFS).map(t=>`<option ${t===P.tf?'selected':''}>${t}</option>`).join('')}</select></label>
        <label class="field">أقل ثقة لتنبيه الإشارة (%)<input id="p-min" type="number" min="50" max="95" value="${P.minConf}"></label>
      </div>
    </section>
    <section class="card pad"><div class="h"><h2>المدارس في التحليل</h2><span class="label">${Object.values(P.schools).filter(Boolean).length} من 5</span></div>
      ${sc.map(([k,n],i)=>`<div class="setrow" style="${i?'border-top:1px solid var(--line2)':''}"><span>${n}</span><button class="switch" role="switch" aria-checked="${P.schools[k]}" data-school="${k}" aria-label="${n}"></button></div>`).join('')}
    </section>
    <section class="card pad"><div class="h"><h2>العرض والإشعارات</h2></div>
      <div class="setrow"><span>نظام الوقت</span><div class="seg"><button data-clock="12" aria-pressed="${P.clock===12}">12h</button><button data-clock="24" aria-pressed="${P.clock===24}">24h</button></div></div>
      <div class="setrow" style="border-top:1px solid var(--line2)"><span>إشعارات الهاتف</span><button class="switch" role="switch" aria-checked="${P.push && 'Notification' in window && Notification.permission==='granted'}" data-flag="push" aria-label="إشعارات الهاتف"></button></div>
      <div class="setrow" style="border-top:1px solid var(--line2)"><span>صوت التنبيه</span><button class="switch" role="switch" aria-checked="${P.sound}" data-flag="sound" aria-label="صوت التنبيه"></button></div>
    </section>
    <section class="card pad"><div class="h"><h2>البيانات</h2></div>
      <div class="setrow"><span>مسح كل الرسومات من الشارت</span><button class="btn ghost sm" id="p-cleard">مسح</button></div>
      <div class="setrow" style="border-top:1px solid var(--line2)"><span>إعادة الإعدادات الافتراضية</span><button class="btn ghost sm" id="p-reset">إعادة</button></div>
      <p class="note" style="margin-top:8px">تُحفظ الإعدادات والرسومات والتنبيهات على هذا الجهاز.</p>
    </section>
  </div>
  <p class="note" style="text-align:center">التحليلات لأغراض تعليمية وليست نصيحة مالية.</p>`;
};
AFTER.prefs = function(){
  const v=$('view'), save=()=>store.set('prefs',S.prefs);
  [['p-bal','balance'],['p-risk','risk'],['p-min','minConf']].forEach(([id,k])=>$(id).addEventListener('change',e=>{ const n=parseFloat(e.target.value); if(isFinite(n)){ S.prefs[k]=n; save(); toast('تم الحفظ','الإعدادات محدثة'); } }));
  $('p-tf').onchange=e=>{ S.prefs.tf=e.target.value; S.tf=e.target.value; save(); };
  v.querySelectorAll('[data-school]').forEach(b=>b.onclick=()=>{ const k=b.dataset.school; S.prefs.schools[k]=!S.prefs.schools[k]; save(); render(); });
  v.querySelectorAll('[data-flag]').forEach(b=>b.onclick=async()=>{ const k=b.dataset.flag; S.prefs[k] = b.getAttribute('aria-checked')!=='true'; // follow what the switch shows
    // Turning phone notifications on asks the browser for permission (it must come from a tap).
    if(k==='push' && S.prefs.push){
      if(!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)){ S.prefs.push=false; island('غير مدعوم هنا','على آيفون: أضف التطبيق للشاشة الرئيسية من زر المشاركة ثم افتحه من هناك',''); }
      else { let r=Notification.permission; if(r!=='granted'){ try{ r=await Notification.requestPermission(); }catch(e){} }
        if(r!=='granted'){ S.prefs.push=false; island('الإشعارات مرفوضة','فعّلها من إعدادات المتصفح لهذا الموقع ثم أعد المحاولة','sell'); }
        else if(await enablePush()) island('تم تفعيل الإشعارات','تصلك الإشارات على الهاتف حتى والتطبيق مغلق','buy');
        else { S.prefs.push=false; island('تعذّر التفعيل','تحقق من الإنترنت ثم أعد المحاولة','sell'); } }
    } else if(k==='push') disablePush();
    save(); b.setAttribute('aria-checked',String(S.prefs[k])); });
  v.querySelectorAll('[data-clock]').forEach(b=>b.onclick=()=>{ S.prefs.clock=+b.dataset.clock; save(); render(); });
  $('p-cleard').onclick=()=>{ try{ Object.keys(localStorage).filter(k=>k.startsWith('mrpro-draw-')).forEach(k=>localStorage.removeItem(k)); }catch(e){} S._d=null; toast('تم المسح','حُذفت كل الرسومات'); };
  $('p-reset').onclick=()=>{ S.prefs={balance:10000,risk:1,tf:'15m',minConf:65,clock:12,sound:true,push:true,schools:{ict:true,snr:true,pa:true,wyc:true,elw:true}}; save(); render(); toast('تمت الإعادة','الإعدادات الافتراضية'); };
};

/* ---------- more (phone) ---------- */
VIEWS.more = function(){
  return `<section class="card"><ul class="list">${['agenda','alerts','prefs'].map(id=>{const r=ROUTES.find(x=>x.id===id);return `<li><a href="#${id}" style="display:flex;align-items:center;gap:14px;min-height:60px;padding:0 18px;color:var(--ivory);text-decoration:none"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#d4af6a" stroke-width="1.7" aria-hidden="true">${r.icon}</svg><span style="flex:1">${r.name}</span><span class="mut">‹</span></a></li>`;}).join('')}</ul></section>
  <p class="note">أسعار مباشرة · ليست نصيحة مالية.</p>`;
};

/* ---------- command palette ---------- */
let palIdx=0;
function openPalette(){
  if(document.querySelector('.palette')) return;
  const ov=document.createElement('div'); ov.className='palette'; ov.setAttribute('role','dialog'); ov.setAttribute('aria-label','بحث');
  ov.innerHTML='<div class="box"><input id="palq" placeholder="ابحث عن أصل أو شاشة… مثل ذهب أو BTC" autocomplete="off"><ul id="pall"></ul></div>';
  document.body.appendChild(ov);
  const items=()=>{ const q=$('palq').value.trim().toLowerCase();
    const as=Object.keys(ASSETS).filter(a=>!q||ASSETS[a].name.includes(q)||ASSETS[a].sym.toLowerCase().includes(q)).map(a=>({t:'a',id:a,label:ASSETS[a].name,sub:ASSETS[a].sym}));
    const rs=ROUTES.filter(r=>!r.bottomOnly&&(!q||r.name.includes(q))).map(r=>({t:'r',id:r.id,label:r.name,sub:'شاشة'}));
    return [...as,...rs]; };
  const draw=()=>{ const it=items(); palIdx=Math.min(palIdx,Math.max(0,it.length-1)); $('pall').innerHTML=it.map((x,k)=>`<li><button data-k="${k}" class="${k===palIdx?'on':''}"><b>${x.label}</b><span class="mut num ltr" style="margin-inline-start:auto;font-size:12px">${x.t==='a'?fp(x.id,last(x.id))+' · ':''}${x.sub}</span></button></li>`).join('')||'<li><p class="empty" style="padding:14px">لا نتائج</p></li>'; };
  const go=x=>{ close(); if(!x) return; if(x.t==='a'){ S.asset=x.id; S.ch.right=null; if(S.route==='chart') render(); else location.hash='#chart'; } else location.hash='#'+x.id; };
  const close=()=>ov.remove();
  ov.addEventListener('click',e=>{ if(e.target===ov) close(); const b=e.target.closest('[data-k]'); if(b) go(items()[+b.dataset.k]); });
  $('palq').addEventListener('input',()=>{palIdx=0;draw();});
  $('palq').addEventListener('keydown',e=>{ const it=items(); if(e.key==='ArrowDown'){palIdx=Math.min(it.length-1,palIdx+1);draw();e.preventDefault();} if(e.key==='ArrowUp'){palIdx=Math.max(0,palIdx-1);draw();e.preventDefault();} if(e.key==='Enter') go(it[palIdx]); if(e.key==='Escape') close(); });
  draw(); $('palq').focus();
}

/* ---------- global keys ---------- */
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){ e.preventDefault(); openPalette(); return; }
  if(e.target.closest&&e.target.closest('input,select,textarea')) return;
  if(S.route!=='chart') return;
  if(e.key==='Escape'){ S.ch.draft=null; setTool('cursor'); chartDraw(); }
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){ e.preventDefault(); undo(); }
  if(e.key==='Delete'||e.key==='Backspace'){ undo(); }
  const map={t:'trend',h:'hline',r:'rect',f:'fib',p:'pen',m:'measure',e:'eraser',v:'cursor'}; if(!e.ctrlKey&&!e.metaKey&&map[e.key]) setTool(map[e.key]);
});
$('openPal').onclick=openPalette;


/* ---------- cinematic helpers ---------- */
function buildTicker(){ const t=$('track'); if(!t) return; const items=Object.keys(ASSETS).map(a=>`<span><span class="mut">${ASSETS[a].sym}</span><b data-live="${a}">${fp(a,last(a))}</b><span data-live="${a}" data-kind="chg" class="num ltr ${change24(a)>=0?'up':'dn'}">${pct(change24(a))}</span></span>`).join(''); t.innerHTML=items+items; }
function startFx(){
  const c=$('fx'); if(!c||matchMedia('(prefers-reduced-motion: reduce)').matches) return; const x=c.getContext('2d'); let w,h,ps;
  const init=()=>{ w=c.width=innerWidth; h=c.height=innerHeight; ps=[...Array(Math.min(90,Math.round(w*h/20000)))].map(()=>({x:Math.random()*w,y:Math.random()*h,r:Math.random()*1.7+.3,v:Math.random()*.3+.05,a:Math.random()*.6+.25,t:Math.random()*6})); };
  init(); addEventListener('resize',init);
  const loop=()=>{ x.clearRect(0,0,w,h); x.fillStyle='#e8c77f'; x.shadowColor='#d4af6a'; x.shadowBlur=10;
    for(const p of ps){ p.y-=p.v; p.t+=.012; p.x+=Math.sin(p.t)*.18; if(p.y<-6){p.y=h+6;p.x=Math.random()*w;} x.globalAlpha=p.a*(.55+.45*Math.sin(p.t*3)); x.beginPath(); x.arc(p.x,p.y,p.r,0,7); x.fill(); }
    requestAnimationFrame(loop); };
  loop();
}
function runScan(a,tf,done){
  const ov=document.createElement('div'); ov.className='scan'; ov.setAttribute('role','status');
  const steps=['قراءة الهيكل ومناطق ICT','الدعم والمقاومة وحركة السعر','وايكوف وموجات إليوت','توافق الأطر الثلاثة','حساب الدخول والوقف والأهداف'];
  const blips=[[30,40],[70,30],[55,72],[22,66],[78,60]].map(([l,t],k)=>`<i class="blip" style="left:${l}%;top:${t}%;animation-delay:${k*.22}s"></i>`).join('');
  ov.innerHTML=`<div style="text-align:center;padding:16px"><div class="rad"><svg viewBox="0 0 240 240" width="240" height="240" aria-hidden="true" style="position:absolute;inset:0"><g fill="none" stroke="rgba(212,175,106,.35)"><circle cx="120" cy="120" r="118"/><circle cx="120" cy="120" r="84"/><circle cx="120" cy="120" r="50"/><path d="M120 2v236M2 120h236"/></g><circle cx="120" cy="120" r="4" fill="#f0d28f"/></svg><div class="sweep"></div>${blips}</div><div class="ttl">جارِ تحليل ${esc(ASSETS[a].name)} · <span class="num">${tf}</span></div><div class="steps">${steps.map(s=>`<div>${s}</div>`).join('')}</div></div>`;
  document.body.appendChild(ov);
  const st=ov.querySelectorAll('.steps div'); let k=0;
  const iv=setInterval(()=>{ if(k<st.length){ st[k++].classList.add('on'); } else { clearInterval(iv); analyze(a,tf); ov.style.transition='opacity .3s'; ov.style.opacity='0'; setTimeout(()=>{ ov.remove(); done(); },280); } },340);
}
function countUp(){
  document.querySelectorAll('[data-count]').forEach(el=>{
    const to=parseFloat(el.dataset.count), dec=+(el.dataset.dec||0), pre=el.dataset.pre||'', suf=el.dataset.suf||''; const t0=performance.now(), D=1100;
    const f=t=>{ const k=Math.min(1,(t-t0)/D), e=1-Math.pow(1-k,3); el.textContent=pre+(to*e).toFixed(dec)+suf; if(k<1) requestAnimationFrame(f); }; requestAnimationFrame(f);
  });
}


/* =========================================================
   MOBILE APP EDITION — overrides
   ========================================================= */
const ICONS = {
  GBP:['£','#c9b6ff','#5b3fc4'],
  XAU:['Au','#f6d78b','#a77b2c'], XAG:['Ag','#e9ecf2','#7d8594'], DXY:['$','#9fd3a8','#2f7a4a'], EUR:['€','#9cc2ff','#2c5fb3'],
  BTC:['₿','#ffc46b','#d9771c'], ETH:['Ξ','#c6b5ff','#6a4fd6'], SOL:['S','#8ff5d2','#7b3fe4'], XRP:['X','#d6dbe3','#3b4250']
};
function aicon(a,size){ const [t,c1,c2]=ICONS[a]||['?','#ccc','#666']; size=size||44; return `<span class="aicon" style="width:${size}px;height:${size}px;background:radial-gradient(circle at 30% 25%,${c1},${c2});font-size:${Math.round(size*.38)}px" aria-hidden="true">${t}</span>`; }
const TABS = [
  {id:'home', name:'الرئيسية', icon:'<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'},
  {id:'markets', name:'الأسواق', icon:'<path d="M5 20V10M12 20V4M19 20v-7"/>'},
  {id:'scan', name:'الرادار', center:true},
  {id:'chart', name:'الشارت', icon:'<path d="M4 18l5-6 4 3 7-8"/><path d="M4 21h16"/>'},
  {id:'more', name:'المزيد', icon:'<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>'}
];
ROUTES.length=0;
[['home','الرئيسية'],['markets','الأسواق'],['chart','الشارت'],['more','المزيد'],['trades','الصفقات'],['alerts','التنبيهات'],['agenda','الأجندة'],['prefs','الإعدادات']].forEach(([id,name])=>ROUTES.push({id,name,icon:''}));
const SUB = {trades:'الصفقات', alerts:'التنبيهات', agenda:'الأجندة', prefs:'الإعدادات'};

function navLinks(){
  $('bnav').innerHTML = `<div class="pill">${TABS.map(t=> t.center
    ? `<button class="radarbtn" id="radarBtn" aria-label="تشغيل الرادار"><span class="ring"></span><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#1a1408" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5" opacity=".6"/><path d="M12 12L18 6" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="12" r="1.6" fill="#1a1408"/></svg></button>`
    : `<a href="#${t.id}" data-r="${t.id}"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true">${t.icon}</svg><span>${t.name}</span></a>`).join('')}</div>`;
  $('radarBtn').onclick=()=>{ const a=S.asset; runScan(a,S.tf,()=>{ openSheet(a,S.tf); if(S.route==='chart') chartDraw(); else if(S.route==='home') render(); }); };
}
function route(){
  let id=(location.hash||'#home').slice(1); if(!ROUTES.find(r=>r.id===id)) id='home';
  S.route=id; closeSheet(true);
  document.querySelectorAll('[data-r]').forEach(a=>{ const on=a.dataset.r===id || (a.dataset.r==='more' && SUB[id]); on?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current'); });
  if(id==='alerts') $('bellDot').hidden=true;
  render(); const d=$('device'); if(d) d.scrollTop=0; window.scrollTo(0,0);
}
const subHead = (t)=>`<header class="subhead"><a href="#more" class="back" aria-label="رجوع"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></a><h1>${t}</h1><span style="width:40px"></span></header>`;
['trades','alerts','agenda','prefs'].forEach(k=>{ const f=VIEWS[k]; VIEWS[k]=()=>subHead(SUB[k])+f(); });

/* ---------- home ---------- */
VIEWS.home = function(){
  const s=sessNow(), hr=new Date().getHours(), greet=hr<12?'صباح الخير':'مساء الخير';
  const A=S.analysis[S.asset+'|'+S.tf];
  const trends=Object.keys(ASSETS).map(trendOf), bull=trends.filter(t=>t==='up').length, bear=trends.filter(t=>t==='down').length, senti=Math.round(50+(bull-bear)/trends.length*50);
  const favs=S.favs.length?S.favs:['XAU'];
  const OA=ASSETS.XAU?'XAU':S.asset, O=pendingOrders(OA).slice(0,2);
  const nowPct=s.h/24*100;
  return `
  <header class="apphead">
    <div style="display:flex;align-items:center;gap:12px">
      <span class="avatar">ب</span>
      <div><div class="label">${greet}</div><div class="hello">رادار <span class="gold">الأسواق</span></div></div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="iconbtn" data-act="search" aria-label="بحث"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg></button>
      <a class="iconbtn" href="#alerts" aria-label="التنبيهات"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/></svg>${S.alerts.some(x=>x.on)?'<span class="dot"></span>':''}</a>
    </div>
  </header>

  <div class="stories" role="list" aria-label="الأصول">${Object.keys(ASSETS).map(a=>{ const t=trendOf(a), an=S.analysis[a+'|'+S.tf]; const ring = an ? 'conic-gradient(#f6dc9c,#d4af6a,#8a6524,#f6dc9c)' : t==='up' ? 'conic-gradient(#3fb68b,#9ff0cf,#3fb68b)' : t==='down' ? 'conic-gradient(#e5484d,#ff9a9d,#e5484d)' : 'conic-gradient(#3a342b,#6b6355,#3a342b)';
    return `<button class="story ${a===S.asset?'on':''}" role="listitem" data-story="${a}"><span class="sring" style="background:${ring}">${aicon(a,52)}</span><span class="sname">${ASSETS[a].name}</span><span class="sval num ${change24(a)>=0?'up':'dn'}">${pct(change24(a))}</span></button>`; }).join('')}</div>

  <section aria-label="المفضلة">
    <div class="carousel" id="car">${favs.map(a=>{ const ch=change24(a), r=range24(a), pos=Math.max(0,Math.min(100,(last(a)-r.lo)/(r.hi-r.lo||1)*100)); const [,c1,c2]=ICONS[a];
      return `<a class="hcard" href="#chart" data-open="${a}" style="--c1:${c1};--c2:${c2}">
        <div class="hglow"></div>
        <div style="display:flex;justify-content:space-between;align-items:center;position:relative">
          <div style="display:flex;align-items:center;gap:10px">${aicon(a,40)}<div><b style="font-size:16px">${ASSETS[a].name}</b><div class="label num ltr" style="text-align:right">${ASSETS[a].sym}</div></div></div>
          <span class="chgpill ${ch>=0?'pup':'pdn'}" data-live="${a}" data-kind="chg">${pct(ch)}</span>
        </div>
        <div class="hprice" data-live="${a}" data-kind="raw">${fp(a,last(a))}</div>
        ${bigSpark(a)}
        <div class="rbar" style="margin-top:4px"><i style="right:calc(${(100-pos).toFixed(1)}% - 2px)"></i></div>
        <div class="label num ltr" style="display:flex;justify-content:space-between;margin-top:6px"><span>L ${fp(a,r.lo)}</span><span>H ${fp(a,r.hi)}</span></div>
      </a>`; }).join('')}</div>
    <div class="dots" id="dots">${favs.map((_,k)=>`<i class="${k?'':'on'}"></i>`).join('')}</div>
  </section>

  <div class="qactions">
    <button data-act="scan"><span class="qi"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></svg></span>تحليل</button>
    <a href="#trades" data-tab="orders"><span class="qi"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg></span>أوامر معلقة</a>
    <a href="#trades" data-tab="calc"><span class="qi"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="3"/><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M8 18h8"/></svg></span>الحاسبة</a>
    <a href="#agenda"><span class="qi"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg></span>الأجندة</a>
  </div>

  <section class="card lux ${A?(A.wait?'':(A.sell?'sell':'buy')):''} pad" aria-label="إشارة اليوم">
    ${A ? `<div class="decision"><div><div class="label">إشارة ${ASSETS[S.asset].name} · <span class="ltr">${S.tf}</span></div><h2 class="pulse" style="color:${decCol(A)}">${decTitle(A)}</h2><div class="label">${A.aligned} من ${A.nTf} أطر تؤكد</div></div>${gauge(A.conf)}</div>
      ${miniPlan(S.asset,A)}
      <button class="btn" data-act="sheet" style="width:100%;margin-top:14px">عرض الخطة الكاملة</button>`
    : `<div style="display:flex;align-items:center;gap:16px"><div class="miniradar"><span></span></div><div style="flex:1"><div class="label">${ASSETS[S.asset].name} · <span class="ltr">${S.tf}</span></div><h2 style="font-family:var(--f-display);font-size:22px;margin:2px 0">اضغط زر الرادار</h2><div class="label" style="line-height:1.6">خمس مدارس على ثلاثة أطر في قرار واحد</div></div></div>`}
  </section>

  <section class="card pad" aria-label="الجلسات">
    <div class="sechead"><h2>الجلسات الآن</h2><span class="sub ${s.kill?'gold':''}">${s.kill?s.kill.n:'لا كيل زون الآن'}</span></div>
    <div class="sessbar ltr">${SESS.map((x,k)=>{ const segs=x.s<x.e?[[x.s,x.e]]:[[x.s,24],[0,x.e]]; const on=inSess(s.h,x); return segs.map(([a,b])=>`<i style="left:${a/24*100}%;width:${(b-a)/24*100}%;top:${k*9}px;background:${DIALC[k]};opacity:${on?1:.28};${on?`box-shadow:0 0 10px ${DIALC[k]}`:''}"></i>`).join(''); }).join('')}<b style="left:${nowPct}%"></b></div>
    <div class="sesslegend">${SESS.map((x,k)=>`<span class="${inSess(s.h,x)?'':'mut'}"><i style="background:${DIALC[k]}"></i>${x.n}</span>`).join('')}</div>
  </section>

  <section class="card pad" aria-label="نبض السوق">
    <div class="sechead" style="margin-bottom:0"><h2>نبض السوق</h2><span class="sub">${bull} صاعد · ${bear} هابط</span></div>
    ${sentiSVG(senti)}
    <div class="heat" style="margin-top:12px">${Object.keys(ASSETS).map(k=>{const c=change24(k), al=Math.min(.55,.12+Math.abs(c)/6), bg=c>=0?`rgba(63,182,139,${al})`:`rgba(229,72,77,${al})`; return `<a class="tile" href="#chart" data-open="${k}" style="background:linear-gradient(160deg,${bg},rgba(10,10,11,.5));min-height:74px"><span class="n" style="font-size:12px">${ASSETS[k].name}</span><span class="c" style="font-size:14px">${pct(c)}</span></a>`;}).join('')}</div>
  </section>

  <section aria-label="أقوى المناطق">
    <div class="sechead"><h2>أقوى مناطق ${ASSETS[OA].name}</h2><a href="#trades" data-tab="orders" style="font-size:13px">الكل</a></div>
    <div style="display:grid;gap:10px">${O.map(o=>`<div class="card orow"><span class="obadge ${o.sell?'pdn':'pup'}">${o.sell?'بيع':'شراء'}</span><div style="flex:1"><b class="num ltr" style="font-weight:500">${fp(OA,o.lo)} – ${fp(OA,o.hi)}</b><div class="label">عائد <span class="num ltr">1:${o.rr.toFixed(1)}</span> · يبعد <span class="num ltr">${fp(OA,o.dist)}</span></div></div><div class="ostr"><svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="18" fill="none" stroke="#2a2620" stroke-width="3.5"/><circle class="garc" style="color:${o.strength>85?C.buy:C.gold}" cx="22" cy="22" r="18" fill="none" stroke="${o.strength>85?C.buy:C.gold}" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="${(113*o.strength/100).toFixed(0)} 113" transform="rotate(-90 22 22)"/></svg><b class="num">${o.strength}</b></div></div>`).join('') || '<p class="empty">لا مناطق قوية قريبة الآن.</p>'}</div>
  </section>
  <p class="note" style="text-align:center">أسعار مباشرة وتحليل تعليمي · ليست نصيحة مالية</p>`;
};
AFTER.home = function(){
  const v=$('view');
  v.querySelectorAll('[data-story]').forEach(b=>b.onclick=()=>{ S.asset=b.dataset.story; render(); });
  v.querySelectorAll('[data-open]').forEach(el=>el.addEventListener('click',()=>{ S.asset=el.dataset.open; S.ch.right=null; }));
  v.querySelectorAll('[data-tab]').forEach(el=>el.addEventListener('click',()=>{ S.tradesTab=el.dataset.tab; }));
  v.querySelectorAll('[data-act="search"]').forEach(b=>b.onclick=openPalette);
  v.querySelectorAll('[data-act="scan"]').forEach(b=>b.onclick=()=>$('radarBtn').click());
  const sh=v.querySelector('[data-act="sheet"]'); if(sh) sh.onclick=()=>openSheet(S.asset,S.tf);
  const car=$('car'), dots=$('dots');
  if(car&&dots) car.addEventListener('scroll',()=>{ const w=car.firstElementChild?car.firstElementChild.offsetWidth+12:1; const k=Math.round(Math.abs(car.scrollLeft)/w); dots.querySelectorAll('i').forEach((d,i)=>d.classList.toggle('on',i===k)); },{passive:true});
};

/* ---------- markets ---------- */
VIEWS.markets = function(){
  const cats=[['all','الكل'],['fav','المفضلة'],['fx','معادن وعملات'],['crypto','كريبتو'],['idx','مؤشرات']];
  return `<header class="apphead"><h1 class="ptitle">الأسواق</h1><button class="iconbtn" data-act="search" aria-label="بحث"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg></button></header>
  <label class="searchbox"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><span class="sr">بحث</span><input id="mkq" type="search" placeholder="ابحث بالاسم أو الرمز" value="${esc(S.mkQuery)}"></label>
  <div class="hscroll" role="group" aria-label="الفئات">${cats.map(([k,n])=>`<button class="chip" data-cat="${k}" aria-pressed="${S.mkCat===k}">${n}</button>`).join('')}</div>
  <ul class="list mlist card" id="mkbody"></ul>`;
};
function marketRows(){
  const q=S.mkQuery.trim().toLowerCase();
  const list=Object.keys(ASSETS).filter(a=>{ const A=ASSETS[a]; if(S.mkCat==='fav'&&!S.favs.includes(a)) return false; if(!['all','fav'].includes(S.mkCat)&&A.cat!==S.mkCat) return false; return !q||A.name.includes(q)||A.sym.toLowerCase().includes(q); });
  $('mkbody').innerHTML = list.map(a=>{ const ch=change24(a), t=TREND[trendOf(a)];
    return `<li><a href="#chart" data-open="${a}" class="mrow">${aicon(a,44)}<span style="min-width:0"><b>${ASSETS[a].name}</b><br><span class="label num ltr">${ASSETS[a].sym}</span> <span class="tag ${t[1]}" style="font-size:10px">${t[0]}</span></span>${sparkSVG(a,64,28)}<span style="text-align:left"><b class="num ltr" style="font-weight:500;font-size:15px" data-live="${a}">${fp(a,last(a))}</b><br><span class="chgpill sm ${ch>=0?'pup':'pdn'}">${pct(ch)}</span></span><button class="star" data-fav="${a}" aria-pressed="${S.favs.includes(a)}" aria-label="مفضلة"><svg width="18" height="18" viewBox="0 0 24 24" fill="${S.favs.includes(a)?'currentColor':'none'}" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/></svg></button></a></li>`; }).join('') || '<li><p class="empty" style="padding:18px">لا نتائج.</p></li>';
}
AFTER.markets = function(){
  marketRows();
  $('view').querySelector('[data-act="search"]').onclick=openPalette;
  $('mkq').addEventListener('input',e=>{ S.mkQuery=e.target.value; marketRows(); });
  $('view').querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{ S.mkCat=b.dataset.cat; $('view').querySelectorAll('[data-cat]').forEach(x=>x.setAttribute('aria-pressed',String(x===b))); marketRows(); });
  $('mkbody').addEventListener('click',e=>{ const f=e.target.closest('[data-fav]'); if(f){ e.preventDefault(); e.stopPropagation(); const a=f.dataset.fav; S.favs=S.favs.includes(a)?S.favs.filter(x=>x!==a):[...S.favs,a]; store.set('favs',S.favs); marketRows(); return; } const r=e.target.closest('[data-open]'); if(r){ S.asset=r.dataset.open; S.ch.right=null; } });
};

/* ---------- chart ---------- */
VIEWS.chart = function(){
  const a=S.asset, ch=change24(a), A=S.analysis[a+'|'+S.tf];
  return `<header class="chead">
    <button class="assetbtn" id="pickAsset" aria-label="تغيير الأصل">${aicon(a,38)}<span><b>${ASSETS[a].name}</b><br><span class="label num ltr">${ASSETS[a].sym}</span></span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
    <div style="text-align:left"><div class="num ltr cprice" data-live="${a}" data-kind="raw">${fp(a,last(a))}</div><span class="chgpill sm ${ch>=0?'pup':'pdn'}" data-live="${a}" data-kind="chg">${pct(ch)}</span></div>
  </header>
  <div class="seg wide" id="tfs" role="group" aria-label="الإطار الزمني">${Object.keys(TFS).map(t=>`<button data-tf="${t}" aria-pressed="${t===S.tf}">${t}</button>`).join('')}</div>
  <div class="hscroll">${[['ema20','EMA 20','#d4af6a'],['ema50','EMA 50','#6ea8ff'],['rsi','RSI','#b48cff'],['ict','ICT','#e5484d'],['lv','الخطة','#3fb68b']].map(([k,n,c])=>`<button class="tog" data-show="${k}" aria-pressed="${S.ch.show[k]}"><i style="color:${c}"></i>${n}</button>`).join('')}<button class="tog" id="zfit">آخر الشموع</button></div>
  <section class="card chartbox"><div class="stage" id="stage"><canvas id="cv"></canvas><div class="ohlc" id="ohlc"></div><div class="hint" id="hint" hidden></div></div></section>
  <div class="rail" id="rail" role="toolbar" aria-label="أدوات الرسم"></div>
  <div class="cactions">
    <button class="btn" id="cRun"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></svg>${A?'إعادة التحليل':'حلّل الآن'}</button>
    ${A?`<button class="btn outline" id="cPlan">الخطة <span class="num">${A.conf}%</span></button>`:''}
  </div>`;
};
AFTER.chart = function(){
  cv=$('cv'); ctx=cv.getContext('2d'); const st=$('stage');
  buildRail();
  const ck=S.asset+'|'+S.tf; if(S.ch.right==null||S.ch.key!==ck){ S.ch.right=series(S.asset,S.tf).c.length-1+4; S.ch.key=ck; }
  if(S.ch.bw===9 && !S.ch.bwSet){ S.ch.bw=7; S.ch.bwSet=true; }
  $('tfs').onclick=e=>{ const b=e.target.closest('[data-tf]'); if(!b) return; S.tf=b.dataset.tf; S.ch.right=null; render(); };
  $('view').querySelectorAll('[data-show]').forEach(b=>b.onclick=()=>{ const k=b.dataset.show; S.ch.show[k]=!S.ch.show[k]; b.setAttribute('aria-pressed',String(S.ch.show[k])); chartDraw(); });
  $('zfit').onclick=()=>{ S.ch.bw=7; S.ch.right=series(S.asset,S.tf).c.length-1+4; chartDraw(); };
  $('pickAsset').onclick=openPalette;
  $('cRun').onclick=()=>{ const a=S.asset; runScan(a,S.tf,()=>{ S.ch.show.lv=true; render(); openSheet(a,S.tf); }); };
  const cp=$('cPlan'); if(cp) cp.onclick=()=>openSheet(S.asset,S.tf);
  bindPointer();
  ro=new ResizeObserver(()=>{ const r=st.getBoundingClientRect(), dpr=window.devicePixelRatio||1; W=r.width; H=r.height; cv.width=Math.round(W*dpr); cv.height=Math.round(H*dpr); ctx.setTransform(dpr,0,0,dpr,0,0); chartDraw(); });
  ro.observe(st); setTool(S.ch.tool,true);
  let lastF=0; const loopF=t=>{ if(!cv) return; if(t-lastF>40 && !matchMedia('(prefers-reduced-motion: reduce)').matches){ lastF=t; chartDraw(); } S.ch.raf=requestAnimationFrame(loopF); }; S.ch.raf=requestAnimationFrame(loopF);
};
function renderPanel(){}

/* ---------- more ---------- */
VIEWS.more = function(){
  const J=journalStats(), act=S.alerts.filter(a=>a.on).length;
  const tiles=[
    ['trades','orders','الأوامر المعلقة','مناطق قوية جاهزة','<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>','#d4af6a'],
    ['trades','journal','سجل الصفقات',J.win+'% نجاح','<path d="M4 19V5M4 19h16"/><path d="M7 15l4-4 3 3 5-6"/>','#3fb68b'],
    ['trades','calc','حاسبة المخاطرة','حجم الصفقة بدقة','<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M8 7h8M8 12h8M8 17h4"/>','#6ea8ff'],
    ['alerts','','التنبيهات',act+' نشطة','<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>','#e5484d'],
    ['agenda','','الأجندة','الأخبار والجلسات','<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>','#b48cff'],
    ['prefs','','الإعدادات','الحساب والمدارس','<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>','#a39b8d']
  ];
  return `<header class="apphead"><h1 class="ptitle">المزيد</h1></header>
  <section class="card lux pad profile"><span class="avatar big">ب</span><div style="flex:1"><b style="font-size:17px">${esc((S.session&&S.session.name)||'')}</b><div class="label">رصيد الحساب <span class="num ltr">$${fmt(S.prefs.balance,0)}</span> · مخاطرة <span class="num">${S.prefs.risk}%</span></div></div><span class="chgpill pup">PRO</span></section>
  <div class="tilegrid">${tiles.map(([r,tab,n,sub,ic,c])=>`<a class="mtile" href="#${r}" ${tab?`data-tab="${tab}"`:''} style="--tc:${c}"><span class="mti"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ic}</svg></span><b>${n}</b><span class="label">${sub}</span></a>`).join('')}</div>
  <p class="note" style="text-align:center">تحليل تعليمي · ليست نصيحة مالية</p>`;
};
AFTER.more = function(){ $('view').querySelectorAll('[data-tab]').forEach(el=>el.addEventListener('click',()=>{ S.tradesTab=el.dataset.tab; })); };

/* ---------- result sheet ---------- */
function openSheet(a,tf){
  const A=S.analysis[a+'|'+tf]; if(!A) return; closeSheet(true);
  const w=document.createElement('div'); w.className='sheetwrap'; w.id='sheet';
  const sz=sizeFor(a,A.mid,A.sl);
  w.innerHTML=`<div class="sheet ${A.sell?'sell':'buy'} reveal" role="dialog" aria-label="نتيجة التحليل">
    <div class="handle"></div>
    <div class="decision"><div><div class="label">${ASSETS[a].name} · <span class="ltr">${tf}</span> · ${A.aligned} من ${A.nTf} أطر</div><h2 class="pulse" style="color:${decCol(A)}">${decTitle(A)}</h2></div>${gauge(A.conf)}</div>
    <div class="list" style="margin-top:6px">${ladder(a,A)}</div>
    <div class="label" style="margin:12px 0 4px">توافق المدارس</div>${confRows(A)}
    <div class="minigrid" style="grid-template-columns:repeat(2,1fr)"><div>المخاطرة <span class="num">${S.prefs.risk}%</span><b>$${fmt(sz.riskAmt,0)}</b></div><div>الحجم المقترح<b>${fmt(sz.units,sz.units<10?3:1)}</b></div></div>
    <div class="cancel"><b class="dn">يُلغى إذا</b> أغلقت شمعة <span class="ltr">${tf}</span> ${A.sell?'فوق':'تحت'} <span class="num ltr">${fp(a,A.sl)}</span></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
      <button class="btn" id="shChart">على الشارت</button><button class="btn outline" id="shAlert">نبّهني</button>
      <button class="btn ghost" id="shCopy">نسخ الصفقة</button><button class="btn ghost" id="shClose">إغلاق</button>
    </div></div>`;
  document.body.appendChild(w); requestAnimationFrame(()=>w.classList.add('open'));
  w.addEventListener('click',e=>{ if(e.target===w) closeSheet(); });
  $('shClose').onclick=()=>closeSheet();
  $('shChart').onclick=()=>{ S.asset=a; S.tf=tf; S.ch.show.lv=true; closeSheet(); if(S.route==='chart') render(); else location.hash='#chart'; };
  $('shAlert').onclick=()=>addAlert(a, A.sell?'above':'below', A.sell?A.lo:A.hi, 'منطقة الدخول');
  $('shCopy').onclick=()=>{ const txt=`${ASSETS[a].sym} ${tf} ${A.sell?'SELL':'BUY'}\nEntry ${fp(a,A.lo)} - ${fp(a,A.hi)}\nSL ${fp(a,A.sl)}\nTP1 ${fp(a,A.tps[0])}\nTP2 ${fp(a,A.tps[1])}\nTP3 ${fp(a,A.tps[2])}`; (navigator.clipboard?navigator.clipboard.writeText(txt):Promise.reject()).then(()=>toast('تم النسخ','الصفقة في الحافظة'),()=>toast('تعذّر النسخ','انسخ القيم يدوياً')); };
  const sh=w.querySelector('.sheet'); let y0=null;
  sh.addEventListener('pointerdown',e=>{ if(e.target.closest('button')) return; y0=e.clientY; });
  sh.addEventListener('pointermove',e=>{ if(y0==null) return; const dy=Math.max(0,e.clientY-y0); sh.style.transform=`translateY(${dy}px)`; });
  sh.addEventListener('pointerup',e=>{ if(y0==null) return; const dy=e.clientY-y0; y0=null; if(dy>110) closeSheet(); else sh.style.transform=''; });
  document.addEventListener('keydown',escSheet);
}
function escSheet(e){ if(e.key==='Escape') closeSheet(); }
function closeSheet(now){ const w=$('sheet'); if(!w) return; document.removeEventListener('keydown',escSheet); if(now){ w.remove(); return; } w.classList.remove('open'); setTimeout(()=>w.remove(),320); }


/* =========================================================
   POWER FEATURES — scanner, positions, island, countdowns, splash
   ========================================================= */
S.positions = store.get('positions', []);
S.closed = store.get('closed', []);
S.scan = null;
ROUTES.push({id:'scanner',name:'الماسح الذكي',icon:''},{id:'positions',name:'صفقاتي',icon:''});
SUB.scanner='الماسح الذكي'; SUB.positions='صفقاتي التجريبية';
const backTo = (t,h)=>`<header class="subhead"><a href="#${h||'home'}" class="back" aria-label="رجوع"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></a><h1>${t}</h1><span style="width:40px"></span></header>`;
rebuildJournal();

/* ---------- time helpers ---------- */
const two=n=>String(Math.max(0,Math.floor(n))).padStart(2,'0');
const hms=sec=>two(sec/3600)+':'+two(sec%3600/60)+':'+two(sec%60);
function candleLeft(){ const m=TFS[S.tf]*60, now=Math.floor(Date.now()/1000); return m-(now%m); }
function nextSession(){ const s=sessNow(); let best=null; SESS.forEach(x=>{ if(inSess(s.h,x)) return; const dh=((x.s-s.h)+24)%24; if(!best||dh<best.dh) best={n:x.n,dh}; }); return best; }

/* ---------- positions ---------- */
function openPosition(a,A){
  const entry=last(a), sl=A.sl, risk=Math.abs(entry-sl), sz=sizeFor(a,entry,sl);
  const p={id:Date.now(), a, tf:A.tf, sell:A.sell, entry, sl, tps:A.tps.slice(), units:sz.units, risk, at:Date.now(), tp1:false};
  S.positions.unshift(p); store.set('positions',S.positions);
  island('فُتحت صفقة تجريبية', (A.sell?'بيع ':'شراء ')+ASSETS[a].name+' عند '+fp(a,entry), A.sell?'sell':'buy');
}
function posState(p){ const px=last(p.a), mv=p.sell?p.entry-px:px-p.entry; return {px, pnl:mv*p.units, r:mv/(p.risk||1)}; }
function closePosition(id, why){
  const k=S.positions.findIndex(p=>p.id===id); if(k<0) return; const p=S.positions[k], st=posState(p);
  S.positions.splice(k,1); store.set('positions',S.positions);
  const rec={a:p.a, sell:p.sell, r:+st.r.toFixed(1), d:0, tf:p.tf, t:Date.now()}; S.closed.unshift(rec); store.set('closed',S.closed.slice(0,40)); rebuildJournal();
  island(why||'أُغلقت الصفقة', ASSETS[p.a].name+' · '+(st.r>=0?'+':'')+st.r.toFixed(2)+'R · '+(st.pnl>=0?'+$':'-$')+fmt(Math.abs(st.pnl),2), st.r>=0?'buy':'sell');
  if(['home','positions'].includes(S.route)) render();
}
function checkPositions(){
  S.positions.slice().forEach(p=>{ const px=last(p.a);
    const hitSL = p.sell ? px>=p.sl : px<=p.sl, hitTP3 = p.sell ? px<=p.tps[2] : px>=p.tps[2], hitTP1 = p.sell ? px<=p.tps[0] : px>=p.tps[0];
    if(hitSL) closePosition(p.id,'ضُرب الوقف');
    else if(hitTP3) closePosition(p.id,'تحقق الهدف الثالث');
    else if(hitTP1 && !p.tp1){ p.tp1=true; store.set('positions',S.positions); island('تحقق الهدف الأول', ASSETS[p.a].name+' · انقل الوقف للدخول','buy'); }
  });
}
function posCard(p, full){
  const st=posState(p), lo=Math.min(p.sl,p.tps[2]), hi=Math.max(p.sl,p.tps[2]);
  const pos=(v)=>((v-lo)/(hi-lo||1)*100);
  const dir=p.sell; // for sell, SL is high side
  const pctNow=Math.max(0,Math.min(100,pos(st.px))), pctEn=pos(p.entry);
  return `<article class="card poscard ${st.r>=0?'win':'loss'}" data-pid="${p.id}">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
      <div style="display:flex;align-items:center;gap:10px">${aicon(p.a,38)}<div><b>${ASSETS[p.a].name}</b> <span class="obadge ${p.sell?'pdn':'pup'}" style="font-size:11px;padding:2px 8px">${p.sell?'بيع':'شراء'}</span><div class="label">دخول <span class="num ltr">${fp(p.a,p.entry)}</span> · <span class="ltr">${p.tf}</span></div></div></div>
      <div style="text-align:left"><b class="num ltr pospnl" data-pnl="${p.id}" style="font-size:19px;font-weight:500;color:${st.pnl>=0?C.buy:C.sell}">${st.pnl>=0?'+':'-'}$${fmt(Math.abs(st.pnl),2)}</b><div class="num ltr label" data-pr="${p.id}">${(st.r>=0?'+':'')+st.r.toFixed(2)}R</div></div>
    </div>
    <div class="ptrack ltr" ${dir?'style="--l:rgba(63,182,139,.5);--r:rgba(229,72,77,.45)"':''}><span class="pz sl" style="${dir?'right':'left'}:0">SL</span><span class="pz tp" style="${dir?'left':'right'}:0">TP3</span>
      <i class="pen" style="left:${pctEn}%"></i>${p.tps.slice(0,2).map(t=>`<i class="ptp" style="left:${pos(t)}%"></i>`).join('')}<b class="pnow" data-pnow="${p.id}" style="left:${pctNow}%"></b></div>
    ${full?`<div class="minigrid"><div>الوقف<b class="dn">${fp(p.a,p.sl)}</b></div><div>الهدف 1<b class="up">${fp(p.a,p.tps[0])}</b></div><div>الهدف 2<b class="up">${fp(p.a,p.tps[1])}</b></div><div>الهدف 3<b class="up">${fp(p.a,p.tps[2])}</b></div></div>
    <div style="display:flex;gap:8px;margin-top:12px"><button class="btn ghost sm" data-close="${p.id}" style="flex:1">إغلاق الصفقة الآن</button><a class="btn outline sm" href="#chart" data-open="${p.a}" style="flex:1">على الشارت</a></div>`:''}
  </article>`;
}
function posUpdate(){
  S.positions.forEach(p=>{ const st=posState(p), lo=Math.min(p.sl,p.tps[2]), hi=Math.max(p.sl,p.tps[2]);
    document.querySelectorAll(`[data-pnl="${p.id}"]`).forEach(el=>{ el.textContent=(st.pnl>=0?'+':'-')+'$'+fmt(Math.abs(st.pnl),2); el.style.color=st.pnl>=0?C.buy:C.sell; });
    document.querySelectorAll(`[data-pr="${p.id}"]`).forEach(el=>el.textContent=(st.r>=0?'+':'')+st.r.toFixed(2)+'R');
    document.querySelectorAll(`[data-pnow="${p.id}"]`).forEach(el=>el.style.left=Math.max(0,Math.min(100,(st.px-lo)/(hi-lo||1)*100))+'%');
    document.querySelectorAll(`[data-pid="${p.id}"]`).forEach(el=>{ el.classList.toggle('win',st.r>=0); el.classList.toggle('loss',st.r<0); });
  });
  const tot=S.positions.reduce((s,p)=>s+posState(p).pnl,0); const t=$('posTotal'); if(t){ t.textContent=(tot>=0?'+':'-')+'$'+fmt(Math.abs(tot),2); t.style.color=tot>=0?C.buy:C.sell; }
}
function liveUpdate(){
  document.querySelectorAll('[data-live]').forEach(el=>{
    const a=el.dataset.live, kind=el.dataset.kind||'price';
    if(kind==='price'){ const up=S.price[a]>=S.prevPrice[a]; el.textContent=fp(a,S.price[a]); if(S.price[a]!==S.prevPrice[a]){ el.style.color=up?C.buy:C.sell; setTimeout(()=>{el.style.color='';},500); } }
    if(kind==='raw'){ el.textContent=fp(a,S.price[a]); }
    if(kind==='chg'){ const v=change24(a); el.textContent=pct(v); el.classList.toggle('up',v>=0); el.classList.toggle('dn',v<0); el.classList.toggle('pup',v>=0); el.classList.toggle('pdn',v<0); }
  });
  checkPositions(); posUpdate();
}

/* ---------- dynamic island ---------- */
function island(title, body, kind){
  const host=$('island'); if(!host) return toast(title,body);
  const el=document.createElement('div'); el.className='isl '+(kind||''); el.setAttribute('role','status');
  const ic = kind==='sell' ? '<path d="M7 7l10 10M17 8v9H8"/>' : kind==='buy' ? '<path d="M7 17L17 7M8 7h9v9"/>' : '<path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/>';
  el.innerHTML=`<span class="isli"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">${ic}</svg></span><span class="islt"><b>${esc(title)}</b><span>${esc(body)}</span></span>`;
  host.appendChild(el); requestAnimationFrame(()=>el.classList.add('open'));
  setTimeout(()=>{ el.classList.remove('open'); setTimeout(()=>el.remove(),500); }, 4200);
}
function toast(title, body){ island(title, body, ''); }

/* ---------- scanner ---------- */
function runMultiScan(done){
  const ov=document.createElement('div'); ov.className='scan';
  const keys=Object.keys(ASSETS);
  ov.innerHTML=`<div style="text-align:center;padding:16px;width:min(420px,100%)"><div class="rad"><svg viewBox="0 0 240 240" width="240" height="240" aria-hidden="true" style="position:absolute;inset:0"><g fill="none" stroke="rgba(212,175,106,.35)"><circle cx="120" cy="120" r="118"/><circle cx="120" cy="120" r="84"/><circle cx="120" cy="120" r="50"/><path d="M120 2v236M2 120h236"/></g></svg><div class="sweep"></div>${keys.map((k,i)=>{const g=i/keys.length*Math.PI*2, r=40+((i*37)%60); return `<span class="sblip" id="sb-${k}" style="left:${(50+Math.cos(g)*r/2.4).toFixed(1)}%;top:${(50+Math.sin(g)*r/2.4).toFixed(1)}%">${aicon(k,26)}</span>`;}).join('')}</div>
    <div class="ttl">مسح ${keys.length} أسواق · <span class="num">${S.tf}</span></div>
    <div class="scangrid">${keys.map(k=>`<div id="sr-${k}"><span>${ASSETS[k].name}</span><b class="num">…</b></div>`).join('')}</div></div>`;
  document.body.appendChild(ov);
  let i=0; const iv=setInterval(()=>{
    if(i<keys.length){ const k=keys[i++], A=analyze(k,S.tf); const row=$('sr-'+k); row.classList.add('on'); row.querySelector('b').innerHTML=`<span style="color:${decCol(A)}">${sigWord(A)}</span> ${A.conf}%`; const bl=$('sb-'+k); if(bl) bl.classList.add('on'); }
    else { clearInterval(iv); S.scan={at:Date.now(), list:keys.map(k=>S.analysis[k+'|'+S.tf]).sort((x,y)=>(x.wait-y.wait)||(y.conf-x.conf))}; ov.style.transition='opacity .3s'; ov.style.opacity='0'; setTimeout(()=>{ ov.remove(); done&&done(); },300); }
  },260);
}
VIEWS.scanner = function(){
  const L=S.scan;
  const head=backTo('الماسح الذكي','home');
  if(!L) return head+`<section class="card lux pad" style="text-align:center"><div class="miniradar" style="margin:6px auto 14px;width:110px;height:110px"><span></span></div><h2 style="font-family:var(--f-display);font-size:24px;margin:0 0 6px">امسح كل الأسواق بضغطة</h2><p class="mut" style="margin:0 0 16px;line-height:1.7">يحلل الماسح ${Object.keys(ASSETS).length} أصول على إطار <span class="num">${S.tf}</span> ويرتّبها من الأقوى للأضعف.</p><button class="btn" id="doScan" style="width:100%">ابدأ المسح</button></section>`;
  const best=L.list[0];
  return head+`
  <section class="card lux ${best.wait?'':(best.sell?'sell':'buy')} pad reveal">
    <div class="label">أفضل فرصة الآن</div>
    <div class="decision"><div style="display:flex;align-items:center;gap:12px">${aicon(best.a,52)}<div><h2 class="pulse" style="color:${decCol(best)};font-size:28px">${sigWord(best)} ${ASSETS[best.a].name}</h2><div class="label">${best.aligned} من ${best.nTf} أطر · <span class="ltr">${best.tf}</span></div></div></div>${gauge(best.conf)}</div>
    ${miniPlan(best.a,best)}
    <button class="btn" data-sheet="${best.a}" style="width:100%;margin-top:14px">عرض الخطة وفتح صفقة</button>
  </section>
  <div class="sechead"><h2>الترتيب</h2><span class="sub">قبل ${Math.max(0,Math.round((Date.now()-L.at)/60000))} دقيقة · <button class="linkbtn" id="doScan">مسح جديد</button></span></div>
  <div class="card" style="padding:4px 14px"><ul class="list">${L.list.map((A,k)=>`<li><button class="scanrow" data-sheet="${A.a}"><span class="rank num">${k+1}</span>${aicon(A.a,36)}<span style="min-width:0;text-align:right"><b>${ASSETS[A.a].name}</b><br><span class="label" style="color:${decCol(A)}">${sigWord(A)} · ${A.aligned}/${A.nTf} أطر</span></span><span class="sbar"><i style="width:${A.conf}%;background:${A.conf>=75?(A.sell?C.sell:C.buy):A.conf>=60?C.gold:C.muted}"></i></span><b class="num" style="font-weight:500">${A.conf}%</b></button></li>`).join('')}</ul></div>
  <p class="note">تحليل تعليمي من شموع مغلقة · ليس نصيحة مالية.</p>`;
};
AFTER.scanner = function(){
  const v=$('view');
  v.querySelectorAll('#doScan').forEach(b=>b.onclick=()=>runMultiScan(()=>{ render(); island('اكتمل المسح', S.scan.list[0].wait ? 'لا توجد صفقة مؤكدة الآن' : 'أفضل فرصة: '+ASSETS[S.scan.list[0].a].name+' '+S.scan.list[0].conf+'%', S.scan.list[0].wait?'':(S.scan.list[0].sell?'sell':'buy')); }));
  v.querySelectorAll('[data-sheet]').forEach(b=>b.onclick=()=>{ S.asset=b.dataset.sheet; openSheet(b.dataset.sheet,S.tf); });
};

/* ---------- positions view ---------- */
VIEWS.positions = function(){
  const tot=S.positions.reduce((s,p)=>s+posState(p).pnl,0);
  return backTo('صفقاتي التجريبية','more')+`
  <section class="card lux pad" style="text-align:center"><div class="label">الربح والخسارة المفتوح</div><div class="bigpnl num ltr" id="posTotal" style="color:${tot>=0?C.buy:C.sell}">${tot>=0?'+':'-'}$${fmt(Math.abs(tot),2)}</div><div class="label">${S.positions.length} صفقة مفتوحة · ${S.closed.length} مغلقة</div></section>
  ${S.positions.length? S.positions.map(p=>posCard(p,true)).join('') : `<section class="card pad" style="text-align:center"><p class="mut" style="margin:0 0 12px">لا توجد صفقات مفتوحة. شغّل الرادار ثم اضغط «فتح صفقة تجريبية» من لوحة النتيجة.</p><button class="btn" data-act="scan" style="width:100%">تشغيل الرادار</button></section>`}
  ${S.closed.length?`<div class="sechead"><h2>آخر الصفقات المغلقة</h2></div><div class="card" style="padding:4px 14px"><ul class="list">${S.closed.slice(0,6).map(c=>`<li style="display:flex;justify-content:space-between;padding:11px 0"><span>${ASSETS[c.a].name} <span class="${c.sell?'dn':'up'}" style="font-size:12px">${c.sell?'بيع':'شراء'}</span></span><b class="num ltr ${c.r>=0?'up':'dn'}" style="font-weight:500">${(c.r>=0?'+':'')+c.r}R</b></li>`).join('')}</ul></div>`:''}
  <p class="note">صفقات افتراضية على الأسعار الحقيقية لتجربة الخطة · ليست تداولاً حقيقياً.</p>`;
};
AFTER.positions = function(){ const v=$('view'); v.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>closePosition(+b.dataset.close,'أغلقتَ الصفقة')); v.querySelectorAll('[data-open]').forEach(el=>el.addEventListener('click',()=>{ S.asset=el.dataset.open; S.ch.right=null; })); v.querySelectorAll('[data-act="scan"]').forEach(b=>b.onclick=()=>$('radarBtn').click()); };

/* ---------- extend home ---------- */
const homeBase = VIEWS.home;
VIEWS.home = function(){
  let h=homeBase();
  const ns=nextSession(), s=sessNow();
  const qa = `<div class="qactions">
    <button data-act="scan"><span class="qi"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></svg></span>تحليل</button>
    <a href="#scanner"><span class="qi hot"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 12l6-6"/><circle cx="12" cy="12" r="4" opacity=".6"/></svg></span>الماسح</a>
    <a href="#positions"><span class="qi">${S.positions.length?`<em class="qbadge">${S.positions.length}</em>`:''}<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 19V5M4 19h16"/><path d="M7 15l4-4 3 3 5-6"/></svg></span>صفقاتي</a>
    <a href="#trades" data-tab="orders"><span class="qi"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg></span>أوامر معلقة</a>
  </div>`;
  h=h.replace(/<div class="qactions">[\s\S]*?<\/div>\n/, qa+'\n');
  const strip = `<div class="livestrip"><span><i class="ldot"></i>${s.kill?s.kill.n+' نشط':(s.open.length?s.open.map(x=>x.n).join(' و')+' مفتوحة':'السوق هادئ')}</span>${ns?`<span>${ns.n} تفتح بعد <b class="num" id="nsCd">${hms(ns.dh*3600)}</b></span>`:''}</div>`;
  h=h.replace('<div class="stories"', strip+'\n  <div class="stories"');
  const pos = S.positions.length ? `<section aria-label="صفقاتي"><div class="sechead"><h2>صفقاتي المفتوحة</h2><a href="#positions" style="font-size:13px">الكل</a></div><div style="display:grid;gap:10px">${S.positions.slice(0,2).map(p=>posCard(p,false)).join('')}</div></section>` : '';
  const best = S.scan ? (()=>{ const b=S.scan.list[0]; return `<button class="card bestcard ${b.wait?'':(b.sell?'sell':'buy')}" data-sheet="${b.a}"><span class="label">أفضل فرصة من الماسح</span><span style="display:flex;align-items:center;gap:12px;margin-top:6px">${aicon(b.a,42)}<span style="flex:1;text-align:right"><b style="font-size:17px;color:${decCol(b)}">${sigWord(b)} ${ASSETS[b.a].name}</b><br><span class="label">ثقة ${b.conf}% · ${b.aligned}/${b.nTf} أطر</span></span><span class="num gold" style="font-size:20px">${b.conf}%</span></span></button>`; })()
    : `<a class="card bestcard" href="#scanner"><span style="display:flex;align-items:center;gap:14px"><span class="miniradar" style="width:52px;height:52px"><span></span></span><span style="flex:1"><b style="font-size:16px">الماسح الذكي</b><br><span class="label">ابحث عن أفضل فرصة في كل الأسواق</span></span><span class="gold">‹</span></span></a>`;
  h=h.replace('<section class="card pad" aria-label="الجلسات">', pos+'\n'+best+'\n<section class="card pad" aria-label="الجلسات">');
  return h;
};
const homeAfter = AFTER.home;
AFTER.home = function(){ homeAfter(); const v=$('view'); v.querySelectorAll('[data-sheet]').forEach(b=>b.onclick=()=>{ S.asset=b.dataset.sheet; openSheet(b.dataset.sheet,S.tf); }); v.querySelectorAll('[data-act="scan"]').forEach(b=>b.onclick=()=>$('radarBtn').click()); };

/* ---------- extend more ---------- */
const moreBase=VIEWS.more;
VIEWS.more=function(){ let h=moreBase(); const extra=`<a class="mtile" href="#scanner" style="--tc:#f0d28f"><span class="mti"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 12l6-6"/></svg></span><b>الماسح الذكي</b><span class="label">أفضل الفرص الآن</span></a><a class="mtile" href="#positions" style="--tc:#3fb68b"><span class="mti"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 19V5M4 19h16"/><path d="M7 15l4-4 3 3 5-6"/></svg></span><b>صفقاتي التجريبية</b><span class="label">${S.positions.length} مفتوحة</span></a>`; return h.replace('<div class="tilegrid">','<div class="tilegrid">'+extra); };

/* ---------- extend chart header with candle countdown ---------- */
const chartBase=VIEWS.chart;
VIEWS.chart=function(){ return chartBase().replace('<div class="seg wide" id="tfs"', `<div class="cdrow"><span>إغلاق الشمعة <b class="num" id="cdown">${hms(candleLeft())}</b></span><span>${S.positions.filter(p=>p.a===S.asset).length?'<i class="ldot"></i>لديك صفقة مفتوحة':'RSI '+series(S.asset,S.tf).rsi.at(-1).toFixed(1)}</span></div>\n  <div class="seg wide" id="tfs"`); };

/* ---------- sheet: add open-position button ---------- */
const sheetBase=openSheet;
openSheet=function(a,tf){ sheetBase(a,tf); const w=$('sheet'); if(!w) return; const A=S.analysis[a+'|'+tf]; const g=w.querySelector('.sheet > div[style*="grid-template-columns:1fr 1fr"]'); if(!g) return;
  const b=document.createElement('button'); b.className='btn opentrade'; b.style.gridColumn='1/-1'; b.innerHTML='فتح صفقة تجريبية <span class="num" style="opacity:.75">· '+fmt(sizeFor(a,last(a),A.sl).units,2)+' وحدة</span>'; g.prepend(b);
  b.onclick=()=>{ openPosition(a,A); closeSheet(); if(['home','chart','positions'].includes(S.route)) render(); }; };

/* ---------- splash ---------- */
function splash(){
  let seen=false; try{ seen=sessionStorage.getItem('mr-splash')==='1'; sessionStorage.setItem('mr-splash','1'); }catch(e){}
  if(seen || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const sp=document.createElement('div'); sp.className='splash';
  sp.innerHTML=`<div style="text-align:center"><svg width="120" height="120" viewBox="0 0 72 72" aria-hidden="true"><circle class="sd" cx="36" cy="36" r="33" fill="none" stroke="#d4af6a" stroke-width="1.6"/><circle class="sd d2" cx="36" cy="36" r="22" fill="none" stroke="#d4af6a" stroke-width="1"/><path class="sd d3" d="M36 6v14M36 52v14M6 36h14M52 36h14" stroke="#d4af6a" stroke-width="1.6"/><path class="sd d4" d="M24 44l8-9 6 5 10-13" fill="none" stroke="#f0d28f" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg><div class="spname">رادار <span>الأسواق</span></div><div class="spsub">MARKET · RADAR · PRO</div></div>`;
  document.body.appendChild(sp); setTimeout(()=>sp.classList.add('out'),1700); setTimeout(()=>sp.remove(),2300);
}
setInterval(()=>{ const c=$('cdown'); if(c) c.textContent=hms(candleLeft()); const n=$('nsCd'); if(n){ const ns=nextSession(); if(ns) n.textContent=hms(ns.dh*3600); } },1000);


/* =========================================================
   PERSONAL BRAND — Mohammed Baqer
   ========================================================= */
const ME = {name:'محمد باقر', latin:'MOHAMMED BAQER', brand:'BAQER SNIPER', role:'محلل أسواق الذهب والعملات والكريبتو', photo:'assets/baqer.jpg', book:'assets/book.jpg', insta:'@_9hamody'};
ROUTES.push({id:'about',name:'عن المحلل',icon:''});
SUB.about='عن المحلل';

/* avatar with photo everywhere */
const photoAv=(size,cls)=>`<span class="pav ${cls||''}" style="width:${size}px;height:${size}px"><img src="${ME.photo}" alt="${ME.name}" width="${size}" height="${size}"></span>`;

VIEWS.about = function(){
  return `
  <section class="aboutHero">
    <img class="ahimg" src="${ME.photo}" alt="${ME.name}">
    <div class="ahshade"></div>
    <a href="#home" class="back ahback" aria-label="رجوع"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></a>
    <span class="vbrand ltr">${ME.brand} · 2026</span>
    <span class="scanline"></span>
    <div class="ahtext">
      <div class="eyebrow2 ltr">${ME.latin}</div>
      <h1>${ME.name}</h1>
      <p>${ME.role}</p>
      <div class="ahquote"><span class="ltr">MARKET IS A MAP.</span> السوق خريطة، والتحليل هو قراءتها.</div>
    </div>
  </section>

  <section class="card lux pad">
    <div class="sechead"><h2>نبذة</h2></div>
    <p class="abtxt">أقرأ حركة الذهب والعملات والكريبتو قراءة فنية واقتصادية، وأجمع في قرار واحد خمس مدارس: ICT وSMC، والدعم والمقاومة، وحركة السعر، ووايكوف، وإليوت وفيبوناتشي. هذا التطبيق هو طريقتي في التحليل، مبنية لتراها أنت خطوة بخطوة.</p>
    
  </section>

  <section aria-label="المنهج">
    <div class="sechead"><h2>منهجي في التحليل</h2></div>
    <div class="method">${[
      ['01','الهيكل والسيولة','أبدأ بقراءة اتجاه السوق ومناطق السيولة على الأطر الكبيرة.'],
      ['02','توافق المدارس','لا أدخل إلا إذا اتفقت أغلب المدارس الخمس على نفس الاتجاه.'],
      ['03','منطقة الدخول','أنتظر السعر في منطقة قوية ولا أطارد الحركة.'],
      ['04','إدارة المخاطرة','وقف واضح قبل الدخول، وعائد لا يقل عن ضعف المخاطرة.']
    ].map(([n,t,d])=>`<div class="mstep"><span class="mn num">${n}</span><b>${t}</b><span class="label">${d}</span></div>`).join('')}</div>
  </section>

  <section class="bookcard" aria-label="الكتاب">
    <img src="${ME.book}" alt="غلاف كتاب اكتشف أسرار الذهب">
    <div class="bk">
      <span class="label">كتابي · 2026</span>
      <h3>اكتشف أسرار الذهب</h3>
      <p>قراءة فنية واقتصادية لحركة الأسعار</p>
      <span class="ltr bken">Discover the Secrets of Gold</span>
      <button class="btn sm" data-act="book" style="margin-top:10px">احصل على الكتاب</button>
    </div>
  </section>

  <section class="card pad" aria-label="تواصل">
    <div class="sechead"><h2>تابعني</h2></div>
    <div class="social">
      <a class="soc ig" href="#" data-act="insta"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg><span><b>إنستغرام</b><br><span class="label">${ME.insta}</span></span></a>
      <a class="soc" href="#" data-act="channel"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M21 4L3 11l6 2 2 6 3-4 5 4z"/></svg><span><b>القناة</b><br><span class="label">[رابط قناتك]</span></span></a>
    </div>
  </section>

  <p class="note" style="text-align:center">تحليلات تعليمية للذهب والعملات والكريبتو · لا يوجد ربح مضمون</p>`;
};
AFTER.about = function(){
  const v=$('view');
  v.querySelectorAll('[data-act="book"],[data-act="channel"]').forEach(b=>b.onclick=e=>{ e.preventDefault(); island('قريباً','سيُضاف الرابط قريباً',''); });
};

/* home: photo avatar + analyst card */
const homeBase3 = VIEWS.home;
VIEWS.home = function(){
  let h = homeBase3();
  h = h.replace('<span class="avatar">ب</span>', `<a href="#about" aria-label="عن المحلل">${photoAv(46,'ring')}</a>`);
  h = h.replace('<div><div class="label">', '<div><div class="label">');
  h = h.replace(/<div class="hello">[\s\S]*?<\/div>/, `<div class="hello">${ME.name}</div>`);
  const A=S.analysis[S.asset+'|'+S.tf];
  const note = `<a class="card analyst" href="#about">
    ${photoAv(54,'ring')}
    <span style="flex:1;min-width:0"><span class="label">كلمة المحلل اليوم</span><br><b style="font-size:14.5px;line-height:1.6">${analystLine(A)}</b><br><span class="label">— ${ME.name}</span></span>
  </a>`;
  h = h.replace('<div class="qactions">', note+'\n  <div class="qactions">');
  return h;
};

/* more: profile with photo + about/book tiles */
const moreBase3 = VIEWS.more;
VIEWS.more = function(){
  let h = moreBase3();
  h = h.replace(/<section class="card lux pad profile">[\s\S]*?<\/section>/, `<a class="card lux pad profile" href="#about" style="text-decoration:none;color:inherit">${photoAv(60,'ring')}<div style="flex:1"><b style="font-size:17px">${ME.name}</b><div class="label">${ME.role}</div></div><span class="gold">‹</span></a>`);
  h = h.replace('<div class="tilegrid">', `<div class="tilegrid"><a class="mtile" href="#about" style="--tc:#d4af6a"><span class="mti"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg></span><b>عن المحلل</b><span class="label">${ME.name}</span></a><a class="mtile" href="#about" style="--tc:#e6c27a"><span class="mti"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/></svg></span><b>كتابي</b><span class="label">اكتشف أسرار الذهب</span></a>`);
  return h;
};

/* welcome screen (replaces logo splash) */
function splash(){
  let seen=false; try{ seen=sessionStorage.getItem('mr-welcome')==='1'; }catch(e){}
  if(seen) return;
  const w=document.createElement('div'); w.className='welcome'; w.setAttribute('role','dialog'); w.setAttribute('aria-label','مرحباً');
  w.innerHTML=`<div class="wframe">
    <img src="${ME.photo}" alt="${ME.name}" class="wimg">
    <div class="wshade"></div>
    <span class="vbrand ltr">${ME.brand} · 2026</span>
    <span class="scanline"></span>
    <div class="wtext">
      <h1 class="ltr"><span>MARKET</span><span>IS A MAP.</span></h1>
      <p class="war">السوق خريطة. تحليل تعليمي للذهب والعملات والكريبتو.</p>
      <p class="wen ltr">Educational analysis of gold, FX and crypto. No guaranteed profit.</p>
      <div class="wsig">${photoAv(34,'ring')}<span><b>${ME.name}</b><br><span class="label">${ME.role}</span></span></div>
      <button class="btn wenter" id="wEnter">ادخل إلى التطبيق</button>
      <button class="btn outline wabout" id="wAbout">من هو محمد باقر؟</button>
    </div></div>`;
  document.body.appendChild(w);
  const close=(to)=>{ try{ sessionStorage.setItem('mr-welcome','1'); }catch(e){} w.classList.add('out'); setTimeout(()=>w.remove(),600); if(to) location.hash=to; };
  $('wEnter').onclick=()=>close(); $('wAbout').onclick=()=>close('#about');
}


/* =========================================================
   WELCOME v2 — portal design
   ========================================================= */
function splash(){
  let seen=false; try{ seen=sessionStorage.getItem('mr-welcome2')==='1'; }catch(e){}
  if(seen) return;
  const ticks=[...Array(72)].map((_,i)=>{ const g=i/72*Math.PI*2, r1=i%6?146:139, r2=152; return `<line x1="${(160+Math.cos(g)*r1).toFixed(1)}" y1="${(160+Math.sin(g)*r1).toFixed(1)}" x2="${(160+Math.cos(g)*r2).toFixed(1)}" y2="${(160+Math.sin(g)*r2).toFixed(1)}" stroke="${i%6?'rgba(212,175,106,.35)':'#e9c36a'}" stroke-width="${i%6?1:2}"/>`; }).join('');
  const candles=[...Array(26)].map((_,i)=>{ const x=8+i*12.2, h=14+((i*37)%40), y=70-((i*53)%30)+i*1.2, up=(i*7)%3!==0; return `<rect x="${x}" y="${y}" width="6" height="${h}" rx="1" fill="${up?'#3fb68b':'#e5484d'}" opacity=".55"/><line x1="${x+3}" x2="${x+3}" y1="${y-6}" y2="${y+h+6}" stroke="${up?'#3fb68b':'#e5484d'}" opacity=".45"/>`; }).join('');
  const w=document.createElement('div'); w.className='portal'; w.setAttribute('role','dialog'); w.setAttribute('aria-label','مرحباً بك');
  w.innerHTML=`<div class="pframe">
    <div class="pglow"></div>
    <svg class="pcandles" viewBox="0 0 330 140" preserveAspectRatio="none" aria-hidden="true">${candles}</svg>
    <header class="ptop">
      <span class="plogo"><svg width="26" height="26" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="33" fill="none" stroke="#d4af6a" stroke-width="2"/><path d="M24 44l8-9 6 5 10-13" fill="none" stroke="#f0d28f" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><b class="ltr">BAQER SNIPER</b></span>
      <span class="plive"><i></i>الذهب <b class="num ltr" data-live="XAU" data-kind="raw">${fp('XAU',last('XAU'))}</b></span>
    </header>

    <div class="portrait">
      <svg class="pring" viewBox="0 0 320 320" aria-hidden="true">
        <defs><linearGradient id="pg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6dc9c"/><stop offset=".5" stop-color="#d4af6a"/><stop offset="1" stop-color="#7a5a20"/></linearGradient></defs>
        <g class="spin1">${ticks}</g>
        <circle cx="160" cy="160" r="132" fill="none" stroke="url(#pg)" stroke-width="3" stroke-dasharray="560 270" class="spin2" style="transform-origin:160px 160px"/>
        <g class="spin3" style="transform-origin:160px 160px"><circle cx="160" cy="18" r="5" fill="#f6dc9c"/><circle cx="160" cy="18" r="11" fill="none" stroke="rgba(246,220,156,.5)"/></g>
      </svg>
      <div class="pphoto"><img src="${ME.photo}" alt="${ME.name}"><span class="psweep"></span></div>
      <span class="ptag t1">ICT · SMC</span><span class="ptag t2">Wyckoff</span><span class="ptag t3">Elliott</span>
    </div>

    <div class="pname">
      <span class="pkick">أهلاً بك في رادار</span>
      <h1>محمد <span>باقر</span></h1>
      <p>أقرأ لك خريطة الذهب والعملات والكريبتو بخمس مدارس في قرار واحد.</p>
    </div>

    <div class="pstats">
      <div><b class="num">5</b><span>مدارس تحليل</span></div>
      <div><b class="num">${Object.keys(ASSETS).length}</b><span>أسواق مباشرة</span></div>
      <div><b class="num">3</b><span>أطر زمنية</span></div>
    </div>

    <div class="pslide" id="pslide">
      <span class="pstxt">اسحب للدخول</span>
      <span class="pchev" aria-hidden="true">‹‹‹</span>
      <button class="pknob" id="pknob" aria-label="ادخل إلى التطبيق"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1a1408" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>
    </div>
    <div class="plinks"><button id="pAbout">من هو محمد باقر؟</button><span>·</span><span class="mut">تحليل تعليمي · لا ربح مضمون</span></div>
  </div>`;
  document.body.appendChild(w);
  const close=(to)=>{ try{ sessionStorage.setItem('mr-welcome2','1'); }catch(e){} w.classList.add('out'); setTimeout(()=>w.remove(),700); if(to) location.hash=to; };
  $('pAbout').onclick=()=>close('#about');
  const knob=$('pknob'), track=$('pslide'); let x0=null, max=0, cur=0;
  const setX=v=>{ cur=Math.max(0,Math.min(max,v)); knob.style.transform=`translateX(${-cur}px)`; track.style.setProperty('--p',(cur/max||0).toFixed(3)); };
  knob.addEventListener('pointerdown',e=>{ x0=e.clientX; max=track.clientWidth-knob.offsetWidth-12; knob.setPointerCapture(e.pointerId); knob.style.transition='none'; });
  knob.addEventListener('pointermove',e=>{ if(x0==null) return; setX(x0-e.clientX); });
  const end=e=>{ if(x0==null) return; const moved=Math.abs(x0-e.clientX); x0=null; knob.style.transition=''; if(cur>max*.8 || moved<4){ setX(max); track.classList.add('done'); setTimeout(()=>close(),250); } else setX(0); };
  knob.addEventListener('pointerup',end); knob.addEventListener('pointercancel',end);
  knob.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); close(); } });
}


/* =========================================================
   ACCOUNTS + OWNER CONTROL PANEL (server: /api/auth/*, /api/app/*)
   Sign-in is enforced by the server before this page loads (email + 6-digit code).
   Only the owner (OWNER_EMAIL) can change the config, publish signals or see members.
   ========================================================= */
S.cfg = {}; S.sigs = []; S.members = []; S.isOwner = false; S.session = null; S.dbState = 'loading';
ROUTES.push({id:'admin',name:'لوحة التحكم',icon:''});
SUB.admin='لوحة التحكم';
const cfg = k => (S.cfg && S.cfg[k]) || '';
async function api(path, body){
  const r = await fetch(path, body===undefined ? {cache:'no-store', credentials:'same-origin'} : {method:'POST', credentials:'same-origin', headers:{'content-type':'application/json'}, body:JSON.stringify(body)});
  if(r.status===401){ location.reload(); throw new Error('signed_out'); }
  let j={}; try{ j=await r.json(); }catch(e){}
  if(!r.ok){ const e=new Error(j.error||('HTTP '+r.status)); e.code=j.error; throw e; }
  return j;
}
async function loadState(first){
  try{
    const j = await api('/api/app/state');
    S.session = j.me ? {name:j.me.name||'', email:j.me.email||''} : null;
    S.isOwner = !!(j.me && j.me.owner);
    S.cfg = j.cfg || {}; S.sigs = Array.isArray(j.sigs) ? j.sigs : [];
    S.dbState = j.kv ? 'ok' : 'nokv';
    if(S.isOwner && (first || S.route==='admin')){ try{ const m=await api('/api/app/members'); S.members=m.members||[]; }catch(e){} }
  }catch(e){ if(S.dbState==='loading') S.dbState='err'; }
  cloudChanged(first);
}
function cloudChanged(first){
  if(!S.loaded) return;
  if(S.cfg.maintenance && !S.isOwner) showMaintenance(); else hideMaintenance();
  if(first) navLinks();
  if(S.route==='admin'){ renderMembers(); renderAdminSigs(); const st=$('admState'); if(st) st.textContent=dbStateText(); return; }
  if(['home','about','more'].includes(S.route) && !document.querySelector('.sheetwrap') && !document.activeElement?.closest?.('input,textarea,select')) render();
}
const dbStateText=()=>({ok:'متصل ومحمي',loading:'جارِ الاتصال…',nokv:'التخزين غير مربوط بعد: اربط AUTH_KV في Cloudflare لحفظ التعديلات',err:'تعذّر الاتصال بالخادم'})[S.dbState]||'';

/* ---------- maintenance (the server also blocks everyone but the owner) ---------- */
function showMaintenance(){ if($('maint')) return; const m=document.createElement('div'); m.id='maint'; m.className='maint'; m.innerHTML=`<div>${photoAv(76,'ring')}<h2>التطبيق قيد التحديث</h2><p>${esc(cfg('maintenanceMsg')||'نعمل على تحسينات جديدة. نعود قريباً.')}</p><span class="label">— ${ME.name}</span></div>`; document.body.appendChild(m); }
function hideMaintenance(){ const m=$('maint'); if(m) m.remove(); }

function logout(){
  island('تم تسجيل الخروج','نراك قريباً','');
  fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'}).catch(()=>{}).then(()=>setTimeout(()=>location.reload(),400));
}
const firstName = () => (S.session && S.session.name ? S.session.name.split(/\s+/)[0] : '');

/* ---------- home: greeting, banner, analyst signals ---------- */
const homeBase5 = VIEWS.home;
VIEWS.home = function(){
  let h = homeBase5();
  if(firstName()) h = h.replace(/<div class="hello">[\s\S]*?<\/div>/, `<div class="hello">مرحباً، ${esc(firstName())}</div>`);
  if(cfg('analystNote')) h = h.replace(/(<span class="label">كلمة المحلل اليوم<\/span><br><b[^>]*>)[\s\S]*?(<\/b>)/, `$1${esc(cfg('analystNote'))}$2`);
  const banner = cfg('banner') && S.cfg.bannerOn ? `<div class="banner"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M16 9a4 4 0 0 1 0 6"/></svg><span>${esc(cfg('banner'))}</span></div>` : '';
  const act = S.sigs.filter(s=>s.active!==false && ASSETS[s.asset]);
  const sigs = act.length ? `<section aria-label="إشارات المحلل"><div class="sechead"><h2>إشارات المحلل</h2><span class="sub"><span class="official">رسمية</span></span></div><div class="sigrail">${act.slice(0,6).map(sigCard).join('')}</div></section>` : '';
  if(S.isOwner) h = h.replace('<div class="livestrip">', `<a class="ownerbar" href="#admin"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/></svg>وضع المالك · لوحة التحكم</a>\n  <div class="livestrip">`);
  h = h.replace('<div class="livestrip">', banner+'\n  <div class="livestrip">');
  h = h.replace('<a class="card analyst"', sigs+'\n  <a class="card analyst"');
  return h;
};
function sigCard(s){
  const a=s.asset, px=last(a), dec=ASSETS[a].dec, sell=!!s.sell;
  const mins=Math.max(0,Math.round((Date.now()-(s.at||Date.now()))/60000)), ago= mins<60? mins+' د' : mins<1440? Math.round(mins/60)+' س' : Math.round(mins/1440)+' ي';
  const n=v=>v!=null&&v!==''&&isFinite(+v)? fmt(+v,dec):'—';
  return `<article class="sigcard ${sell?'sell':'buy'}">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">${aicon(a,34)}<span style="flex:1"><b>${ASSETS[a].name}</b><br><span class="label">قبل ${ago}</span></span><span class="obadge ${sell?'pdn':'pup'}">${sell?'بيع':'شراء'}</span></div>
    <div class="sgrid"><div>دخول<b class="gold">${n(s.entry)}</b></div><div>وقف<b class="dn">${n(s.sl)}</b></div><div>هدف 1<b class="up">${n(s.tp1)}</b></div></div>
    ${s.note?`<p class="snote">${esc(s.note)}</p>`:''}
    <div class="label num ltr" style="text-align:right">الآن ${fmt(px,dec)}</div>
  </article>`;
}

/* ---------- about: owner-editable fields ---------- */
const aboutBase5 = VIEWS.about;
VIEWS.about = function(){
  let h=aboutBase5();
  if(cfg('bio')) h=h.replace(/<p class="abtxt">[\s\S]*?<\/p>/, `<p class="abtxt">${esc(cfg('bio')).replace(/\n/g,'<br>')}</p>`);
  if(cfg('insta')) h=h.replace(esc(ME.insta), esc(cfg('insta')));
  h=h.replace('[رابط قناتك]', cfg('channel')? esc(cfg('channel').replace(/^https?:\/\//,'')) : 'قريباً');
  return h;
};
const aboutAfter5 = AFTER.about;
AFTER.about = function(){
  aboutAfter5();
  const v=$('view'), link=(sel,url)=>{ const el=v.querySelector(sel); if(!el) return; if(/^https?:\/\//.test(url||'')){ el.href=url; el.target='_blank'; el.rel='noopener noreferrer'; el.onclick=null; } };
  const ig=cfg('insta')||ME.insta; link('[data-act="insta"]', /^https?:/.test(ig)? ig : 'https://instagram.com/'+String(ig).replace(/^@/,''));
  link('[data-act="channel"]', cfg('channel'));
  const bk=v.querySelector('[data-act="book"]'); if(bk && /^https?:\/\//.test(cfg('bookUrl'))){ bk.onclick=()=>{ const a=document.createElement('a'); a.href=cfg('bookUrl'); a.target='_blank'; a.rel='noopener noreferrer'; a.click(); }; }
};

/* ---------- more: owner tile + account ---------- */
const moreBase5 = VIEWS.more;
VIEWS.more = function(){
  let h=moreBase5();
  const acct = S.session ? `<section class="card pad acct"><span class="avatar" style="width:44px;height:44px;font-size:17px">${esc(firstName().slice(0,1)||'؟')}</span><div style="flex:1;min-width:0"><b>${esc(S.session.name)}</b><div class="label ltr" style="text-align:right;overflow:hidden;text-overflow:ellipsis">${esc(S.session.email||'')}</div><div class="label"><span class="up">● بريد مؤكد</span></div></div><button class="btn ghost sm" id="logout">خروج</button></section>` : '';
  const owner = S.isOwner ? `<a class="card lux pad ownercard" href="#admin"><span class="mti" style="--tc:#d4af6a;margin:0"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/></svg></span><span style="flex:1"><b style="font-size:16px">لوحة التحكم</b><br><span class="label">الإشارات الرسمية · الإعلان · الملف · الصيانة · المشتركون</span></span></a>` : '';
  return h.replace('<div class="tilegrid">', owner+acct+'<div class="tilegrid">');
};
const moreAfter5 = AFTER.more;
AFTER.more = function(){ moreAfter5(); const l=$('logout'); if(l) l.onclick=logout; };

/* ---------- ADMIN ---------- */
VIEWS.admin = function(){
  if(!S.isOwner) return backTo('لوحة التحكم','more')+`<section class="card pad" style="text-align:center"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#e5484d" stroke-width="1.6" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg><h2 style="font-family:var(--f-display);margin:8px 0 4px">هذه الصفحة للمالك فقط</h2><p class="mut" style="margin:0">لا يمكن لأي حساب آخر فتحها أو تعديل التطبيق.</p></section>`;
  const c=S.cfg;
  return backTo('لوحة التحكم','more')+`<div class="admin">
  <section class="card lux pad admhero">
    <div style="display:flex;align-items:center;gap:12px">${photoAv(52,'ring')}<div style="flex:1"><div class="label">أهلاً ${esc(firstName()||ME.name)}</div><b style="font-size:18px">أنت المالك</b><div class="label" id="admState">${dbStateText()}</div></div></div>
    <div class="admstats"><div><b class="num" id="mCount">${S.members.length}</b><span>مشترك</span></div><div><b class="num">${S.sigs.filter(s=>s.active!==false).length}</b><span>إشارة نشطة</span></div><div><b>${c.maintenance?'<span class="dn">صيانة</span>':'<span class="up">يعمل</span>'}</b><span>حالة التطبيق</span></div></div>
    <p class="note" style="margin-top:10px">كل ما تحفظه هنا يظهر لجميع المستخدمين، ولا يملك أحد غيرك صلاحية تعديله (يتحقق الخادم من إيميلك).</p>
  </section>

  <section class="card pad"><div class="sechead"><h2>نشر إشارة رسمية</h2></div>
    <form id="sigForm" class="grid" style="gap:10px">
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
        <label class="field">الأصل<select id="sA">${Object.keys(ASSETS).map(k=>`<option value="${k}">${ASSETS[k].name}</option>`).join('')}</select></label>
        <label class="field">الاتجاه<select id="sD"><option value="sell">بيع</option><option value="buy">شراء</option></select></label>
        <label class="field">الدخول<input id="sE" type="number" step="any" inputmode="decimal" required></label>
        <label class="field">الوقف<input id="sS" type="number" step="any" inputmode="decimal" required></label>
        <label class="field">الهدف 1<input id="sT1" type="number" step="any" inputmode="decimal"></label>
        <label class="field">الهدف 2<input id="sT2" type="number" step="any" inputmode="decimal"></label>
      </div>
      <label class="field">الهدف 3<input id="sT3" type="number" step="any" inputmode="decimal"></label>
      <label class="field">ملاحظة للمتابعين<input id="sN" maxlength="140" placeholder="مثال: انتظر الارتداد ولا تطارد السعر"></label>
      <div style="display:flex;gap:8px"><button class="btn" type="submit" style="flex:1">نشر الإشارة</button><button class="btn ghost" type="button" id="sFill">من آخر تحليل</button></div>
    </form>
    <div class="sechead" style="margin-top:16px"><h2>الإشارات المنشورة</h2></div>
    <ul class="list" id="admSigs"></ul>
  </section>

  <section class="card pad"><div class="sechead"><h2>كلمة المحلل والإعلان</h2></div>
    <label class="field">كلمة المحلل اليوم (تظهر في الرئيسية)<textarea id="cNote" rows="3" maxlength="220" class="ta">${esc(c.analystNote||'')}</textarea></label>
    <label class="field" style="margin-top:10px">إعلان أعلى الرئيسية<input id="cBanner" maxlength="120" value="${esc(c.banner||'')}" placeholder="مثال: بث مباشر الليلة 9 مساءً"></label>
    <div class="setrow"><span>إظهار الإعلان</span><button class="switch" role="switch" id="cBannerOn" aria-checked="${!!c.bannerOn}" aria-label="إظهار الإعلان"></button></div>
    <button class="btn" id="saveNote" style="width:100%">حفظ</button>
  </section>

  <section class="card pad"><div class="sechead"><h2>ملفي وروابطي</h2></div>
    <label class="field">النبذة<textarea id="cBio" rows="4" maxlength="600" class="ta">${esc(c.bio||'')}</textarea></label>
    <div class="grid" style="gap:10px;margin-top:10px">
      <label class="field">إنستغرام (اسم الحساب أو الرابط)<input id="cInsta" dir="ltr" value="${esc(c.insta||'')}" placeholder="@_9hamody"></label>
      <label class="field">رابط القناة<input id="cChannel" dir="ltr" value="${esc(c.channel||'')}" placeholder="https://"></label>
      <label class="field">رابط الكتاب<input id="cBook" dir="ltr" value="${esc(c.bookUrl||'')}" placeholder="https://"></label>
    </div>
    <button class="btn" id="saveProfile" style="width:100%;margin-top:12px">حفظ الملف</button>
  </section>

  <section class="card pad"><div class="sechead"><h2>وضع الصيانة</h2></div>
    <div class="setrow"><span>إغلاق التطبيق مؤقتاً للجميع عداك</span><button class="switch" role="switch" id="cMaint" aria-checked="${!!c.maintenance}" aria-label="وضع الصيانة"></button></div>
    <label class="field">رسالة الصيانة<input id="cMaintMsg" maxlength="120" value="${esc(c.maintenanceMsg||'')}" placeholder="نعمل على تحسينات جديدة. نعود قريباً."></label>
  </section>

  <section class="card pad"><div class="sechead"><h2>المشتركون</h2><span class="sub" id="mCount2">${S.members.length}</span></div>
    <p class="label" style="margin:0 0 8px">كل من أكّد بريده ودخل التطبيق.</p>
    <ul class="list" id="admMembers"></ul>
  </section>
  </div>`;
};
async function saveCfg(patch, ok){
  try{ const j=await api('/api/app/config', patch); S.cfg=j.cfg||S.cfg; island('تم الحفظ', ok||'التعديل ظاهر للجميع الآن','buy'); return true; }
  catch(e){ island('تعذّر الحفظ', e.code==='forbidden'?'ليست لديك صلاحية التعديل': e.code==='no_kv'?'اربط AUTH_KV في Cloudflare أولاً':'حاول مرة أخرى', 'sell'); return false; }
}
async function sigOp(body, ok){
  try{ const j=await api('/api/app/signal', body); S.sigs=j.sigs||S.sigs; renderAdminSigs(); if(ok) island(ok[0], ok[1], 'buy'); return true; }
  catch(e){ island('تعذّر التنفيذ', e.code==='no_kv'?'اربط AUTH_KV في Cloudflare أولاً':'حاول مرة أخرى','sell'); return false; }
}
function renderAdminSigs(){
  const ul=$('admSigs'); if(!ul) return;
  ul.textContent='';
  if(!S.sigs.length){ ul.innerHTML='<li><p class="empty" style="padding:10px 0">لم تنشر أي إشارة بعد.</p></li>'; return; }
  S.sigs.forEach(s=>{
    const li=document.createElement('li'); li.className='admsig';
    const sp=document.createElement('span');
    sp.innerHTML=`${ASSETS[s.asset]?ASSETS[s.asset].name:esc(s.asset)} <span class="${s.sell?'dn':'up'}">${s.sell?'بيع':'شراء'}</span> <span class="num ltr mut">${s.entry??''}</span>${s.active===false?' <span class="tag mut">موقوفة</span>':''}`;
    const btns=document.createElement('span'); btns.style.cssText='display:flex;gap:6px';
    const tg=document.createElement('button'); tg.className='btn ghost sm'; tg.textContent=s.active===false?'تفعيل':'إيقاف'; tg.onclick=()=>sigOp({op:'toggle', id:s.id});
    const rm=document.createElement('button'); rm.className='mini'; rm.textContent='×'; rm.setAttribute('aria-label','حذف');
    rm.onclick=()=>{ if(rm.dataset.armed!=='1'){ rm.dataset.armed='1'; rm.textContent='تأكيد'; rm.style.width='auto'; rm.style.padding='0 8px'; setTimeout(()=>{ rm.dataset.armed=''; rm.textContent='×'; rm.style.width=''; rm.style.padding=''; },3000); return; } sigOp({op:'delete', id:s.id},['حُذفت الإشارة','لم تعد ظاهرة']); };
    btns.append(tg, rm); li.append(sp, btns); ul.appendChild(li);
  });
}
function renderMembers(){
  const ul=$('admMembers');
  if(ul){ ul.textContent=''; if(!S.members.length) ul.innerHTML='<li><p class="empty" style="padding:10px 0">لا يوجد مشتركون بعد.</p></li>';
    S.members.forEach(m=>{ const li=document.createElement('li'); li.className='admmem'; const a=document.createElement('span'); const b=document.createElement('b'); b.textContent=m.name||'—';
      const e=document.createElement('span'); e.className='label ltr'; e.style.display='block'; e.style.textAlign='right'; e.textContent=m.email||'';
      a.append(b,e); const d=document.createElement('span'); d.className='label num'; d.textContent=new Date(m.lastSeen||m.joinedAt||Date.now()).toLocaleDateString('ar',{day:'numeric',month:'short'});
      li.append(a,d); ul.appendChild(li); }); }
  ['mCount','mCount2'].forEach(id=>{ const el=$(id); if(el) el.textContent=S.members.length; });
}
AFTER.admin = function(){
  if(!S.isOwner) return;
  renderAdminSigs(); renderMembers();
  api('/api/app/members').then(m=>{ S.members=m.members||[]; renderMembers(); }).catch(()=>{});
  $('sFill').onclick=()=>{ const a=$('sA').value, A=planOf(a,S.tf)||(analyze(a,S.tf), planOf(a,S.tf)); if(!A){ island('لا توجد إشارة مؤكدة', ASSETS[a].name+' · '+S.tf+' · اكتب القيم بنفسك',''); return; } const d=ASSETS[a].dec; $('sD').value=A.sell?'sell':'buy'; $('sE').value=A.mid.toFixed(d); $('sS').value=A.sl.toFixed(d); $('sT1').value=A.tps[0].toFixed(d); $('sT2').value=A.tps[1].toFixed(d); $('sT3').value=A.tps[2].toFixed(d); };
  $('sigForm').onsubmit=async e=>{ e.preventDefault();
    const num=id=>{ const v=parseFloat($(id).value); return isFinite(v)?v:null; };
    const doc={op:'add', asset:$('sA').value, sell:$('sD').value==='sell', entry:num('sE'), sl:num('sS'), tp1:num('sT1'), tp2:num('sT2'), tp3:num('sT3'), note:$('sN').value.trim().slice(0,140)};
    if(doc.entry==null||doc.sl==null){ island('ناقص','اكتب الدخول والوقف','sell'); return; }
    if(doc.sell? doc.sl<=doc.entry : doc.sl>=doc.entry){ island('تحقق من الوقف', doc.sell?'وقف البيع يكون فوق الدخول':'وقف الشراء يكون تحت الدخول','sell'); return; }
    if(await sigOp(doc,['نُشرت الإشارة', ASSETS[doc.asset].name+' · ظاهرة للجميع'])) e.target.reset(); };
  $('cBannerOn').onclick=e=>{ const b=e.currentTarget; b.setAttribute('aria-checked', String(b.getAttribute('aria-checked')!=='true')); };
  $('saveNote').onclick=()=>saveCfg({analystNote:$('cNote').value.trim(), banner:$('cBanner').value.trim(), bannerOn:$('cBannerOn').getAttribute('aria-checked')==='true'});
  $('saveProfile').onclick=()=>saveCfg({bio:$('cBio').value.trim(), insta:$('cInsta').value.trim(), channel:$('cChannel').value.trim(), bookUrl:$('cBook').value.trim()},'ملفك محدّث للجميع');
  $('cMaint').onclick=async e=>{ const on=e.currentTarget.getAttribute('aria-checked')!=='true'; if(await saveCfg({maintenance:on, maintenanceMsg:$('cMaintMsg').value.trim()}, on?'التطبيق مغلق للجميع عداك':'التطبيق مفتوح للجميع')) render(); };
};

/* ---------- greeting after the welcome screen ---------- */
const splashBase5 = splash;
splash = function(){
  splashBase5();
  const hi=()=>{ if(firstName()) island('مرحباً '+firstName(), 'أهلاً بك في '+ME.brand,'buy'); };
  const portal=document.querySelector('.portal');
  if(portal){ const obs=new MutationObserver(()=>{ if(!document.querySelector('.portal')){ obs.disconnect(); setTimeout(hi,350); } }); obs.observe(document.body,{childList:true}); }
  else setTimeout(hi,1500);
};


/* ---------- result sheet when there is no confirmed setup ---------- */
const sheetWithTrade = openSheet;
openSheet = function(a, tf){
  const A=S.analysis[a+'|'+tf]; if(!A) return;
  if(!A.wait) return sheetWithTrade(a, tf);
  closeSheet(true);
  const w=document.createElement('div'); w.className='sheetwrap'; w.id='sheet';
  const rows=A.votes.map(v=>`<div class="lrow"><span class="ldot" style="background:${v.bull?C.buy:v.bear?C.sell:C.muted}"></span><span class="mut">${esc(v.k)}</span><b style="font-weight:500;color:${v.bull?C.buy:v.bear?C.sell:C.muted}">${esc(v.v)}</b></div>`).join('');
  const mt=A.mtf.map(m=>{ const b=frameBias(m.votes); return `<span style="background:${b==='bear'?'rgba(229,72,77,.16)':b==='bull'?'rgba(63,182,139,.16)':'#1e1c19'};color:${b==='bear'?C.sell:b==='bull'?C.buy:C.muted}">${m.tf} ${b==='bear'?'↓':b==='bull'?'↑':'•'}</span>`; }).join('');
  w.innerHTML=`<div class="sheet reveal" role="dialog" aria-label="نتيجة التحليل">
    <div class="handle"></div>
    <div class="decision"><div><div class="label">${ASSETS[a].name} · <span class="ltr">${tf}</span> · شموع مغلقة</div><h2 style="color:${C.gold}">${decTitle(A)}</h2><div class="label">لا توجد صفقة مؤكدة الآن</div></div>${gauge(A.conf, C.gold)}</div>
    <div class="label" style="margin:12px 0 4px">المدارس الخمس على <span class="ltr">${tf}</span></div><div class="list">${rows}</div>
    <div class="label" style="margin:12px 0 6px">اتجاه الأطر</div><div class="mtfchips">${mt}</div>
    ${miniPlan(a,A)}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px"><button class="btn" id="shChart">على الشارت</button><button class="btn ghost" id="shClose">إغلاق</button></div></div>`;
  document.body.appendChild(w); requestAnimationFrame(()=>w.classList.add('open'));
  w.addEventListener('click',e=>{ if(e.target===w) closeSheet(); });
  $('shClose').onclick=()=>closeSheet();
  $('shChart').onclick=()=>{ S.asset=a; S.tf=tf; closeSheet(); if(S.route==='chart') render(); else location.hash='#chart'; };
  document.addEventListener('keydown',escSheet);
};
const scannerView = VIEWS.scanner;
VIEWS.scanner = function(){
  const L=S.scan;
  if(L && L.list.length && L.list[0].wait){
    const head=backTo('الماسح الذكي','home');
    return head+`<section class="card lux pad" style="text-align:center"><div class="miniradar" style="margin:6px auto 14px;width:90px;height:90px"><span></span></div><h2 style="font-family:var(--f-display);font-size:22px;margin:0 0 6px">لا توجد صفقة مؤكدة الآن</h2><p class="mut" style="margin:0 0 14px;line-height:1.7">مسحنا ${L.list.length} أسواق على <span class="ltr">${S.tf}</span>. التطبيق ينبّهك عند ظهور إشارة.</p><button class="btn" id="doScan">مسح جديد</button></section>
    <div class="card" style="padding:4px 14px"><ul class="list">${L.list.map((A,k)=>`<li><button class="scanrow" data-sheet="${A.a}"><span class="rank num">${k+1}</span>${aicon(A.a,36)}<span style="min-width:0;text-align:right"><b>${ASSETS[A.a].name}</b><br><span class="label" style="color:${decCol(A)}">${sigWord(A)} · ${A.bias==='neutral'?'بدون ميل':(A.sell?'ميل هابط':'ميل صاعد')}</span></span><span class="sbar"><i style="width:${A.conf}%;background:${C.muted}"></i></span><b class="num" style="font-weight:500">${A.conf}%</b></button></li>`).join('')}</ul></div>
    <p class="note">تحليل تعليمي من شموع مغلقة · ليس نصيحة مالية.</p>`;
  }
  return scannerView();
};

/* ---------- the five schools: a page per timeframe ----------
   Every school's full reading (lines, key levels, strength) on 15m / 1H / 4H, plus the
   confluence matrix and one price ladder of all levels. Closed candles only. */
ROUTES.push({id:'schools',name:'المدارس والأطر',icon:''});
SUB.schools='المدارس والأطر';
S.schTf=null; S.schFocus=null;
function openSchools(a, tf, focus){ if(a) S.asset=a; S.schTf=tf||S.tf; S.schFocus=focus||null; closeSheet(true); if(S.route==='schools') render(); else location.hash='#schools'; }
const BIAS_AR={bull:'صاعد',bear:'هابط',neutral:'محايد'};
const biasCol=b=>b==='bull'?C.buy:b==='bear'?C.sell:C.muted;
const biasIco=b=>b==='bull'?'▲':b==='bear'?'▼':'●';
VIEWS.schools = function(){
  const a=S.asset, tf=S.schTf||S.tf, ids=enabledIds();
  const frames={}; Object.keys(TFS).forEach(t=>{ frames[t]=schoolsOf(a,t); });
  const f=frames[tf];
  const rowsOf=t=>frames[t]? frames[t].rows.filter(r=>ids.includes(r.id)) : [];
  const fb=t=>frameBias(frameVotes(a,t));
  const mtfBias=Object.keys(TFS).map(fb), bulls=mtfBias.filter(b=>b==='bull').length, bears=mtfBias.filter(b=>b==='bear').length, n=mtfBias.length;
  const conf = bulls===n?'توافق كامل صاعد':bears===n?'توافق كامل هابط':bulls>=2&&!bears?'توافق جزئي صاعد':bears>=2&&!bulls?'توافق جزئي هابط':bulls&&bears?'تعارض بين الأطر · الأفضل الانتظار':'لا اتجاه واضح على الأطر';
  const confC = bulls>=2&&!bears?C.buy:bears>=2&&!bulls?C.sell:C.gold;
  const P=planOf(a,tf), price=last(a);
  const head=backTo('المدارس والأطر','chart');
  const chips=`<div class="hscroll" role="group" aria-label="الأصل">${Object.keys(ASSETS).map(k=>`<button class="chip" data-sa="${k}" aria-pressed="${k===a}">${ASSETS[k].name}</button>`).join('')}</div>`;
  const tabs=`<div class="seg wide" role="group" aria-label="الإطار الزمني">${Object.keys(TFS).map(t=>`<button data-stf="${t}" aria-pressed="${t===tf}">${t}</button>`).join('')}</div>`;
  const matrix=`<section class="card pad"><div class="sechead"><h2>توافق الأطر</h2><span class="sub" style="color:${confC}">${conf}</span></div>
    <table class="matrix"><thead><tr><th></th>${Object.keys(TFS).map(t=>`<th><button class="linkbtn" data-stf="${t}" style="${t===tf?'color:var(--gold);font-weight:700':''}">${t}</button></th>`).join('')}</tr></thead><tbody>
    ${ids.map(id=>`<tr><td style="font-family:var(--f-body)">${SCHOOLS.NAMES[id].ar}</td>${Object.keys(TFS).map(t=>{ const r=rowsOf(t).find(x=>x.id===id); return `<td style="color:${r&&r.ready?biasCol(r.bias):C.muted}">${r&&r.ready?biasIco(r.bias)+' '+r.strength+'%':'—'}</td>`; }).join('')}</tr>`).join('')}
    <tr><td style="font-family:var(--f-body);color:var(--gold)">الحكم</td>${Object.keys(TFS).map((t,k)=>`<td style="color:${biasCol(mtfBias[k])};font-weight:700">${biasIco(mtfBias[k])} ${BIAS_AR[mtfBias[k]]}</td>`).join('')}</tr>
    </tbody></table></section>`;
  if(!f) return head+chips+tabs+`<section class="card pad"><p class="empty">بيانات هذا الفريم غير كافية الآن.</p></section>`;
  const vb=fb(tf), rs=rowsOf(tf), agree=rs.filter(r=>r.ready&&r.bias===vb).length, ready=rs.filter(r=>r.ready).length;
  const summary=`<section class="card lux ${P?(P.sell?'sell':'buy'):''} pad">
    <div class="decision"><div><div class="label">${ASSETS[a].name} · <span class="ltr">${tf}</span> · شموع مغلقة</div>
      <h2 style="color:${P?decCol(P):biasCol(vb)}">${P?decTitle(P):(vb==='neutral'?'لا اتجاه واضح':'الميل '+BIAS_AR[vb])}</h2>
      <div class="label">${vb==='neutral'?'المدارس غير متفقة':agree+' من '+ready+' مدارس '+(vb==='bull'?'صاعدة':'هابطة')}</div></div>
      <div style="text-align:center"><b class="num" style="font-size:22px;font-weight:500" data-live="${a}" data-kind="raw">${fp(a,price)}</b><div class="label">السعر الآن</div></div></div>
    ${P?miniPlan(a,P)+`<button class="btn" data-plan style="width:100%;margin-top:12px">الخطة الكاملة</button>`:`<p class="note" style="margin:10px 0 0">لا توجد صفقة مؤكدة على هذا الفريم الآن.</p>`}
  </section>`;
  const cards=rs.map(r=>`<section class="card pad" id="sc-${r.id}" style="${S.schFocus===r.id?'border-color:var(--gold);box-shadow:0 0 0 1px var(--gold) inset':''}">
    <div class="sechead" style="margin-bottom:6px"><h2>${r.title.ar}</h2><span class="tag" style="color:${r.ready?biasCol(r.bias):C.muted}">${r.ready?BIAS_AR[r.bias]+' · '+r.strength+'%':'غير جاهز'}</span></div>
    <div class="cbar" style="margin:2px 0 10px"><i style="width:${r.strength}%;background:${biasCol(r.bias)};color:${biasCol(r.bias)}"></i></div>
    <b style="color:var(--gold-hi,#f0d28f);font-size:14px">${esc(r.label.ar)}</b>
    <ul class="list" style="margin-top:6px">${r.lines.ar.map(l=>`<li style="padding:6px 0;font-size:13px;color:var(--muted)">${esc(l)}</li>`).join('')}</ul>
    ${r.levels.length?`<div class="chips" style="margin-top:8px">${r.levels.filter(q=>isFinite(q.price)).map(q=>`<span class="mchip">${esc(q.name)}<b>${fp(a,q.price)}</b></span>`).join('')}</div>`:''}
  </section>`).join('');
  const lv=[]; rs.forEach(r=>r.levels.forEach(q=>{ if(isFinite(q.price)) lv.push({n:q.name, s:r.title.ar, p:q.price}); }));
  lv.push({n:'السعر', s:'', p:price, now:true}); lv.sort((x,y)=>y.p-x.p);
  const ladder=`<section class="card pad"><div class="sechead"><h2>سلّم المستويات</h2><span class="sub">كل المدارس · <span class="ltr">${tf}</span></span></div>
    <div class="list">${lv.map(q=>`<div class="lrow" style="${q.now?'background:rgba(212,175,106,.12);border-radius:10px;padding-inline:8px':''}"><span class="ldot" style="background:${q.now?C.gold:q.p>price?C.sell:C.buy}"></span><span class="${q.now?'gold':'mut'}">${esc(q.n)}${q.s?' · '+q.s:''}</span><b class="num ltr" style="font-weight:500;color:${q.now?C.gold:q.p>price?C.sell:C.buy}">${fp(a,q.p)}</b></div>`).join('')}</div>
  </section>`;
  return head+chips+tabs+summary+matrix+cards+ladder+`<p class="note">تحليل تعليمي من شموع مغلقة فقط · ليس نصيحة مالية. المدارس المفعّلة تُختار من الإعدادات.</p>`;
};
AFTER.schools = function(){
  const v=$('view');
  v.querySelectorAll('[data-sa]').forEach(b=>b.onclick=()=>{ S.asset=b.dataset.sa; S.schFocus=null; render(); });
  v.querySelectorAll('[data-stf]').forEach(b=>b.onclick=()=>{ S.schTf=b.dataset.stf; S.schFocus=null; render(); });
  const pl=v.querySelector('[data-plan]'); if(pl) pl.onclick=()=>openSheet(S.asset, S.schTf||S.tf);
  if(S.schFocus){ const el=$('sc-'+S.schFocus); if(el) setTimeout(()=>el.scrollIntoView({behavior:'smooth',block:'center'}),80); }
};
// Entry points: the result sheet, the chart and the More screen.
const sheetBeforeSchools = openSheet;
openSheet = function(a, tf){
  sheetBeforeSchools(a, tf);
  const w=$('sheet'); if(!w) return;
  const box=w.querySelector('.sheet'); if(!box) return;
  const b=document.createElement('button'); b.className='btn outline'; b.style.cssText='width:100%;margin-top:10px';
  b.textContent='تفاصيل المدارس الخمس على كل الأطر'; b.onclick=()=>openSchools(a, tf);
  box.appendChild(b);
};
const chartBeforeSchools = VIEWS.chart;
VIEWS.chart = function(){ return chartBeforeSchools().replace('<div class="cactions">', '<button class="btn ghost" id="cSchools" style="width:100%">المدارس الخمس على '+S.tf+' · صفحة الفريم</button>\n  <div class="cactions">'); };
const chartAfterSchools = AFTER.chart;
AFTER.chart = function(){ chartAfterSchools(); const b=$('cSchools'); if(b) b.onclick=()=>openSchools(S.asset, S.tf); };
const moreBeforeSchools = VIEWS.more;
VIEWS.more = function(){ return moreBeforeSchools().replace('<div class="tilegrid">', `<div class="tilegrid"><a class="mtile" href="#schools" style="--tc:#f0d28f"><span class="mti"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="1.6"/><circle cx="14" cy="12" r="1.6"/><circle cx="10" cy="18" r="1.6"/></svg></span><b>المدارس والأطر</b><span class="label">5 مدارس · 3 أطر</span></a>`); };

/* ---------- phone notifications (Web Push from the server monitor) ---------- */
function b64uToU8(b){ const p='='.repeat((4-b.length%4)%4), s=atob((b+p).replace(/-/g,'+').replace(/_/g,'/')), u=new Uint8Array(s.length); for(let i=0;i<s.length;i++) u[i]=s.charCodeAt(i); return u; }
async function enablePush(){
  try{
    if(!window.PUSH_WORKER || !('serviceWorker' in navigator) || !('PushManager' in window)) return false;
    const reg=await navigator.serviceWorker.register('sw.js');
    let sub=await reg.pushManager.getSubscription();
    if(!sub){ const j=await (await fetch(PUSH_WORKER+'/vapid-public',{cache:'no-store'})).json(); sub=await reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:b64uToU8(j.key)}); }
    const r=await fetch(PUSH_WORKER+'/subscribe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(sub)});
    return r.ok;
  }catch(e){ return false; }
}
async function disablePush(){
  try{ const reg=await navigator.serviceWorker.getRegistration('sw.js'); const sub=reg && await reg.pushManager.getSubscription(); if(!sub) return;
    await fetch(PUSH_WORKER+'/unsubscribe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({endpoint:sub.endpoint})}); await sub.unsubscribe(); }catch(e){}
}

/* ---------- boot: real data first, then the app ---------- */
function bootScreen(msg, err){
  const v=$('view'); if(!v) return;
  v.innerHTML=`<div class="screen"><section class="card lux pad" style="text-align:center;margin-top:30vh"><div class="miniradar" style="margin:0 auto 14px;width:80px;height:80px"><span></span></div><b style="font-size:16px">${msg}</b>${err?'<p class="mut" style="margin:10px 0 14px;line-height:1.7">تحقق من الإنترنت ثم أعد المحاولة.</p><button class="btn" onclick="location.reload()">إعادة المحاولة</button>':''}</section></div>`;
}
// The app runs only on its real address, where the server checks the email sign-in. Copies of the
// files served elsewhere (for example GitHub Pages) stop here.
if(!/(^|\.)baqersniper\.pages\.dev$|^localhost$|^127\.0\.0\.1$/.test(location.hostname)){
  document.body.innerHTML='<div style="min-height:100vh;display:grid;place-items:center;background:#0a0a0b;color:#f4efe6;font-family:Tahoma,Arial,sans-serif;text-align:center;padding:16px"><div><b style="color:#d4af6a;letter-spacing:.3em">BAQER SNIPER</b><p>افتح التطبيق من رابطه الرسمي</p><a style="color:#f6dc9c" href="https://baqersniper.pages.dev">baqersniper.pages.dev</a></div></div>';
  throw new Error('wrong host');
}
navLinks(); updateSess(); startFx(); splash();
bootScreen('جارٍ تحميل الأسعار الحية…');
loadState(true);
loadAll((d,n)=>bootScreen('جارٍ تحميل الأسعار الحية… '+Math.round(d/n*100)+'%')).then(n=>{
  if(!n){ bootScreen('تعذّر تحميل بيانات الأسواق', true); return; }
  buildTicker();
  startBiquote(); startBinance();
  backfillJournal(()=>{ Object.keys(S.analysis).forEach(k=>{ const [a,tf]=k.split('|'); analyze(a,tf); }); autoScan(); if(['home','chart','scanner'].includes(S.route) && !document.querySelector('.sheetwrap')) render(); });
  rebuildJournal();
  window.addEventListener('hashchange',route);
  route();
  cloudChanged(false);
  loadNews();
  loadServerOpen(); setInterval(loadServerOpen,60000);
  if(S.prefs.push && 'Notification' in window && Notification.permission==='granted') enablePush();
  setInterval(tick,1500); setInterval(updateSess,30000);
  setInterval(refreshClosed,15000); setInterval(pollBinance,5000);
  setInterval(()=>loadState(false),120000); setInterval(loadNews,30*60000);
  if(document.fonts&&document.fonts.ready) document.fonts.ready.then(()=>{ if(S.route==='chart') chartDraw(); });
});
})();
