let sithariFaction = 'Toutes les factions';
let sithariSearch = '';
let sithariSelectedKeys = [];
let sithariActiveKey = '';
let sithariKyberLoading = {};
let sithariKyberAttempted = {};

const SITHARI_SLOT_ORDER = ['Square','Arrow','Diamond','Triangle','Circle','Cross'];
const SITHARI_SLOT_LABEL = {Square:'CARRÉ',Arrow:'FLÈCHE',Diamond:'LOSANGE',Triangle:'TRIANGLE',Circle:'CERCLE',Cross:'CROIX'};
const SITHARI_FIXED_PRIMARY = {Square:'Offense',Diamond:'Defense'};

function sithariProfileForCharacter(c){
  const base=compactKey(c?.baseId||c?.base_id||'');
  const name=slug(c?.name||c?.character||'');
  if(profiles?.[name]) return profiles[name];
  if(base){
    for(const p of Object.values(profiles||{})) if(compactKey(p?.base_id||'')===base) return p;
  }
  const target=compactKey(c?.name||'');
  if(target) for(const p of Object.values(profiles||{})) if(compactKey(p?.character||p?.name||'')===target) return p;
  return null;
}
function sithariCharacterSpeed(c){
  return sithariCharacterMods(c).reduce((m,mod)=>Math.max(m,modTotalSpeed(mod)),0);
}
function sithariFilteredCharacters(){
  const search=compactKey(sithariSearch);
  return (charactersInFaction(sithariFaction||'Toutes les factions')||[])
    .filter(c=>rosterUnitType(c)!=='ship')
    .filter(c=>!search || compactKey(c?.name||c?.baseId||'').includes(search))
    .sort((a,b)=>String(a?.name||'').localeCompare(String(b?.name||''),'fr'));
}
function sithariModSecondaryMap(m){
  const out={};
  for(let i=1;i<=4;i++){const stat=String(m?.[`secondary_${i}_stat`]||'').trim();if(stat)out[stat]=Number(m?.[`secondary_${i}_value`]||0)||0;}
  return out;
}
function sithariCanonicalSet(value){
  const k=compactKey(value);
  const aliases={
    HEALTH:'HEALTH', OFFENSE:'OFFENSE', DEFENSE:'DEFENSE', SPEED:'SPEED',
    POTENCY:'POTENCY', TENACITY:'TENACITY', CRITCHANCE:'CRITICALCHANCE',
    CRITICALCHANCE:'CRITICALCHANCE', CRITDAMAGE:'CRITICALDAMAGE',
    CRITICALDAMAGE:'CRITICALDAMAGE'
  };
  return aliases[k]||k;
}
function sithariKyberSetRules(p){
  // Kyber's set section is a list of valid set choices. Do NOT turn that list
  // into an artificial 6-piece composition: a character with 4 Offense + 2
  // Health is valid when both Offense and Health are among Kyber's choices.
  const out=[]; const seen=new Set();
  const add=(name,weight,counts)=>{
    const canonical=sithariCanonicalSet(name); if(!canonical||seen.has(canonical))return;
    seen.add(canonical); out.push({name:String(name||'').replace(/^Double\s+|^Triple\s+/i,'').trim(),counts:counts||{[String(name).replace(/^Double\s+|^Triple\s+/i,'').trim()]:1},weight:Number(weight||0)});
  };
  for(const x of (Array.isArray(p?.specific_sets)?p.specific_sets:[])){
    for(const name of Object.keys(x?.counts||{})) add(name,x.weight,x.counts);
  }
  for(const x of (Array.isArray(p?.sets)?p.sets:[])){
    const raw=String(x?.name||'').trim(); if(!raw)continue;
    add(raw.replace(/^Double\s+|^Triple\s+/i,''),x.weight);
  }
  return out.sort((a,b)=>b.weight-a.weight);
}
function sithariKyberSetChoices(p){
  return sithariKyberSetRules(p).map(x=>x.name).filter(Boolean);
}
function sithariTopKyberSets(p){
  const rules=sithariKyberSetRules(p);
  const names=[]; const seen=new Set();
  for(const r of rules){for(const name of Object.keys(r.counts||{})){const k=compactKey(name);if(!seen.has(k)){seen.add(k);names.push({name,weight:Number(r.weight||0)});}}}
  return names.slice(0,6);
}
function sithariPrimaryRefs(p,slot){
  if(SITHARI_FIXED_PRIMARY[slot]) return [{name:SITHARI_FIXED_PRIMARY[slot],weight:1}];
  return Object.entries(p?.slots?.[slot]?.primaries||{}).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([name,weight])=>({name,weight}));
}
function sithariSetMatch(m,p,c){
  const set=sithariCanonicalSet(m?.set_name);
  return !!set && sithariKyberSetRules(p).some(r=>sithariCanonicalSet(r.name)===set);
}
function sithariPrimaryMatch(m,p,slot){
  return sithariPrimaryRefs(p,slot).some(x=>compactKey(x.name)===compactKey(m?.primary_stat));
}
function sithariPrimaryReference(p,slot){
  return sithariPrimaryRefs(p,slot)[0]?.name||'';
}
function sithariSetReference(p){
  const choices=sithariKyberSetChoices(p);
  return choices.length?choices.join(' / '):'—';
}
function sithariCalibrationSetChoices(p){
  return sithariKyberSetChoices(p);
}
function sithariOwnerRaw(value){
  if(value==null)return '';
  if(typeof value==='string'||typeof value==='number')return String(value).trim();
  if(typeof value==='object'){
    return String(value.base_id??value.baseId??value.characterId??value.character_id??value.unitId??value.unit_id??value.name??value.displayName??value.id??'').trim();
  }
  return '';
}
function sithariEquippedOwner(m){
  const raw=sithariOwnerRaw(m?.character) || sithariOwnerRaw(m?.characterName) || sithariOwnerRaw(m?.equippedTo) || sithariOwnerRaw(m?.equipped_to) || sithariOwnerRaw(m?.unit_equiped) || sithariOwnerRaw(m?.unitEquiped) || sithariOwnerRaw(m?.location) || sithariOwnerRaw(m?.usingIn) || sithariOwnerRaw(m?.baseId) || sithariOwnerRaw(m?.base_id) || sithariOwnerRaw(m?.characterId) || sithariOwnerRaw(m?.character_id);
  if(!raw)return '';
  const key=compactKey(raw);
  const hit=rosterCharacters.find(c=>[c?.name,c?.character,c?.baseId,c?.base_id,c?.unitId,c?.unit_id].some(v=>compactKey(v)===key));
  return hit?characterKey(hit):key;
}
function sithariSecondaryScore(m,p){
  const focus=p?.secondary_focus||{}; const sec=sithariModSecondaryMap(m); let score=0,count=0;
  for(const [stat,ref] of Object.entries(focus)){const v=Number(sec[stat]||0);if(v>0&&Number(ref)>0){score+=Math.min(1,v/Number(ref));count++;}}
  const speed=modSpeedMetrics(m).secondary||0;
  if(Number(focus.Speed)>0&&speed>0){score+=Math.min(1,speed/Number(focus.Speed));count++;}
  return count?score/count:0;
}
function sithariReferenceText(p,slot){
  const sets=sithariKyberSetChoices(p).join(' / ')||'—';
  const prim=sithariPrimaryRefs(p,slot).map(x=>`${x.name} ${Math.round(Number(x.weight||0)*100)}%`).join(' / ')||'—';
  const focus=p?.secondary_focus||{};
  const sec=Object.entries(focus).slice(0,4).map(([k,v])=>`${k} ${num(v,1)}`).join(' · ')||'—';
  return {sets,prim,sec};
}
function sithariSecondaryNames(){
  const names=new Map();
  for(const m of sithariEnsureModCache().items){
    for(let i=1;i<=4;i++){
      const stat=m?.[`secondary_${i}_stat`];
      if(stat){
        const label=secondaryDisplayName(stat);
        names.set(compactKey(label),label);
      }
    }
  }
  return [...names.values()].sort((a,b)=>a.localeCompare(b,'fr'));
}
function sithariSourceAllowed(status,scope){
  if(scope==='ALL')return true;
  if(status==='INCOMPLETS')return true;
  if(status==='TRÈS FAIBLES')return true;
  if(status==='FAIBLES')return true;
  if(status==='MOYENS')return true;
  return false;
}
function sithariScopeState(){
  const s=sithariActionState.scope||{};
  if(s.all===true)return 'ALL';
  return [
    s.incomplete!==false?'INCOMPLETS':null,
    s.veryLow!==false?'TRÈS FAIBLES':null,
    s.low!==false?'FAIBLES':null,
    s.medium===true?'MOYENS':null
  ].filter(Boolean);
}
function sithariScopeLabel(){
  const scope=sithariScopeState();
  return scope==='ALL'?'TOUT LE ROSTER':(scope.length?scope.join(' + '):'AUCUNE SOURCE');
}
let sithariModCache={signature:'',items:[],byOwner:new Map(),statusByOwner:new Map()};
function sithariEnsureModCache(){
  const signature=`${Array.isArray(mods)?mods.length:0}|${Array.isArray(rosterCharacters)?rosterCharacters.length:0}|${mods?.[0]?.game_id||mods?.[0]?.id||''}|${mods?.[mods.length-1]?.game_id||mods?.[mods.length-1]?.id||''}`;
  if(sithariModCache.signature===signature)return sithariModCache;
  const aliases=new Map();
  for(const c of rosterCharacters||[]){
    const key=characterKey(c);
    for(const v of [key,c?.name,c?.character,c?.baseId,c?.base_id,c?.unitId,c?.unit_id]){
      const a=compactKey(v); if(a)aliases.set(a,key);
    }
  }
  const items=[]; const byOwner=new Map();
  for(let i=0;i<(mods||[]).length;i++){
    const m={...normalizeModForDisplay(mods[i]),_index:i};
    const raw=sithariOwnerRaw(m.character)||sithariOwnerRaw(m.characterName)||sithariOwnerRaw(m.equippedTo)||sithariOwnerRaw(m.equipped_to)||sithariOwnerRaw(m.unit_equiped)||sithariOwnerRaw(m.unitEquiped)||sithariOwnerRaw(m.location)||sithariOwnerRaw(m.usingIn)||sithariOwnerRaw(m.baseId)||sithariOwnerRaw(m.base_id)||sithariOwnerRaw(m.characterId)||sithariOwnerRaw(m.character_id);
    const owner=aliases.get(compactKey(raw))||'';
    m._sithariOwner=owner;
    items.push(m);
    if(owner){if(!byOwner.has(owner))byOwner.set(owner,[]);byOwner.get(owner).push(m);}
  }
  const statusByOwner=new Map();
  for(const [owner,arr] of byOwner){
    const unique=[...new Map(arr.map(m=>[String(m.game_id||m.id||m._index),m])).values()];
    statusByOwner.set(owner,v176ModStatus(unique.sort((a,b)=>SITHARI_SLOT_ORDER.indexOf(a.slot)-SITHARI_SLOT_ORDER.indexOf(b.slot))).status);
  }
  sithariModCache={signature,items,byOwner,statusByOwner};
  return sithariModCache;
}
function sithariCharacterMods(c){
  if(!c)return [];
  const owner=characterKey(c); const cache=sithariEnsureModCache();
  const arr=cache.byOwner.get(owner)||[]; const bySlot=new Map();
  const score=x=>Number(Boolean(x?.primary_stat))*4+Number(Boolean(x?.secondary_1_stat))*2+Number(x?.level||0)/100;
  for(const m of arr){const slot=modSlotLabel(m?.slot);if(!SITHARI_SLOT_ORDER.includes(slot))continue;const prev=bySlot.get(slot);if(!prev||score(m)>score(prev))bySlot.set(slot,m);}
  return SITHARI_SLOT_ORDER.map(slot=>bySlot.get(slot)).filter(Boolean);
}
function sithariSourceStatus(mod){
  if(!mod)return null;
  const owner=mod._sithariOwner||sithariEquippedOwner(mod);
  if(!owner)return 'LIBRE';
  return sithariEnsureModCache().statusByOwner.get(owner)||'LIBRE';
}
function sithariCandidatePool(slot,setName,primaryName,current,excludeCharacterKey=''){
  const cache=sithariEnsureModCache();
  const currentId=String(current?.game_id||current?.id||''); const scope=sithariScopeState(); const pool=[];
  for(const m of cache.items){
    if(String(m.slot||'')!==String(slot||''))continue;
    if(currentId && String(m.game_id||m.id||'')===currentId)continue;
    if(setName && sithariCanonicalSet(m.set_name)!==sithariCanonicalSet(setName))continue;
    if(primaryName && compactKey(m.primary_stat)!==compactKey(primaryName))continue;
    if(excludeCharacterKey && m._sithariOwner===excludeCharacterKey)continue;
    const status=sithariSourceStatus(m);
    if(scope!=='ALL' && (!Array.isArray(scope)||!scope.includes(status)))continue;
    pool.push(m);
  }
  return pool;
}
function sithariTwoSecondaryMatch(m,first,second){
  const wanted=[compactKey(first),compactKey(second)].filter(Boolean);
  if(wanted.length!==2 || wanted[0]===wanted[1])return false;
  const got=new Set();
  for(let i=1;i<=4;i++){
    const stat=m?.[`secondary_${i}_stat`];
    if(stat)got.add(compactKey(secondaryDisplayName(stat)));
  }
  return wanted.every(x=>got.has(x));
}
function sithariReinforcementResults(x){
  const first=x.secondaryA||'', second=x.secondaryB||'';
  if(!first||!second||compactKey(first)===compactKey(second))return [];
  const pool=sithariCandidatePool(x.slot,x.current?.set_name,x.current?.primary_stat,x.current,characterKey(x.character));
  return pool.filter(m=>sithariTwoSecondaryMatch(m,first,second))
    .map(m=>({m,status:sithariSourceStatus(m),score:sithariSecondaryScore(m,x.profile),speed:modTotalSpeed(m)}))
    .sort((a,b)=>b.score-a.score||b.speed-a.speed)
    .slice(0,8);
}
function sithariCalibrationResults(x){
  const setChoices=sithariCalibrationSetChoices(x.profile);
  const primaryChoices=sithariPrimaryRefs(x.profile,x.slot).map(v=>v.name);
  const pool=[];
  for(const setName of setChoices){
    for(const primaryName of primaryChoices){
      for(const m of sithariCandidatePool(x.slot,setName,primaryName,x.current,characterKey(x.character))){
        if(!pool.some(existing=>String(existing.game_id||existing.id||'')===String(m.game_id||m.id||'')))pool.push(m);
      }
    }
  }
  return pool.map(m=>({m,status:sithariSourceStatus(m),score:sithariSecondaryScore(m,x.profile),speed:modTotalSpeed(m)}))
    .sort((a,b)=>b.score-a.score||b.speed-a.speed)
    .slice(0,8);
}
function sithariActionKey(character,slot){return `${characterKey(character)}::${slot}`;}
let sithariActionState={key:'',mode:'',secondaryA:'',secondaryB:'',ran:false,scope:{incomplete:true,veryLow:true,low:true,medium:false,all:false}};
function sithariOpenAction(x,mode){
  sithariActionState={key:sithariActionKey(x.character,x.slot),mode,secondaryA:'',secondaryB:'',ran:false,scope:{incomplete:true,veryLow:true,low:true,medium:false,all:false}};
  sithariRenderCharacter();
}
function sithariActionFor(x){
  return sithariActionState.key===sithariActionKey(x.character,x.slot)?sithariActionState:null;
}
function sithariRenderActionPanel(x){
  const active=sithariActionFor(x);
  if(!active)return '';
  const names=sithariSecondaryNames();
  const first=active.secondaryA, second=active.secondaryB;
  const options=names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
  const refSet=sithariSetReference(x.profile), refPrimary=sithariPrimaryReference(x.profile,x.slot);
  const rows=active.ran?(active.mode==='REINFORCEMENT'?sithariReinforcementResults(x):sithariCalibrationResults(x)):[];
  const results=active.mode==='REINFORCEMENT'
    ? `<div class="sithari-action-secondary"><label><span>SECONDAIRE 01</span><select data-sithari-secondary="A"><option value="">Choisir…</option>${names.map(n=>`<option value="${esc(n)}" ${compactKey(n)===compactKey(first)?'selected':''}>${esc(n)}</option>`).join('')}</select></label><label><span>SECONDAIRE 02</span><select data-sithari-secondary="B"><option value="">Choisir…</option>${names.map(n=>`<option value="${esc(n)}" ${compactKey(n)===compactKey(second)?'selected':''}>${esc(n)}</option>`).join('')}</select></label></div>
       <button type="button" class="sithari-run-action" data-sithari-run ${(!first||!second||compactKey(first)===compactKey(second))?'disabled':''}>LANCER LE RENFORCEMENT</button>`
    : `<div class="sithari-calibration-target"><span>CONFIGURATION SET KYBER</span><b>${esc(refSet||'—')}</b><span>PRIMAIRE(S) KYBER</span><b>${esc(sithariPrimaryRefs(x.profile,x.slot).map(v=>v.name).join(' / ')||refPrimary||'—')}</b></div>
       <button type="button" class="sithari-run-action calibration" data-sithari-run>LANCER LE CALIBRAGE</button>`;
  const resultHtml=active.ran?`<div class="sithari-action-results">${rows.length?rows.map((r,i)=>{
    const m=r.m, owner=rosterCharacters.find(c=>characterKey(c)===sithariEquippedOwner(m));
    const other=[];
    for(let j=1;j<=4;j++){const st=m?.[`secondary_${j}_stat`];if(st)other.push(`${secondaryDisplayName(st)} ${num(m[`secondary_${j}_value`],1)}`);}
    return `<article class="sithari-action-result"><b>${String(i+1).padStart(2,'0')}</b><div>${owner?`<strong>${esc(owner.name||'Libre')}</strong>`:'<strong>MOD LIBRE</strong>'}<small>${esc(m.set_name||'—')} · ${esc(m.primary_stat||'—')} · ${esc(m.slot||'—')}</small></div><span>${esc(other.join(' · ')||'Aucune secondaire')}<em>${num(r.speed)} Speed</em></span></article>`;
  }).join(''):`<div class="sithari-action-empty">Aucun mod ne respecte ces critères dans <strong>${esc(sithariScopeLabel())}</strong>.</div>`}</div>`:'';
  return `<section class="sithari-action-panel ${active.mode==='REINFORCEMENT'?'reinforcement':'calibration'}">
    <header><div><small>${active.mode==='REINFORCEMENT'?'RENFORCEMENT':'CALIBRAGE'} // RECHERCHE</small><strong>${esc(SITHARI_SLOT_LABEL[x.slot]||x.slot)} · ${active.mode==='REINFORCEMENT'?`SET ${x.current?.set_name||'—'} · ${x.current?.primary_stat||'—'}`:`RÉFÉRENCE KYBER`}</strong></div><button type="button" data-sithari-close>FERMER</button></header>
    <div class="sithari-action-scope"><span>SOURCES</span><b>${esc(sithariScopeLabel())}</b><small>Très faibles, faibles et incomplets par défaut · moyens / tout le roster en option.</small>
      <div class="sithari-source-options">
        <label><input type="checkbox" id="sithariIncomplete" ${active.scope.incomplete?'checked':''} ${active.scope.all?'disabled':''}><b>INCOMPLETS</b></label>
        <label><input type="checkbox" id="sithariVeryLow" ${active.scope.veryLow?'checked':''} ${active.scope.all?'disabled':''}><b>TRÈS FAIBLES</b></label>
        <label><input type="checkbox" id="sithariLow" ${active.scope.low?'checked':''} ${active.scope.all?'disabled':''}><b>FAIBLES</b></label>
        <label><input type="checkbox" id="sithariMedium" ${active.scope.medium?'checked':''} ${active.scope.all?'disabled':''}><b>MOYENS</b></label>
        <label><input type="checkbox" id="sithariAllRoster" ${active.scope.all?'checked':''}><b>TOUT LE ROSTER</b></label>
      </div>
    </div>
    ${results}
    ${resultHtml}
  </section>`;
}
function sithariSlotState(c,slot){
  const p=sithariProfileForCharacter(c); const cm=sithariCharacterMods(c); const current=cm.find(m=>String(m.slot||'')===slot)||null;
  if(!p){
    const key=characterKey(c),loading=!!sithariKyberLoading[key];
    return {character:c,slot,current,status:loading?'LOADING':'NOREF',profile:null,reference:{sets:loading?'Récupération de la référence Kyber…':'Référence Kyber indisponible',prim:'—',sec:'—'}};
  }
  const reference=sithariReferenceText(p,slot);
  const setOk=!!current&&sithariSetMatch(current,p,c);
  const primaryOk=!!current&&sithariPrimaryMatch(current,p,slot);
  const mode=(setOk&&primaryOk)?'REINFORCEMENT':'CALIBRATION';
  const status=!current?'CALIBRATION':(setOk&&primaryOk?'REINFORCE':'CALIBRATE');
  return {character:c,slot,current,status,mode,profile:p,reference,setOk,primaryOk,actionable:true};
}
function sithariPortrait(c){
  const src=c?.portraitUrl||c?.thumbnailName||''; return src?`<img src="${esc(src)}" alt="" loading="lazy">`:`<span>${esc(String(c?.name||'?').slice(0,1))}</span>`;
}
function sithariRenderSelectors(){
  const factionEl=$('sithariFaction'), grid=$('sithariCharacterGrid'), meta=$('sithariSelectionMeta'); if(!grid)return;
  buildFactionMap();
  const factions=['Toutes les factions',...allFactions()];
  if(factionEl){factionEl.innerHTML=factions.map(f=>`<option value="${esc(f)}">${esc(f)}</option>`).join('');factionEl.value=sithariFaction;}
  const rows=sithariFilteredCharacters();
  meta.textContent=rows.length?`${rows.length} personnage${rows.length>1?'s':''} · ${sithariFaction||'Toutes les factions'} · clique pour ajouter`:'Aucun personnage ne correspond à cette faction/recherche.';
  grid.innerHTML=rows.map(c=>{
    const key=characterKey(c), selected=sithariSelectedKeys.includes(key), disabled=!selected&&sithariSelectedKeys.length>=5;
    const factions=factionMap[key]||[];
    return `<button type="button" class="sithari-character-card ${selected?'selected':''}" data-sithari-char="${esc(key)}" ${disabled?'disabled':''}><span class="sithari-character-portrait">${sithariPortrait(c)}</span><span class="sithari-character-copy"><strong>${esc(c?.name||c?.baseId||'—')}</strong><small>${factions.slice(0,2).map(esc).join(' · ')||'Faction non renseignée'}</small></span><i>${selected?'✓ AJOUTÉ':'+ AJOUTER'}</i></button>`;
  }).join('');
  grid.querySelectorAll('[data-sithari-char]').forEach(btn=>btn.addEventListener('click',()=>sithariToggleCharacter(btn.dataset.sithariChar)));
}
function sithariToggleCharacter(key){
  if(sithariSelectedKeys.includes(key)){sithariSelectedKeys=sithariSelectedKeys.filter(x=>x!==key);if(sithariActiveKey===key)sithariActiveKey=sithariSelectedKeys[0]||'';}
  else if(sithariSelectedKeys.length<5){sithariSelectedKeys.push(key);sithariActiveKey=key;}
  sithariRenderAll();
}
function sithariCharacterByKey(key){return rosterCharacters.find(c=>characterKey(c)===key)||null;}
function sithariRenderTeam(){
  const team=$('sithariSelectedTeam'), tabs=$('sithariTeamTabs'), count=$('sithariSelectedCount'), summary=$('sithariTeamSummary'); if(!team)return;
  count.textContent=String(sithariSelectedKeys.length); summary.textContent=sithariSelectedKeys.length?`${sithariSelectedKeys.length} personnage${sithariSelectedKeys.length>1?'s':''} · cliquez sur un nom pour analyser`:'Ajoutez au moins 1 personnage';
  team.innerHTML=sithariSelectedKeys.map(key=>{const c=sithariCharacterByKey(key);return `<button type="button" class="sithari-selected-chip ${sithariActiveKey===key?'active':''}" data-sithari-active="${esc(key)}"><span>${sithariPortrait(c||{})}</span><strong>${esc(c?.name||key)}</strong><i>×</i></button>`}).join('');
  tabs.innerHTML=sithariSelectedKeys.map((key,i)=>{const c=sithariCharacterByKey(key);const states=c?SITHARI_SLOT_ORDER.map(s=>sithariSlotState(c,s)):[];const rep=states.filter(x=>x.status==='REINFORCE').length, find=states.filter(x=>x.status==='CALIBRATE').length;return `<button type="button" class="sithari-team-tab ${sithariActiveKey===key?'active':''}" data-sithari-active="${esc(key)}"><span>${String(i+1).padStart(2,'0')}</span><strong>${esc(c?.name||key)}</strong><small>${rep} renforcement${rep>1?'s':''} · ${find} calibrage${find>1?'s':''}</small></button>`}).join('');
  document.querySelectorAll('[data-sithari-active]').forEach(btn=>btn.addEventListener('click',()=>{sithariActiveKey=btn.dataset.sithariActive;sithariRenderAll(false)}));
  team.querySelectorAll('.sithari-selected-chip i').forEach((x)=>x.addEventListener('click',e=>{e.stopPropagation();sithariToggleCharacter(x.closest('[data-sithari-active]').dataset.sithariActive)}));
}
function sithariModMini(m){if(!m)return '<span class="sithari-no-mod">AUCUN MOD</span>';const x=modSpeedMetrics(m), sec=modSecondaries(m)||'—';return `<span class="sithari-mod-mini">${modIconHtml(m,'44')}<span class="sithari-mod-copy"><b>${esc(String(m.primary_stat||'—'))} ${num(m.primary_value,1)}</b><strong>${x.primary?'★ Primaire Speed':(x.secondary?`+${num(x.secondary)} Speed`:'Sans Speed')}</strong><small>${esc(sec)}</small></span></span>`;}
function sithariStatsReference(c,p){
  const op=optimizerProfileForCharacter(c)||{};
  const cur=op.current_stats||{};
  const avg=p?.averages||{};
  const defs=[['Speed','Speed'],['Health','Health'],['Protection','Protection'],['Physical Damage','Physical Damage'],['Special Damage','Special Damage']];
  return defs.filter(([k])=>Number(avg[k]||0)>0 || Number(cur[k]||0)>0).map(([k,label])=>({key:k,label,current:Number(cur[k]||0),kyber:Number(avg[k]||0)}));
}
function sithariStatValue(v,key){ if(key==='Potency'||key==='Tenacity') return `${(Number(v||0)*100).toFixed(1)}%`; return Math.round(Number(v||0)).toLocaleString('fr-FR'); }
function sithariStatsPanel(c,p){
  const rows=sithariStatsReference(c,p);
  if(!rows.length)return '';
  return `<section class="sithari-stats-panel"><div class="sithari-stats-head"><div><small>COMPARAISON</small><strong>TES STATS VS RÉFÉRENCE KYBER</strong></div><span>VALEUR ACTUELLE → CIBLE KYBER</span></div><div class="sithari-stats-grid">${rows.map(r=>{const delta=r.current-r.kyber;const cls=delta>=0?'ahead':'behind';return `<div class="sithari-stat-row"><span>${esc(r.label)}</span><b class="${cls}">${sithariStatValue(r.current,r.key)}</b><i>→</i><strong>${sithariStatValue(r.kyber,r.key)}</strong><small class="${cls}">${delta>=0?'▲':'▼'} ${Math.abs(delta).toLocaleString('fr-FR')}</small></div>`}).join('')}</div></section>`;
}
function sithariBindActionControls(box){
  box.querySelectorAll('[data-sithari-action]').forEach(btn=>btn.addEventListener('click',()=>{
    const c=sithariCharacterByKey(sithariActiveKey);
    const slotKey=btn.dataset.sithariSlot;
    if(c&&slotKey)sithariOpenAction(sithariSlotState(c,slotKey),btn.dataset.sithariAction);
  }));
  box.querySelectorAll('[data-sithari-close]').forEach(btn=>btn.addEventListener('click',()=>{sithariActionState={key:'',mode:'',secondaryA:'',secondaryB:'',ran:false,scope:{incomplete:true,veryLow:true,low:true,medium:false,all:false}};sithariRenderCharacter();}));
  box.querySelectorAll('[data-sithari-secondary]').forEach(sel=>sel.addEventListener('change',()=>{
    const a=sel.dataset.sithariSecondary;
    sithariActionState[a==='A'?'secondaryA':'secondaryB']=sel.value;
    sithariActionState.ran=false;
    sithariRenderCharacter();
  }));
  box.querySelectorAll('.sithari-source-options input').forEach(input=>input.addEventListener('change',()=>{
    if(input.id==='sithariAllRoster'){
      sithariActionState.scope.all=input.checked;
    }else{
      const map={sithariIncomplete:'incomplete',sithariVeryLow:'veryLow',sithariLow:'low',sithariMedium:'medium'};
      sithariActionState.scope[map[input.id]]=input.checked;
    }
    sithariActionState.ran=false;
    sithariRenderCharacter();
  }));
  box.querySelectorAll('[data-sithari-run]').forEach(btn=>btn.addEventListener('click',()=>{
    sithariActionState.ran=true;
    sithariRenderCharacter();
  }));
}
function sithariRenderCharacter(){
  const box=$('sithariCharacterAnalysis'), empty=$('sithariAnalysisEmpty'); if(!box)return;
  const c=sithariCharacterByKey(sithariActiveKey);
  if(!c){box.hidden=true;empty.hidden=false;return;}
  const p=sithariProfileForCharacter(c), states=SITHARI_SLOT_ORDER.map(s=>sithariSlotState(c,s));
  const reinforcement=states.filter(x=>x.status==='REINFORCE').length;
  const calibration=states.filter(x=>x.status==='CALIBRATE').length;
  const loading=states.some(x=>x.status==='LOADING');
  box.hidden=false;empty.hidden=true;
  box.innerHTML=`<div class="sithari-analysis-head"><div class="sithari-character-heading"><div class="sithari-analysis-portrait">${sithariPortrait(c)}</div><div><small>SITH’ARI // ANALYSE PERSONNAGE</small><h3>${esc(c?.name||c?.baseId||'—')}</h3><p>${(factionMap[characterKey(c)]||[]).map(esc).join(' · ')||'Faction non renseignée'} · ${num(sithariCharacterSpeed(c))} Speed max mod</p></div></div><div class="sithari-analysis-kpis"><span class="kpi-slots"><b>6</b><em>SLOTS</em></span><span class="kpi-replace"><b>${reinforcement}</b><em>RENFORCEMENTS</em></span><span class="kpi-search"><b>${calibration}</b><em>CALIBRAGES</em></span></div></div>
  ${loading?'':sithariStatsPanel(c,p)}
  ${loading?'<div class="sithari-no-reference">Récupération de la référence Kyber pour ce personnage…</div>':!p?'<div class="sithari-no-reference">Référence Kyber indisponible pour ce personnage.</div>':`<div class="sithari-action-summary"><div class="sithari-action-summary-main"><span class="sithari-action-icon">✧</span><div><strong>${reinforcement?`ACTION : ${reinforcement} renforcement${reinforcement>1?'s':''} possible${reinforcement>1?'s':''}`:'AUCUN RENFORCEMENT DISPONIBLE'}</strong><small>Set + primaire conformes = RENFORCEMENT. Sinon = CALIBRAGE avec la référence Kyber.</small></div></div><div class="sithari-action-pills"><b>${reinforcement} RENFORCEMENTS</b><b>${calibration} CALIBRAGES</b></div></div><div class="sithari-slots">${states.map((x,i)=>sithariSlotCard(x,i)).join('')}</div>`}`;
  sithariBindActionControls(box);
}
async function sithariEnsureProfilesForTeam(){
  const targets=sithariSelectedKeys.map(sithariCharacterByKey).filter(Boolean);
  const pending=[];
  for(const c of targets){
    const key=characterKey(c);
    if(sithariProfileForCharacter(c)||sithariKyberLoading[key]||sithariKyberAttempted[key])continue;
    sithariKyberLoading[key]=true;
    pending.push(Promise.resolve(fetchKyberProfile(c)).catch(()=>null).finally(()=>{
      sithariKyberAttempted[key]=true;
      delete sithariKyberLoading[key];
    }));
  }
  if(pending.length){
    await Promise.all(pending);
    sithariRenderAll(false);
  }
}
function sithariSlotCard(x,i){
  const labels={
    REINFORCE:['RENFORCEMENT','replace'],
    CALIBRATE:['CALIBRAGE','search'],
    NOREF:['SANS RÉFÉRENCE','noref'],
    LOADING:['RÉFÉRENCE EN CHARGEMENT','noref']
  };
  const [label,cls]=labels[x.status]||labels.NOREF;
  const action=x.status==='REINFORCE'?'REINFORCEMENT':x.status==='CALIBRATE'?'CALIBRATION':'';
  const actionBtn=action?`<button type="button" class="sithari-slot-action ${action==='REINFORCEMENT'?'reinforcement':'calibration'}" data-sithari-action="${action}" data-sithari-slot="${x.slot}">${action==='REINFORCEMENT'?'↗ RENFORCEMENT':'⌁ CALIBRAGE'}</button>`:'';
  return `<article class="sithari-slot-card ${cls}"><header><span>${String(i+1).padStart(2,'0')}</span><div><small>SLOT</small><strong>${SITHARI_SLOT_LABEL[x.slot]||x.slot}</strong></div><em>${label}</em></header>
    <div class="sithari-slot-compare"><div class="sithari-current-mod"><small>TON MOD</small>${sithariModMini(x.current)}</div><div class="sithari-slot-arrow">→</div><div class="sithari-kyber-ref"><small>RÉFÉRENCE KYBER</small><p><b>SETS</b> ${esc(x.reference.sets)}</p><p><b>PRIMAIRE</b> ${esc(x.reference.prim)}</p><p><b>SECONDAIRES</b> ${esc(x.reference.sec)}</p></div></div>
    <div class="sithari-rule-check"><span class="${x.setOk?'ok':'bad'}"><b>${x.setOk?'✓':'×'}</b> SET <em>${x.setOk?'CONFORME':'À CALIBRER'}</em></span><span class="${x.primaryOk?'ok':'bad'}"><b>${x.primaryOk?'✓':'×'}</b> PRIMAIRE <em>${x.primaryOk?'CONFORME':'À CALIBRER'}</em></span></div>
    ${actionBtn}
    ${sithariRenderActionPanel(x)}
  </article>`;
}
function sithariRenderTeamResults(){
  const box=$('sithariTeamResults');if(!box)return;
  if(!sithariSelectedKeys.length){box.innerHTML='<div class="sithari-results-empty">La vue équipe apparaîtra dès qu’un personnage sera sélectionné.</div>';return;}
  box.innerHTML=sithariSelectedKeys.map(key=>{
    const c=sithariCharacterByKey(key), states=SITHARI_SLOT_ORDER.map(s=>sithariSlotState(c,s));
    const reinforcement=states.filter(x=>x.status==='REINFORCE').length, calibration=states.filter(x=>x.status==='CALIBRATE').length;
    return `<button type="button" class="sithari-result-row ${sithariActiveKey===key?'active':''}" data-sithari-active="${esc(key)}"><span>${sithariPortrait(c||{})}</span><strong>${esc(c?.name||key)}</strong><em>${6-calibration} conformes</em><em>${reinforcement} renforcements</em><em>${calibration} calibrages</em></button>`;
  }).join('');
  box.querySelectorAll('[data-sithari-active]').forEach(btn=>btn.addEventListener('click',()=>{sithariActiveKey=btn.dataset.sithariActive;sithariRenderAll(false)}));
}
function renderSithariNexus(){
  const state=$('sithariState'); if(!state)return;
  buildFactionMap();
  state.textContent=rosterCharacters.length?'SITH’ARI // PRÊT':'EN ATTENTE DU SCAN';
  sithariRenderAll();
}
function sithariRenderAll(resetActive=true){
  if(resetActive && sithariSelectedKeys.length && !sithariSelectedKeys.includes(sithariActiveKey))sithariActiveKey=sithariSelectedKeys[0];
  sithariRenderSelectors();sithariRenderTeam();sithariRenderCharacter();sithariRenderTeamResults();
  sithariEnsureProfilesForTeam();
}


