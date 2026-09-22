let pyodide = null;
let optimizerReady = false;
let currentData = null;
let mods = [];
let profiles = {};

const $ = (id) => document.getElementById(id);
function log(msg) { $('log').textContent += `\n${msg}`; $('log').scrollTop = $('log').scrollHeight; }
function setRuntime(text, ok=false) { $('runtime').textContent = text; $('runtime').classList.toggle('ok', ok); }
function cleanAllyCode(value) { return String(value || '').replace(/\D/g, '').slice(0, 9); }
function formatAlly(code) { const x=cleanAllyCode(code); return x.length===9 ? `${x.slice(0,3)}-${x.slice(3,6)}-${x.slice(6)}` : x; }
function slug(s) { return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }

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
function rosterUnitType(u) {
  const t = Number(u?.combatType ?? u?.combat_type ?? 1);
  return t === 2 ? 'ship' : 'character';
}
function splitRosterUnits(units) {
  const characters = [], ships = [];
  for (const u of Array.isArray(units) ? units : []) {
    (rosterUnitType(u) === 'ship' ? ships : characters).push(u);
  }
  return {characters, ships};
}
function updateRosterCounts(characters, ships) {
  $('charsCount').textContent = Array.isArray(characters) ? characters.length : 0;
  if ($('shipsCount')) $('shipsCount').textContent = Array.isArray(ships) ? ships.length : 0;
}

function fillCharacters(names) {
  const select=$('character'); select.innerHTML='';
  const available=[];
  for (const p of Object.values(profiles)) {
    const name=p.character||p.name;
    if(!name) continue;
    const found=names.find(n=>slug(n.name||n)===slug(name)||slug(n.baseId||'')===slug(p.base_id||''));
    const o=document.createElement('option'); o.value=name; o.textContent=found?.name||name; select.appendChild(o); available.push(name);
  }
  if(!available.length){const o=document.createElement('option');o.textContent='Aucun profil d’optimisation disponible';o.disabled=true;o.selected=true;select.appendChild(o);}
}

const DEFAULT_WORKER_URL = 'https://swgoh-optimizer-relay.lorg75017.workers.dev';

