let pyodide = null;
let optimizerReady = false;
let currentData = null;
let mods = [];
let profiles = {};
let currentDataset = 'characters';
let rosterCharacters = [];
let rosterShips = [];

const $ = (id) => document.getElementById(id);
function log(msg) { $('log').textContent += `\n${msg}`; $('log').scrollTop = $('log').scrollHeight; }
function setRuntime(text, ok=false) { $('runtime').textContent = text; $('runtime').classList.toggle('ok', ok); }
function cleanAllyCode(value) { return String(value || '').replace(/\D/g, '').slice(0, 9); }
function formatAlly(code) { const x=cleanAllyCode(code); return x.length===9 ? `${x.slice(0,3)}-${x.slice(3,6)}-${x.slice(6)}` : x; }
function slug(s) { return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
function esc(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function num(value, digits=0) { const n=Number(value); return Number.isFinite(n) ? n.toLocaleString('fr-FR',{maximumFractionDigits:digits}) : '0'; }

function normalizeMod(m, index=0) {
  if (!m || typeof m !== 'object') return null;
  const out = {...m};
  out.game_id = out.game_id ?? out.id ?? out.modId ?? `web-${index}`;
  out.slot = out.slot ?? out.slot_id ?? out.slotId ?? out.mod_slot ?? out.modSlot;
  out.set_name = out.set_name ?? out.set ?? out.setName ?? out.setId ?? out.modSetId;
  out.primary_stat = out.primary_stat ?? out.primaryStat ?? out.primary?.name ?? out.primary?.stat;
  out.primary_value = out.primary_value ?? out.primaryValue ?? out.primary?.value ?? 0;
  const secs = out.secondary_stats ?? out.secondaryStats ?? out.secondary ?? [];
  if (Array.isArray(secs)) secs.slice(0,4).forEach((s,i)=>{
    if (typeof s === 'object') { out[`secondary_${i+1}_stat`] = s.stat ?? s.name; out[`secondary_${i+1}_value`] = s.value ?? s.amount ?? 0; }
  });
  return out;
}
function extractMods(data) {
  if (Array.isArray(data)) return data.map(normalizeMod).filter(Boolean);
  if (Array.isArray(data?.mods)) return data.mods.map(normalizeMod).filter(Boolean);
  return [];
}
function extractCharacters(data) {
  const chars = data?.characters || data?.roster || data?.units || [];
  return Array.isArray(chars) ? chars.map(x => typeof x === 'string' ? {name:x} : x).filter(Boolean) : [];
}
function rosterUnitType(u) { return Number(u?.combatType ?? u?.combat_type ?? 1) === 2 ? 'ship' : 'character'; }
function splitRosterUnits(units) {
  const characters=[], ships=[];
  for(const u of Array.isArray(units)?units:[]) (rosterUnitType(u)==='ship'?ships:characters).push(u);
  return {characters,ships};
}
function updateRosterCounts(characters, ships) {
  const c=Array.isArray(characters)?characters.length:0, s=Array.isArray(ships)?ships.length:0;
  $('charsCount').textContent=c; $('shipsCount').textContent=s; $('unitsCount').textContent=c+s;
  $('modsCount').textContent=mods.length;
  $('tabCharsCount').textContent=c; $('tabShipsCount').textContent=s; $('tabModsCount').textContent=mods.length;
}
function profileForCharacter(character) {
  const base=String(character?.baseId||character?.base_id||'').toLowerCase();
  const name=slug(character?.name||character?.character||'');
  for(const p of Object.values(profiles)) {
    if(base && String(p.base_id||'').toLowerCase()===base) return p;
    if(name && slug(p.character||p.name)===name) return p;
  }
  return null;
}
function fillCharacters(names) {
  rosterCharacters = Array.isArray(names) ? names : [];
  const select=$('character'); select.innerHTML='';
  const sorted=[...rosterCharacters].sort((a,b)=>String(a.name||a.baseId||'').localeCompare(String(b.name||b.baseId||''),'fr'));
  for(const c of sorted) {
    const name=c.name||c.character||c.baseId||'Inconnu';
    const p=profileForCharacter(c);
    const o=document.createElement('option'); o.value=name; o.dataset.baseId=c.baseId||c.base_id||''; o.textContent=p ? `${name}  ★ Profil Kyber` : name; select.appendChild(o);
  }
  if(!sorted.length){const o=document.createElement('option');o.textContent='Aucun personnage chargé';o.disabled=true;o.selected=true;select.appendChild(o);}
  updateCharacterInfo();
}
function selectedCharacter() {
  const value=String($('character')?.value||'');
  return rosterCharacters.find(c=>String(c.name||c.character||c.baseId||'')===value) || null;
}
function updateCharacterInfo() {
  const c=selectedCharacter();
  if(!c){$('characterInfo').textContent='Aucun personnage sélectionné.';return;}
  const p=profileForCharacter(c);
  $('characterInfo').innerHTML=`<span class="tag">${esc(c.baseId||c.base_id||'')}</span> <strong>${esc(c.name||c.character||c.baseId||'')}</strong> · Niveau ${num(c.level)} · Gear ${num(c.gear)} · ${num(c.stars)}★ · Puissance ${num(c.power)} · ${p?'profil Kyber disponible':'profil Kyber non disponible actuellement'}`;
}

const DEFAULT_WORKER_URL = 'https://swgoh-optimizer-relay.lorg75017.workers.dev';
function workerUrl() { return String(localStorage.getItem('swgohRelayUrl') || $('relayUrl')?.value || DEFAULT_WORKER_URL).trim().replace(/\/$/,''); }
function saveWorkerUrl() { const v=String($('relayUrl').value||'').trim().replace(/\/$/,''); if(v)localStorage.setItem('swgohRelayUrl',v);else localStorage.removeItem('swgohRelayUrl'); $('relayState').textContent=v?'RELAIS CONFIGURÉ':'RELAIS NON CONFIGURÉ'; log(v?`Relais Cloudflare enregistré : ${v}`:'Relais Cloudflare effacé.'); }
async function fetchText(url) {
  const candidates=[], relay=workerUrl();
  if(relay){const m=url.match(/\/p\/(\d{9})\/(characters|mods)?\/?(?:\?page=(\d+))?/);if(m){const ally=m[1],path=m[2]||'profile',page=m[3]||'1';candidates.push(`${relay}/?ally=${ally}&path=${path}&page=${page}`);}}
  candidates.push(url); let last='';
  for(const u of candidates){try{const r=await fetch(u,{headers:{'Accept':'text/html,application/xhtml+xml,application/json'}});if(!r.ok)throw new Error(`HTTP ${r.status}`);const text=await r.text();if(text&&text.length>200)return text;last=`Réponse vide via ${u}`;}catch(e){last=e.message||String(e);}}
  throw new Error(last||'Impossible de lire la page SWGOH.GG.');
}
function parseHTML(text){return new DOMParser().parseFromString(text,'text/html');}
function firstText(root,selectors){for(const sel of selectors){const n=root.querySelector(sel);if(n){const t=n.textContent?.trim();if(t)return t;}}return '';}
function firstAttr(root,selectors,attr){for(const sel of selectors){const n=root.querySelector(sel);const v=n?.getAttribute(attr);if(v)return v;}return '';}
function parseNumberValue(v){const m=String(v??'').replace(/\s/g,'').match(/[+-]?[0-9]+(?:[.,][0-9]+)?/);return m?Number(m[0].replace(',','.')):0;}
function slotFromShape(shape){const s=String(shape||'').toLowerCase();return ({transmitter:'Square',receiver:'Arrow',processor:'Diamond','holo-array':'Triangle','data-bus':'Circle',multiplexer:'Cross'})[s]||shape;}
function parseStatGeneric(node){if(!node)return{stat:'',value:0};const label=firstText(node,['.statmod-stat-label','[class*="statmod-stat-label"]','[data-stat-name]'])||node.getAttribute?.('data-stat-name')||'';const raw=firstText(node,['.statmod-stat-value','[class*="statmod-stat-value"]','[data-stat-value]'])||node.getAttribute?.('data-stat-value')||node.textContent||'';return{stat:label.trim(),value:parseNumberValue(raw)};}
function parseModsPage(doc,page){
  const nodes=[...doc.querySelectorAll('.collection-mod, [class*="collection-mod"], [data-mod-id], [data-id].mod')],result=[];
  nodes.forEach((node,idx)=>{const alt=firstAttr(node,['.statmod-img','img[class*="statmod-img"]'],'alt');const words=alt.trim().split(/\s+/).filter(Boolean);const shape=words.at(-1)||'';const set=words.length>=5?words.slice(2,-1).join(' '):(words.length>=4?words[2]:'');const primary=parseStatGeneric(node.querySelector('.statmod-stats-1 .statmod-stat, [class*="statmod-stats-1"] [class*="statmod-stat"]'));const secondary=[...node.querySelectorAll('.statmod-stats-2 .statmod-stat, [class*="statmod-stats-2"] [class*="statmod-stat"]')].map(parseStatGeneric).filter(x=>x.stat);const char=firstAttr(node,['img.char-portrait-img','img[class*="char-portrait-img"]'],'alt');const level=parseNumberValue(firstText(node,['.statmod-level','[class*="statmod-level"]']));const rarity=node.querySelectorAll('.statmod-pip, [class*="statmod-pip"]').length;const id=node.getAttribute('data-id')||node.getAttribute('data-mod-id')||`gg-${page}-${idx}`;if(shape||set||primary.stat||secondary.length)result.push(normalizeMod({game_id:id,slot:slotFromShape(shape),set_name:set,rarity,level,primary_stat:primary.stat,primary_value:primary.value,secondary_stats:secondary,character:char},page*1000+idx));});
  return result.filter(Boolean);
}
function parseCharacters(doc){const result=[],nodes=[...doc.querySelectorAll('.collection-char-list .collection-char, .collection-char, [class*="collection-char"]')],seen=new Set();for(const node of nodes){const name=firstText(node,['.collection-char-name-link','[class*="collection-char-name"]','a[href*="/character/"]']);if(!name||seen.has(name))continue;seen.add(name);const level=parseNumberValue(firstText(node,['.char-portrait-full-level','[class*="char-portrait-full-level"]']));let gear=0;const portrait=node.querySelector('.player-char-portrait,[class*="player-char-portrait"]');for(let i=1;i<=13;i++)if(portrait?.classList.contains(`char-portrait-full-gear-t${i}`))gear=i;const stars=[...node.querySelectorAll('.star, [class*="star"]')].filter(x=>!String(x.className).includes('inactive')).length;result.push({name,level,gear,stars});}return result;}
function looksLikeMod(o){if(!o||typeof o!=='object')return false;const keys=Object.keys(o).map(k=>k.toLowerCase());return(keys.includes('slot')||keys.includes('slot_id')||keys.includes('modslot'))&&(keys.includes('level')||keys.includes('pips')||keys.includes('rarity'))&&(keys.includes('set')||keys.includes('set_id')||keys.includes('setname')||keys.includes('primary')||keys.includes('primary_stat'));}
function walkObjects(value,fn,seen=new Set()){if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);fn(value);if(Array.isArray(value))for(const x of value)walkObjects(x,fn,seen);else for(const v of Object.values(value))walkObjects(v,fn,seen);}
function extractApiMods(json){const out=[];let i=0;walkObjects(json,o=>{if(looksLikeMod(o))out.push(normalizeMod({...o,game_id:o.id||o.uid||o.modId||`api-${i}`},i++));});const seen=new Set();return out.filter(m=>m&&!seen.has(m.game_id)&&seen.add(m.game_id));}
function unitToCharacter(u,index=0){const o=u?.data&&typeof u.data==='object'?u.data:u;if(!o||typeof o!=='object')return null;const baseId=o.base_id??o.baseId??o.definitionId;const name=o.name??o.character??o.characterName??o.unitName;const hasRosterFields=baseId&&Number.isFinite(Number(o.level))&&Number.isFinite(Number(o.rarity))&&(Object.prototype.hasOwnProperty.call(o,'gear_level')||Object.prototype.hasOwnProperty.call(o,'gearLevel')||Object.prototype.hasOwnProperty.call(o,'gear')||Object.prototype.hasOwnProperty.call(o,'power')||Object.prototype.hasOwnProperty.call(o,'combat_type'));if(!hasRosterFields)return null;return{name:name||baseId,baseId,level:Number(o.level||0),gear:Number(o.gear_level??o.gearLevel??o.gear??0),stars:Number(o.rarity??o.starLevel??o.stars??0),power:Number(o.power||0),combatType:Number(o.combat_type??o.combatType??1),raw:u};}
function extractApiCharacters(json){const direct=Array.isArray(json?.units)?json.units:[];let out=direct.map(unitToCharacter).filter(Boolean);if(!out.length){const candidates=[];walkObjects(json,o=>{const unit=unitToCharacter(o);if(unit)candidates.push(unit);});out=candidates;}const seen=new Set();return out.filter(x=>{const key=`${x.baseId||''}|${x.name||''}`;if(seen.has(key))return false;seen.add(key);return true;});}
async function fetchJSON(url){const r=await fetch(url,{headers:{'Accept':'application/json,text/plain,*/*'}});if(!r.ok)throw new Error(`HTTP ${r.status}`);return JSON.parse(await r.text());}

async function loadRemotePlayer(){
  const allyCode=cleanAllyCode($('allyCode').value);if(allyCode.length!==9){log('Ally Code invalide : 9 chiffres attendus.');return;}
  $('loadPlayer').disabled=true;$('loadPlayer').textContent='CHARGEMENT…';$('log').textContent='';const fmt=formatAlly(allyCode);log(`Recherche du joueur ${fmt}…`);
  try{
    if(workerUrl())log('Relais Cloudflare actif : récupération via relais sécurisé.');else log('Aucun relais configuré : tentative directe depuis le navigateur.');
    const base=`https://swgoh.gg/p/${allyCode}`,relay=workerUrl();let apiChars=[],apiMods=[];
    if(relay){log('Tentative API JSON SWGOH.GG via le Worker…');try{const api=await fetchJSON(`${relay}/?ally=${allyCode}&path=api-profile`);apiChars=extractApiCharacters(api);apiMods=extractApiMods(api);log(`API : ${apiChars.length} unités candidates, ${apiMods.length} mods candidats.`);}catch(e){log(`API profil indisponible : ${e.message}`);}if(!apiMods.length){try{const apiModsJson=await fetchJSON(`${relay}/?ally=${allyCode}&path=api-mods`);apiMods=extractApiMods(apiModsJson);log(`API mods : ${apiMods.length} mods candidats.`);}catch(e){log(`API mods indisponible : ${e.message}`);}}}
    const profileText=await fetchText(`${base}/`),profileDoc=parseHTML(profileText),title=profileDoc.querySelector('h1')?.textContent?.trim()||'Joueur',bodyText=profileDoc.body.textContent||'';const rosterMatch=bodyText.match(/Roster\s+([0-9,]+)\s+units/i);const modsMatch=bodyText.match(/([0-9,]+)\s+Mods/i);log(`Profil SWGOH.GG trouvé : ${title}.`);if(rosterMatch)log(`Roster annoncé : ${rosterMatch[1]} unités.`);if(modsMatch)log(`Mods annoncés : ${modsMatch[1]}.`);log('Lecture du roster…');
    if(apiChars.length)log(`Unités directes API retenues : ${apiChars.length}.`);
    const ownedApi=apiChars.filter(c=>Number(c.level||0)>0||Number(c.gear||0)>0||Number(c.stars||0)>0);
    let chars=[],ships=[];
    if(ownedApi.length){const split=splitRosterUnits(ownedApi);chars=split.characters;ships=split.ships;log(`Unités possédées : ${chars.length} personnages + ${ships.length} vaisseaux.`);}else{chars=parseCharacters(parseHTML(await fetchText(`${base}/characters/`)));log(`Fallback HTML : ${chars.length} personnages détectés.`);}
    rosterCharacters=chars;rosterShips=ships;log(`${chars.length} personnages récupérés (${apiChars.length} unités candidates API, filtrées sur les unités possédées).`);
    let allMods=apiMods;if(!allMods.length){log('Lecture des mods (pages publiques)…');for(let page=1;page<=50;page++){const pageMods=parseModsPage(parseHTML(await fetchText(`${base}/mods/?page=${page}`)),page);if(!pageMods.length)break;allMods.push(...pageMods);log(`Page mods ${page}: ${pageMods.length} mods.`);if(pageMods.length<30)break;}}
    const seen=new Set();mods=allMods.filter(m=>{const id=m.game_id;if(seen.has(id))return false;seen.add(id);return true;});
    currentData={allyCode,name:title,characters:chars,ships,mods};updateRosterCounts(chars,ships);fillCharacters(chars);updateAccountSummary(title,fmt);renderDataTable();
    $('dataInfo').textContent=`Source: SWGOH.GG public pages${workerUrl()?' + Cloudflare Worker relay':''}\nJoueur: ${title}\nAlly Code: ${fmt}\nPersonnages: ${chars.length}\nVaisseaux: ${ships.length}\nUnités totales: ${chars.length+ships.length}\nMods: ${mods.length}\nProfils Kyber disponibles dans cette version: ${Object.keys(profiles).length}`;
    log(`TERMINÉ : ${chars.length} personnages, ${ships.length} vaisseaux, ${mods.length} mods exploitables.`);if(!mods.length)log('Aucun mod lisible. Utilise l’import JSON en attendant.');document.querySelector('[data-page="data"]').click();
  }catch(e){log(`Échec du chargement : ${e.message||e}`);log('Si le relais est configuré et renvoie une erreur HTTP, utilise l’import JSON.');}
  finally{$('loadPlayer').disabled=false;$('loadPlayer').textContent='CHARGER MON PROFIL';}
}
function updateAccountSummary(title,fmt){$('accountSummary').innerHTML=`<div><span>JOUEUR</span><strong>${esc(title)}</strong></div><div><span>ALLY CODE</span><strong>${esc(fmt)}</strong></div><div><span>PERSONNAGES</span><strong>${rosterCharacters.length}</strong></div><div><span>VAISSEAUX</span><strong>${rosterShips.length}</strong></div><div><span>MODS</span><strong>${mods.length}</strong></div>`;}

function modSecondaries(m){const arr=[];for(let i=1;i<=4;i++){const s=m[`secondary_${i}_stat`],v=m[`secondary_${i}_value`];if(s)arr.push(`${s} ${num(v,1)}`);}return arr.join(' · ');}
function renderDataTable(){
  const q=String($('dataSearch').value||'').trim().toLowerCase();let rows=[];
  if(currentDataset==='characters'){
    rows=rosterCharacters.filter(c=>JSON.stringify(c).toLowerCase().includes(q)).sort((a,b)=>String(a.name||a.baseId).localeCompare(String(b.name||b.baseId),'fr'));
    $('dataTableMeta').textContent=`${rows.length} personnage(s) affiché(s) sur ${rosterCharacters.length}`;
    $('dataTable').innerHTML=rows.length?`<table><thead><tr><th>Personnage</th><th>Base ID</th><th>Niveau</th><th>Gear</th><th>Étoiles</th><th>Puissance</th><th>Profil</th></tr></thead><tbody>${rows.map(c=>{const p=profileForCharacter(c);return `<tr><td><strong>${esc(c.name||c.character||c.baseId)}</strong></td><td>${esc(c.baseId||c.base_id||'')}</td><td>${num(c.level)}</td><td>${num(c.gear)}</td><td>${num(c.stars)}★</td><td>${num(c.power)}</td><td>${p?'<span class="ok-badge">KYBER</span>':'<span class="muted-badge">—</span>'}</td></tr>`}).join('')}</tbody></table>`:'<div class="empty">Aucun personnage ne correspond à la recherche.</div>';
  } else if(currentDataset==='ships'){
    rows=rosterShips.filter(c=>JSON.stringify(c).toLowerCase().includes(q)).sort((a,b)=>String(a.name||a.baseId).localeCompare(String(b.name||b.baseId),'fr'));
    $('dataTableMeta').textContent=`${rows.length} vaisseau(x) affiché(s) sur ${rosterShips.length}`;
    $('dataTable').innerHTML=rows.length?`<table><thead><tr><th>Vaisseau</th><th>Base ID</th><th>Niveau</th><th>Gear</th><th>Étoiles</th><th>Puissance</th></tr></thead><tbody>${rows.map(c=>`<tr><td><strong>${esc(c.name||c.character||c.baseId)}</strong></td><td>${esc(c.baseId||c.base_id||'')}</td><td>${num(c.level)}</td><td>${num(c.gear)}</td><td>${num(c.stars)}★</td><td>${num(c.power)}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">Aucun vaisseau ne correspond à la recherche.</div>';
  } else {
    rows=mods.filter(m=>JSON.stringify(m).toLowerCase().includes(q));
    $('dataTableMeta').textContent=`${rows.length} mod(s) affiché(s) sur ${mods.length}`;
    $('dataTable').innerHTML=rows.length?`<table><thead><tr><th>Slot</th><th>Set</th><th>Primaire</th><th>Secondaires</th><th>Niveau</th><th>Rareté</th><th>Équipé</th></tr></thead><tbody>${rows.map(m=>`<tr><td>${esc(m.slot||'')}</td><td>${esc(m.set_name||m.set||'')}</td><td><strong>${esc(m.primary_stat||'')}</strong> ${num(m.primary_value,1)}</td><td>${esc(modSecondaries(m))}</td><td>${num(m.level)}</td><td>${num(m.rarity)}★</td><td>${esc(m.character||'Libre')}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">Aucun mod ne correspond à la recherche.</div>';
  }
}

$('loadPlayer').addEventListener('click',loadRemotePlayer);$('allyCode').addEventListener('keydown',e=>{if(e.key==='Enter')loadRemotePlayer();});$('saveRelay').addEventListener('click',saveWorkerUrl);$('relayUrl').value=localStorage.getItem('swgohRelayUrl')||'';$('relayState').textContent=workerUrl()?'RELAIS CONFIGURÉ':'RELAIS NON CONFIGURÉ';$('character').addEventListener('change',updateCharacterInfo);$('dataSearch').addEventListener('input',renderDataTable);
document.querySelectorAll('.data-tab').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.data-tab').forEach(x=>x.classList.remove('active'));btn.classList.add('active');currentDataset=btn.dataset.dataset;renderDataTable();}));

async function boot(){try{setRuntime('CHARGEMENT PYTHON…');pyodide=await loadPyodide();const optimizer=await fetch('python/optimizer.py').then(r=>r.text());const kyber=await fetch('python/kyber_profiles.json').then(r=>r.text());pyodide.FS.writeFile('/home/pyodide/optimizer.py',optimizer);pyodide.FS.writeFile('/home/pyodide/kyber_profiles.json',kyber);pyodide.runPython(`import sys; sys.path.append('/home/pyodide'); import optimizer, json`);profiles=JSON.parse(kyber);optimizerReady=true;$('pythonState').textContent='OK';setRuntime('PYTHON WEBASSEMBLY PRÊT',true);log('Moteur Python chargé dans le navigateur.');}catch(e){setRuntime('ERREUR PYTHON');$('pythonState').textContent='ERREUR';log('Erreur Python: '+e);}}

$('fileInput').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{currentData=JSON.parse(await file.text());mods=extractMods(currentData);const importedUnits=extractCharacters(currentData);const split=splitRosterUnits(importedUnits);rosterCharacters=split.characters;rosterShips=split.ships;updateRosterCounts(rosterCharacters,rosterShips);fillCharacters(rosterCharacters);updateAccountSummary(file.name,'IMPORT JSON');renderDataTable();$('dataInfo').textContent=`Fichier: ${file.name}\nMods détectés: ${mods.length}\nPersonnages détectés: ${rosterCharacters.length}\nVaisseaux détectés: ${rosterShips.length}`;$('log').textContent='';log(`Import: ${file.name}`);log(`${mods.length} mods détectés.`);log(`${rosterCharacters.length} personnages + ${rosterShips.length} vaisseaux détectés.`);document.querySelector('[data-page="data"]').click();}catch(e){log('JSON invalide: '+e.message);}});

