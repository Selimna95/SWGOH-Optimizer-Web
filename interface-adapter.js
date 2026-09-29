/* Selimna's Holocron V100
   Interface adapter only.
   The data/relay/optimizer engine remains the V90 implementation. */
(function(){
  'use strict';

  const DEFAULT_RELAY='https://swgoh-optimizer-relay.lorg75017.workers.dev';

  function el(id){ return document.getElementById(id); }
  function text(id,v){ const n=el(id); if(n) n.textContent=String(v ?? ''); }
  function nfmt(v){ return Number(v||0).toLocaleString('fr-FR'); }

  function speedOf(mod){
    if(!mod) return 0;
    const vals=[];
    for(let i=1;i<=4;i++){
      const stat=String(mod['secondary_'+i+'_stat']||'').toLowerCase();
      const value=Number(mod['secondary_'+i+'_value']||0);
      if(stat.includes('speed') && Number.isFinite(value)) vals.push(value);
    }
    return vals.reduce((a,b)=>a+b,0);
  }

  function renderBars(containerId, rows){
    const root=el(containerId); if(!root) return;
    const total=rows.reduce((a,r)=>a+r.value,0);
    root.innerHTML=rows.map(r=>{
      const pct=total ? Math.max(2,Math.round(r.value/total*100)) : 0;
      return `<div class="decision-bar-row">
        <span>${r.label}</span><div class="decision-bar-track"><i style="width:${pct}%"></i></div><b>${nfmt(r.value)}</b>
      </div>`;
    }).join('');
  }

  function renderLegend(id, rows){
    const root=el(id); if(!root) return;
    root.innerHTML=rows.map(r=>`<span><i></i>${r.label} <b>${nfmt(r.value)}</b></span>`).join('');
  }

  function renderDecision(){
    const chars=(typeof rosterCharacters!=='undefined' && Array.isArray(rosterCharacters))?rosterCharacters:[];
    const ships=(typeof rosterShips!=='undefined' && Array.isArray(rosterShips))?rosterShips:[];
    const allMods=(typeof mods!=='undefined' && Array.isArray(mods))?mods:[];
    const gp=(typeof accountGalacticPower!=='undefined' && accountGalacticPower)||{total:0,characters:0,ships:0};

    text('decisionProfileName',el('topAccountName')?.textContent||'ROSTER');
    text('charsCount',chars.length);
    text('modsCount',allMods.length);
    text('gpTotal',gp.total ? nfmt(gp.total) : '0');
    text('gpCharacters',gp.characters ? nfmt(gp.characters) : '0');
    text('gpShips',gp.ships ? nfmt(gp.ships) : '0');

    const gpt=Number(gp.characters||0)+Number(gp.ships||0);
    const cp=gpt ? Math.round(Number(gp.characters||0)/gpt*100) : 0;
    const sp=gpt ? 100-cp : 0;
    text('gpCharPct',cp+'%'); text('gpShipPct',sp+'%');
    const cb=el('gpCharBar'), sb=el('gpShipBar');
    if(cb) cb.style.width=cp+'%'; if(sb) sb.style.width=sp+'%';

    // Roster ventilation: factual grouping by the roster's relic/gear fields.
    const groups=[
      {label:'R9+', value:chars.filter(c=>Number(c.relic||c.relicLevel||0)>=9).length},
      {label:'R7–8', value:chars.filter(c=>{const r=Number(c.relic||c.relicLevel||0);return r>=7&&r<9;}).length},
      {label:'R5–6', value:chars.filter(c=>{const r=Number(c.relic||c.relicLevel||0);return r>=5&&r<7;}).length},
      {label:'G13', value:chars.filter(c=>{const r=Number(c.relic||c.relicLevel||0);const g=Number(c.gear||c.gearLevel||0);return r<5&&g>=13;}).length},
      {label:'Autres', value:chars.filter(c=>{const r=Number(c.relic||c.relicLevel||0);const g=Number(c.gear||c.gearLevel||0);return r<5&&g<13;}).length}
    ];
    renderBars('unitVentilation',groups);
    renderLegend('unitLegend',groups);

    const speedGroups=[
      {label:'20+', value:allMods.filter(m=>speedOf(m)>=20).length},
      {label:'15–19', value:allMods.filter(m=>{const s=speedOf(m);return s>=15&&s<20;}).length},
      {label:'10–14', value:allMods.filter(m=>{const s=speedOf(m);return s>=10&&s<15;}).length},
      {label:'1–9', value:allMods.filter(m=>{const s=speedOf(m);return s>=1&&s<10;}).length},
      {label:'0', value:allMods.filter(m=>speedOf(m)<1).length}
    ];
    renderBars('modVentilation',speedGroups);
    renderLegend('modLegend',speedGroups);

    text('unitsDelta',ships.length ? `+${nfmt(ships.length)} V` : '—');
    text('modsDelta',allMods.length ? 'SYNC' : '—');
    text('decisionLastUpdate',new Date().toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}));
  }

  function showApp(){
    const gate=el('holocronGate'), shell=el('appShell');
    if(gate) gate.classList.add('gate-complete');
    if(shell) shell.hidden=false;
    renderDecision();
  }

  function setGate(msg,kind){
    const n=el('gateMessage'); if(n){n.textContent=msg;n.dataset.state=kind||'';}
  }

  function startLegacyLoad(){
    const input=el('gateAllyCode');
    const ally=String(input?.value||'').replace(/\D/g,'').slice(0,9);
    if(ally.length!==9){setGate('CODE ALLIÉ INVALIDE · 9 CHIFFRES ATTENDUS','error');return;}
    const relay=DEFAULT_RELAY;
    localStorage.setItem('swgohRelayUrl',relay);
    const gateRelay=el('gateRelayUrl'); if(gateRelay) gateRelay.value=relay;
    const legacy=el('allyCode'); if(legacy) legacy.value=ally;
    setGate('IDENTIFICATION DU ROSTER · CHARGEMENT DES DONNÉES','loading');
    const btn=el('gateActivate'); if(btn) btn.disabled=true;

    if(typeof window.loadRemotePlayer!=='function'){
      setGate('MOTEUR DE SYNCHRONISATION INDISPONIBLE','error');
      if(btn) btn.disabled=false;
      return;
    }
    // V90 catches its own errors. Poll the existing data state rather than
    // altering that technical loader.
    try{ window.loadRemotePlayer(); }catch(e){
      setGate('ÉCHEC DE SYNCHRONISATION · '+(e.message||e),'error');
      if(btn) btn.disabled=false;
      return;
    }

    const started=Date.now();
    const timer=setInterval(()=>{
      const data=(typeof currentData!=='undefined')?currentData:null;
      const chars=(typeof rosterCharacters!=='undefined' && Array.isArray(rosterCharacters))?rosterCharacters:[];
      const modsNow=(typeof mods!=='undefined' && Array.isArray(mods))?mods:[];
      if(data && (chars.length || modsNow.length)){
        clearInterval(timer);
        if(btn) btn.disabled=false;
        setGate('ROSTER SYNCHRONISÉ','ok');
        showApp();
      }else if(Date.now()-started>90000){
        clearInterval(timer);
        if(btn) btn.disabled=false;
        setGate('ÉCHEC DE SYNCHRONISATION · Consultez le journal de chargement.','error');
      }
    },300);
  }

  function init(){
    const gateBtn=el('gateActivate');
    if(gateBtn) gateBtn.addEventListener('click',startLegacyLoad);
    const code=el('gateAllyCode');
    if(code) code.addEventListener('keydown',e=>{if(e.key==='Enter')startLegacyLoad();});
    document.querySelectorAll('.holocron-face').forEach(btn=>{
      btn.addEventListener('click',()=>{
        if(typeof window.showPage==='function') window.showPage(btn.dataset.page);
      });
    });
    // The technical V90 engine updates its own counters. Refresh the visual
    // layer periodically without touching the data pipeline.
    setInterval(renderDecision,1000);
  }

  window.addEventListener('DOMContentLoaded',init);
})();