function workerUrl() {
  return String(
    localStorage.getItem('swgohRelayUrl') ||
    $('relayUrl')?.value ||
    DEFAULT_WORKER_URL
  ).trim().replace(/\/$/, '');
}
function saveWorkerUrl() {
  const v=String($('relayUrl').value||'').trim().replace(/\/$/,'');
  if(v) localStorage.setItem('swgohRelayUrl',v); else localStorage.removeItem('swgohRelayUrl');
  $('relayState').textContent=v ? 'RELAIS CONFIGURÉ' : 'RELAIS NON CONFIGURÉ';
  log(v ? `Relais Cloudflare enregistré : ${v}` : 'Relais Cloudflare effacé.');
}
async function fetchText(url) {
  const candidates=[];
  const relay=workerUrl();
  if(relay){
    const m=url.match(/\/p\/(\d{9})\/(characters|mods)?\/?(?:\?page=(\d+))?/);
    if(m){
      const ally=m[1], path=m[2]||'profile', page=m[3]||'1';
      candidates.push(`${relay}/?ally=${ally}&path=${path}&page=${page}`);
    }
  }
  candidates.push(url);
  let last='';
  for(const u of candidates){
    try{
      const r=await fetch(u,{headers:{'Accept':'text/html,application/xhtml+xml,application/json'}});
      if(!r.ok) throw new Error(`HTTP ${r.status}`);
      const text=await r.text();
      if(text && text.length>200) return text;
      last=`Réponse vide via ${u}`;
    }catch(e){last=e.message||String(e);}
  }
  throw new Error(last||'Impossible de lire la page SWGOH.GG.');
}
function parseHTML(text){return new DOMParser().parseFromString(text,'text/html');}
function textNumber(s){const m=String(s||'').replace(/\s/g,'').match(/[0-9][0-9,.]*/);return m?Number(m[0].replace(/,/g,'')):0;}
function statFromNode(node){
  if(!node)return{stat:'',value:0};
  const label=node.querySelector('.statmod-stat-label')?.textContent?.trim()||'';
  const raw=node.querySelector('.statmod-stat-value')?.textContent?.trim()||'';
  return {stat:label,value:Number(raw.replace(/[^0-9.+-]/g,''))||0};
}
function slotFromShape(shape){
  const s=String(shape||'').toLowerCase();
  return ({transmitter:'Square',receiver:'Arrow',processor:'Diamond','holo-array':'Triangle','data-bus':'Circle',multiplexer:'Cross'})[s]||shape;
}
function firstText(root, selectors) {
  for (const sel of selectors) {
    const n = root.querySelector(sel);
    if (n) {
      const t = n.textContent?.trim();
      if (t) return t;
    }
  }
  return '';
}
function firstAttr(root, selectors, attr) {
  for (const sel of selectors) {
    const n = root.querySelector(sel);
    const v = n?.getAttribute(attr);
    if (v) return v;
  }
  return '';
}
function parseNumberValue(v) {
  const m = String(v ?? '').replace(/\s/g,'').match(/[+-]?[0-9]+(?:[.,][0-9]+)?/);
  return m ? Number(m[0].replace(',','.')) : 0;
}
function parseStatGeneric(node) {
  if (!node) return {stat:'', value:0};
  const label = firstText(node, ['.statmod-stat-label','[class*="statmod-stat-label"]','[data-stat-name]']) || node.getAttribute?.('data-stat-name') || '';
  const raw = firstText(node, ['.statmod-stat-value','[class*="statmod-stat-value"]','[data-stat-value]']) || node.getAttribute?.('data-stat-value') || node.textContent || '';
  return {stat: label.trim(), value: parseNumberValue(raw)};
}
function parseModsPage(doc,page){
  const nodes = [...doc.querySelectorAll('.collection-mod, [class*="collection-mod"], [data-mod-id], [data-id].mod')];
  const result=[];
  nodes.forEach((node,idx)=>{
    const alt = firstAttr(node,['.statmod-img','img[class*="statmod-img"]'],'alt');
    const words = alt.trim().split(/\s+/).filter(Boolean);
    let shape = words.at(-1) || '';
    let set = words.length >= 5 ? words.slice(2,-1).join(' ') : (words.length >= 4 ? words[2] : '');
    const primary = parseStatGeneric(node.querySelector('.statmod-stats-1 .statmod-stat, [class*="statmod-stats-1"] [class*="statmod-stat"]'));
    const secondary=[...node.querySelectorAll('.statmod-stats-2 .statmod-stat, [class*="statmod-stats-2"] [class*="statmod-stat"]')].map(parseStatGeneric).filter(x=>x.stat);
    const char=firstAttr(node,['img.char-portrait-img','img[class*="char-portrait-img"]'],'alt');
    const level=parseNumberValue(firstText(node,['.statmod-level','[class*="statmod-level"]']));
    const rarity=node.querySelectorAll('.statmod-pip, [class*="statmod-pip"]').length;
    const id=node.getAttribute('data-id') || node.getAttribute('data-mod-id') || `gg-${page}-${idx}`;
    if (shape || set || primary.stat || secondary.length) {
      result.push(normalizeMod({game_id:id,slot:slotFromShape(shape),set_name:set,rarity,level,primary_stat:primary.stat,primary_value:primary.value,secondary_stats:secondary,character:char},page*1000+idx));
    }
  });
  return result.filter(Boolean);
}
function parseCharacters(doc){
  const result=[];
  const nodes=[...doc.querySelectorAll('.collection-char-list .collection-char, .collection-char, [class*="collection-char"]')];
  const seen=new Set();
  for(const node of nodes){
    const name=firstText(node,['.collection-char-name-link','[class*="collection-char-name"]','a[href*="/character/"]']);
    if(!name || seen.has(name)) continue;
    seen.add(name);
    const level=parseNumberValue(firstText(node,['.char-portrait-full-level','[class*="char-portrait-full-level"]']));
    let gear=0; const portrait=node.querySelector('.player-char-portrait,[class*="player-char-portrait"]');
    for(let i=1;i<=13;i++) if(portrait?.classList.contains(`char-portrait-full-gear-t${i}`)) gear=i;
    const stars=[...node.querySelectorAll('.star, [class*="star"]')].filter(x=>!x.className.includes('inactive')).length;
    result.push({name,level,gear,stars});
  }
  return result;
}
function looksLikeMod(o){
  if(!o || typeof o!=='object') return false;
  const keys=Object.keys(o).map(k=>k.toLowerCase());
  return (keys.includes('slot') || keys.includes('slot_id') || keys.includes('modslot')) &&
         (keys.includes('level') || keys.includes('pips') || keys.includes('rarity')) &&
         (keys.includes('set') || keys.includes('set_id') || keys.includes('setname') || keys.includes('primary') || keys.includes('primary_stat'));
}
function looksLikeUnit(o){
  if(!o || typeof o!=='object') return false;
  const keys=Object.keys(o).map(k=>k.toLowerCase());
  return (keys.includes('baseid') || keys.includes('base_id') || keys.includes('character')) &&
         (keys.includes('level') || keys.includes('gear') || keys.includes('gearlevel') || keys.includes('starlevel'));
}
function walkObjects(value, fn, seen=new Set()){
  if(!value || typeof value!=='object' || seen.has(value)) return;
  seen.add(value); fn(value);
  if(Array.isArray(value)) for(const x of value) walkObjects(x,fn,seen);
  else for(const v of Object.values(value)) walkObjects(v,fn,seen);
}
function extractApiMods(json){
  const out=[]; let i=0;
  walkObjects(json,o=>{ if(looksLikeMod(o)) out.push(normalizeMod({...o,game_id:o.id||o.uid||o.modId||`api-${i}`},i++)); });
  const seen=new Set(); return out.filter(m=>m && !seen.has(m.game_id) && seen.add(m.game_id));
}
function unitToCharacter(u, index=0) {
  const o = u?.data && typeof u.data === 'object' ? u.data : u;
  if (!o || typeof o !== 'object') return null;

  const baseId = o.base_id ?? o.baseId ?? o.definitionId;
  const name = o.name ?? o.character ?? o.characterName ?? o.unitName;

  // Un vrai élément de roster SWGOH.GG possède ces champs.
  // On évite ainsi de prendre pour des personnages les objets
  // imbriqués (équipement, capacités, catalogue, etc.).
  const hasRosterFields =
    baseId &&
    Number.isFinite(Number(o.level)) &&
    Number.isFinite(Number(o.rarity)) &&
    (
      Object.prototype.hasOwnProperty.call(o, 'gear_level') ||
      Object.prototype.hasOwnProperty.call(o, 'gearLevel') ||
      Object.prototype.hasOwnProperty.call(o, 'gear') ||
      Object.prototype.hasOwnProperty.call(o, 'power') ||
      Object.prototype.hasOwnProperty.call(o, 'combat_type')
    );

  if (!hasRosterFields) return null;

  return {
    name: name || baseId,
    baseId,
    level: Number(o.level || 0),
    gear: Number(o.gear_level ?? o.gearLevel ?? o.gear ?? 0),
    stars: Number(o.rarity ?? o.starLevel ?? o.stars ?? 0),
    power: Number(o.power || 0),
    combatType: Number(o.combat_type ?? o.combatType ?? 1),
    raw: u
  };
}