$('runOptimizer').addEventListener('click',()=>{
  $('optimizerError').textContent='';$('results').innerHTML='<div class="calculating">Calcul Python en cours…</div>';if(!optimizerReady||!mods.length){$('optimizerError').textContent='Python ou mods non disponibles.';return;}
  const character=selectedCharacter();const profile=profileForCharacter(character);if(!character){$('optimizerError').textContent='Sélectionnez un personnage.';return;}if(!profile){$('optimizerError').textContent=`Aucun profil Kyber chargé pour « ${character.name||character.baseId} ». Le roster est bien chargé, mais cette version ne contient encore que les profils de référence disponibles dans kyber_profiles.json.`;$('results').innerHTML='';return;}
  try{pyodide.globals.set('mods_json',JSON.stringify(mods));pyodide.globals.set('profile_json',JSON.stringify(profile));pyodide.globals.set('n_builds',Math.min(50,Math.max(1,Number($('buildCount').value)||10)));pyodide.globals.set('limit_slot',Math.min(150,Math.max(5,Number($('limitPerSlot').value)||80)));const raw=pyodide.runPython(`import json\nmods=json.loads(mods_json)\nprofile=json.loads(profile_json)\nr=optimizer.find_top_builds(mods, number_of_builds=n_builds, limit_per_slot=limit_slot, kyber=profile, character=${JSON.stringify(character.name||character.baseId)})\njson.dumps(r)`).toJs();renderResults(JSON.parse(raw));}
  catch(e){$('optimizerError').textContent=String(e);$('results').innerHTML='';}
});
function renderResults(data){if(!data.length){$('results').textContent='Aucun build.';return;}$('results').innerHTML=data.map((r,i)=>`<article class="result"><div class="rank">#${i+1}</div><div><div class="result-head"><strong>Score ${Number(r.score).toFixed(2)}</strong></div><div class="stats">${Object.entries(r.stats||{}).map(([k,v])=>`${esc(k)}: ${typeof v==='number'?num(v,1):esc(v)}`).join(' · ')}</div><div class="build-grid">${(r.build||[]).map(m=>`<div class="mod-card"><strong>${esc(m.slot||'?')}</strong><span>${esc(m.set_name||m.set||'?')}</span><span>${esc(m.primary_stat||'?')} ${num(m.primary_value,1)}</span><small>${esc([1,2,3,4].map(i=>m[`secondary_${i}_stat`]?`${m[`secondary_${i}_stat`]} ${num(m[`secondary_${i}_value`],1)}`:'').filter(Boolean).join(' · '))}</small></div>`).join('')}</div></div></article>`).join('');}

$('clearData').addEventListener('click',()=>{currentData=null;mods=[];rosterCharacters=[];rosterShips=[];updateRosterCounts([],[]);fillCharacters([]);$('results').textContent='Chargez d’abord vos données.';$('dataInfo').textContent='Aucune donnée.';$('accountSummary').innerHTML='<span>Aucune donnée chargée.</span>';$('dataTableMeta').textContent='Aucune donnée.';$('dataTable').innerHTML='<div class="empty">Chargez un profil pour afficher les données.</div>';$('log').textContent='Données effacées.';});
document.querySelectorAll('.nav').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.nav').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));btn.classList.add('active');$(btn.dataset.page).classList.add('active');if(btn.dataset.page==='data')renderDataTable();}));
boot();