function extractApiCharacters(json) {
  // L'endpoint /api/player/<ally>/?format=json expose directement
  // les unités du joueur dans json.units. On utilise cette liste
  // plutôt qu'un parcours récursif de tout le JSON.
  const direct = Array.isArray(json?.units) ? json.units : [];
  let out = direct.map(unitToCharacter).filter(Boolean);

  // Compatibilité avec d'autres formats éventuels.
  if (!out.length) {
    const candidates = [];
    walkObjects(json, o => {
      const unit = unitToCharacter(o);
      if (unit) candidates.push(unit);
    });
    out = candidates;
  }

  const seen = new Set();
  return out.filter(x => {
    const key = `${x.baseId || ''}|${x.name || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
async function fetchJSON(url){
  const r=await fetch(url,{headers:{'Accept':'application/json,text/plain,*/*'}});
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  const t=await r.text();
  return JSON.parse(t);
}

async function loadRemotePlayer(){
  const allyCode=cleanAllyCode($('allyCode').value);
  if(allyCode.length!==9){log('Ally Code invalide : 9 chiffres attendus.');return;}
  $('loadPlayer').disabled=true;$('loadPlayer').textContent='CHARGEMENT…';$('log').textContent='';
  const fmt=formatAlly(allyCode); log(`Recherche du joueur ${fmt}…`);
  try{
    if(workerUrl()) log('Relais Cloudflare actif : récupération via relais sécurisé.'); else log('Aucun relais configuré : tentative directe depuis le navigateur.');
    const base=`https://swgoh.gg/p/${allyCode}`;
    const relay=workerUrl();
    let apiChars=[], apiMods=[];
    if(relay){
      log('Tentative API JSON SWGOH.GG via le Worker…');
      try{
        const api=await fetchJSON(`${relay}/?ally=${allyCode}&path=api-profile`);
        apiChars=extractApiCharacters(api);
        apiMods=extractApiMods(api);
        log(`API : ${apiChars.length} personnages candidats, ${apiMods.length} mods candidats.`);
      }catch(e){ log(`API profil indisponible : ${e.message}`); }
      if(!apiMods.length){
        try{
          const apiModsJson=await fetchJSON(`${relay}/?ally=${allyCode}&path=api-mods`);
          apiMods=extractApiMods(apiModsJson);
          log(`API mods : ${apiMods.length} mods candidats.`);
        }catch(e){ log(`API mods indisponible : ${e.message}`); }
      }
    }
    const profileText=await fetchText(`${base}/`); const profileDoc=parseHTML(profileText);
    const title=profileDoc.querySelector('h1')?.textContent?.trim()||'Joueur'; const bodyText=profileDoc.body.textContent||'';
    const rosterMatch=bodyText.match(/Roster\s+([0-9,]+)\s+units/i); const modsMatch=bodyText.match(/([0-9,]+)\s+Mods/i);
    log(`Profil SWGOH.GG trouvé : ${title}.`); if(rosterMatch)log(`Roster annoncé : ${rosterMatch[1]} unités.`); if(modsMatch)log(`Mods annoncés : ${modsMatch[1]}.`);
    log('Lecture du roster…');
    if (Array.isArray(apiChars) && apiChars.length) {
      log(`Unités directes API retenues : ${apiChars.length}.`);
    }
    // L'API SWGOH.GG peut renvoyer le catalogue complet des unités,
    // avec des unités non possédées à niveau/étoiles/gear = 0.
    // Le profil public annonce le nombre d'unités réellement présentes
    // dans le roster : on filtre donc les entrées sans progression.
    const ownedApiChars = apiChars.filter(c =>
      Number(c.level || 0) > 0 ||
      Number(c.gear || 0) > 0 ||
      Number(c.stars || 0) > 0
    );

    let chars=ownedApiChars;
    let ships=[];
    if(!chars.length) {
      chars=parseCharacters(parseHTML(await fetchText(`${base}/characters/`)));
    } else {
      const split=splitRosterUnits(chars);
      chars=split.characters;
      ships=split.ships;
      log(`Unités possédées : ${chars.length} personnages + ${ships.length} vaisseaux.`);
    }

    log(`${chars.length} personnages récupérés (${apiChars.length} unités candidates API, filtrées sur les unités possédées).`);
    let allMods=apiMods;
    if(!allMods.length){
      log('Lecture des mods (pages publiques)…');
      for(let page=1;page<=50;page++){
        const pageMods=parseModsPage(parseHTML(await fetchText(`${base}/mods/?page=${page}`)),page);
        if(!pageMods.length)break; allMods.push(...pageMods); log(`Page mods ${page}: ${pageMods.length} mods.`); if(pageMods.length<30)break;
      }
    }
    const seen=new Set(); mods=allMods.filter(m=>{const id=m.game_id;if(seen.has(id))return false;seen.add(id);return true;});
    currentData={allyCode,name:title,characters:chars,ships,mods}; updateRosterCounts(chars,ships); fillCharacters(chars);
    $('dataInfo').textContent=`Source: SWGOH.GG public pages${workerUrl()?' + Cloudflare Worker relay':''}\nJoueur: ${title}\nAlly Code: ${fmt}\nPersonnages: ${chars.length}\nVaisseaux: ${ships.length}\nMods: ${mods.length}`;
    log(`TERMINÉ : ${chars.length} personnages, ${ships.length} vaisseaux, ${mods.length} mods exploitables.`); if(!mods.length)log('Aucun mod lisible. Utilise l’import JSON en attendant.');
    document.querySelector('[data-page="optimizer"]').click();
  }catch(e){log(`Échec du chargement : ${e.message||e}`);log('Si le relais est configuré et renvoie une erreur HTTP, SWGOH.GG peut bloquer la requête côté relais. Dans ce cas, utilise l’import JSON.');}
  finally{$('loadPlayer').disabled=false;$('loadPlayer').textContent='CHARGER MON PROFIL';}
}
$('loadPlayer').addEventListener('click',loadRemotePlayer); $('allyCode').addEventListener('keydown',e=>{if(e.key==='Enter')loadRemotePlayer();});
$('saveRelay').addEventListener('click',saveWorkerUrl); $('relayUrl').value=localStorage.getItem('swgohRelayUrl')||''; $('relayState').textContent=workerUrl()?'RELAIS CONFIGURÉ':'RELAIS NON CONFIGURÉ';

async function boot(){
  try{setRuntime('CHARGEMENT PYTHON…');pyodide=await loadPyodide();const optimizer=await fetch('python/optimizer.py').then(r=>r.text());const kyber=await fetch('python/kyber_profiles.json').then(r=>r.text());pyodide.FS.writeFile('/home/pyodide/optimizer.py',optimizer);pyodide.FS.writeFile('/home/pyodide/kyber_profiles.json',kyber);pyodide.runPython(`import sys; sys.path.append('/home/pyodide'); import optimizer, json`);profiles=JSON.parse(kyber);optimizerReady=true;$('pythonState').textContent='OK';setRuntime('PYTHON WEBASSEMBLY PRÊT',true);log('Moteur Python chargé dans le navigateur.');}
  catch(e){setRuntime('ERREUR PYTHON');$('pythonState').textContent='ERREUR';log('Erreur Python: '+e);}
}
$('fileInput').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{currentData=JSON.parse(await file.text());mods=extractMods(currentData);const importedUnits=extractCharacters(currentData);const split=splitRosterUnits(importedUnits);const chars=split.characters;const ships=split.ships;updateRosterCounts(chars,ships);fillCharacters(chars);$('dataInfo').textContent=`Fichier: ${file.name}\nMods détectés: ${mods.length}\nPersonnages détectés: ${chars.length}\nVaisseaux détectés: ${ships.length}`;$('log').textContent='';log(`Import: ${file.name}`);log(`${mods.length} mods détectés.`);document.querySelector('[data-page="optimizer"]').click();}catch(e){log('JSON invalide: '+e.message);}});
$('runOptimizer').addEventListener('click',()=>{$('optimizerError').textContent='';$('results').innerHTML='Calcul…';if(!optimizerReady||!mods.length){$('optimizerError').textContent='Python ou mods non disponibles.';return;}const character=$('character').value;const key=Object.keys(profiles).find(k=>slug(profiles[k].character)===slug(character));const profile=key?profiles[key]:null;if(!profile){$('optimizerError').textContent=`Profil Kyber non trouvé pour « ${character} ».`;$('results').innerHTML='';return;}try{pyodide.globals.set('mods_json',JSON.stringify(mods));pyodide.globals.set('profile_json',JSON.stringify(profile));pyodide.globals.set('n_builds',Math.min(50,Math.max(1,Number($('buildCount').value)||10)));pyodide.globals.set('limit_slot',Math.min(150,Math.max(5,Number($('limitPerSlot').value)||80)));const raw=pyodide.runPython(`import json\nmods=json.loads(mods_json)\nprofile=json.loads(profile_json)\nr=optimizer.find_top_builds(mods, number_of_builds=n_builds, limit_per_slot=limit_slot, kyber=profile, character=${JSON.stringify(character)})\njson.dumps(r)`).toJs();renderResults(JSON.parse(raw));}catch(e){$('optimizerError').textContent=String(e);$('results').innerHTML='';}});
function renderResults(data){if(!data.length){$('results').textContent='Aucun build.';return;}$('results').innerHTML=data.map((r,i)=>`<article class="result"><div class="rank">#${i+1}</div><div><strong>Score ${Number(r.score).toFixed(2)}</strong><div class="stats">${Object.entries(r.stats||{}).map(([k,v])=>`${k}: ${typeof v==='number'?Number(v).toFixed(1):v}`).join(' · ')}</div><div class="mods">${(r.build||[]).map(m=>`${m.slot||'?'} / ${m.set_name||m.set||'?'} / ${m.primary_stat||'?'} ${m.primary_value??''}`).join('<br>')}</div></div></article>`).join('');}
$('clearData').addEventListener('click',()=>{currentData=null;mods=[];$('modsCount').textContent='0';$('charsCount').textContent='0';if($('shipsCount'))$('shipsCount').textContent='0';fillCharacters([]);$('results').textContent='Importez d’abord vos données.';$('dataInfo').textContent='Aucune donnée.';$('log').textContent='Données effacées.';});
document.querySelectorAll('.nav').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.nav').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));btn.classList.add('active');$(btn.dataset.page).classList.add('active');}));
boot();
