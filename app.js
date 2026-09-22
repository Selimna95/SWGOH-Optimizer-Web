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
function parseModsPage(doc,page){
  const result=[];
  doc.querySelectorAll('.collection-mod').forEach((node,idx)=>{
    const alt=node.querySelector('.statmod-img')?.getAttribute('alt')||'';
    const words=alt.trim().split(/\s+/); const shape=words[words.length-1]||''; const set=words.length>=4?words.slice(2,-1).join(' '):'';
    const primary=statFromNode(node.querySelector('.statmod-stats-1 .statmod-stat'));
    const secondary=[]; node.querySelectorAll('.statmod-stats-2 .statmod-stat').forEach(x=>secondary.push(statFromNode(x)));
    const char=node.querySelector('img.char-portrait-img')?.getAttribute('alt')||'';
    const level=textNumber(node.querySelector('.statmod-level')?.textContent||'0'); const rarity=node.querySelectorAll('.statmod-pip').length;
    result.push(normalizeMod({game_id:node.getAttribute('data-id')||`gg-${page}-${idx}`,slot:slotFromShape(shape),set_name:set,rarity,level,primary_stat:primary.stat,primary_value:primary.value,secondary_stats:secondary,character:char},page*100+idx));
  });
  return result.filter(Boolean);
}
function parseCharacters(doc){
  const result=[];
  doc.querySelectorAll('.collection-char-list .collection-char').forEach(node=>{
    const name=node.querySelector('.collection-char-name-link')?.textContent?.trim(); if(!name)return;
    const level=textNumber(node.querySelector('.char-portrait-full-level')?.textContent||'0'); let gear=0;
    const portrait=node.querySelector('.player-char-portrait'); for(let i=1;i<=13;i++)if(portrait?.classList.contains(`char-portrait-full-gear-t${i}`))gear=i;
    const stars=[...node.querySelectorAll('.star')].filter(x=>!x.classList.contains('star-inactive')).length; result.push({name,level,gear,stars});
  }); return result;
}

async function loadRemotePlayer(){
  const allyCode=cleanAllyCode($('allyCode').value);
  if(allyCode.length!==9){log('Ally Code invalide : 9 chiffres attendus.');return;}
  $('loadPlayer').disabled=true;$('loadPlayer').textContent='CHARGEMENT…';$('log').textContent='';
  const fmt=formatAlly(allyCode); log(`Recherche du joueur ${fmt}…`);
  try{
    if(workerUrl()) log('Relais Cloudflare actif : récupération via relais sécurisé.'); else log('Aucun relais configuré : tentative directe depuis le navigateur.');
    const base=`https://swgoh.gg/p/${allyCode}`;
    const profileText=await fetchText(`${base}/`); const profileDoc=parseHTML(profileText);
    const title=profileDoc.querySelector('h1')?.textContent?.trim()||'Joueur'; const bodyText=profileDoc.body.textContent||'';
    const rosterMatch=bodyText.match(/Roster\s+([0-9,]+)\s+units/i); const modsMatch=bodyText.match(/([0-9,]+)\s+Mods/i);
    log(`Profil SWGOH.GG trouvé : ${title}.`); if(rosterMatch)log(`Roster annoncé : ${rosterMatch[1]} unités.`); if(modsMatch)log(`Mods annoncés : ${modsMatch[1]}.`);
    log('Lecture du roster…'); const chars=parseCharacters(parseHTML(await fetchText(`${base}/characters/`))); log(`${chars.length} personnages récupérés.`);
    log('Lecture des mods (pages publiques)…'); const allMods=[];
    for(let page=1;page<=50;page++){
      const pageMods=parseModsPage(parseHTML(await fetchText(`${base}/mods/?page=${page}`)),page);
      if(!pageMods.length)break; allMods.push(...pageMods); log(`Page mods ${page}: ${pageMods.length} mods.`); if(pageMods.length<30)break;
    }
    const seen=new Set(); mods=allMods.filter(m=>{const id=m.game_id;if(seen.has(id))return false;seen.add(id);return true;});
    currentData={allyCode,name:title,characters:chars,mods}; $('modsCount').textContent=mods.length;$('charsCount').textContent=chars.length;fillCharacters(chars);
    $('dataInfo').textContent=`Source: SWGOH.GG public pages${workerUrl()?' + Cloudflare Worker relay':''}\nJoueur: ${title}\nAlly Code: ${fmt}\nPersonnages: ${chars.length}\nMods: ${mods.length}`;
    log(`TERMINÉ : ${chars.length} personnages, ${mods.length} mods exploitables.`); if(!mods.length)log('Aucun mod lisible. Utilise l’import JSON en attendant.');
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
$('fileInput').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{currentData=JSON.parse(await file.text());mods=extractMods(currentData);const chars=extractCharacters(currentData);$('modsCount').textContent=mods.length;$('charsCount').textContent=chars.length;fillCharacters(chars);$('dataInfo').textContent=`Fichier: ${file.name}\nMods détectés: ${mods.length}\nPersonnages détectés: ${chars.length}`;$('log').textContent='';log(`Import: ${file.name}`);log(`${mods.length} mods détectés.`);document.querySelector('[data-page="optimizer"]').click();}catch(e){log('JSON invalide: '+e.message);}});
$('runOptimizer').addEventListener('click',()=>{$('optimizerError').textContent='';$('results').innerHTML='Calcul…';if(!optimizerReady||!mods.length){$('optimizerError').textContent='Python ou mods non disponibles.';return;}const character=$('character').value;const key=Object.keys(profiles).find(k=>slug(profiles[k].character)===slug(character));const profile=key?profiles[key]:null;if(!profile){$('optimizerError').textContent=`Profil Kyber non trouvé pour « ${character} ».`;$('results').innerHTML='';return;}try{pyodide.globals.set('mods_json',JSON.stringify(mods));pyodide.globals.set('profile_json',JSON.stringify(profile));pyodide.globals.set('n_builds',Math.min(50,Math.max(1,Number($('buildCount').value)||10)));pyodide.globals.set('limit_slot',Math.min(150,Math.max(5,Number($('limitPerSlot').value)||80)));const raw=pyodide.runPython(`import json\nmods=json.loads(mods_json)\nprofile=json.loads(profile_json)\nr=optimizer.find_top_builds(mods, number_of_builds=n_builds, limit_per_slot=limit_slot, kyber=profile, character=${JSON.stringify(character)})\njson.dumps(r)`).toJs();renderResults(JSON.parse(raw));}catch(e){$('optimizerError').textContent=String(e);$('results').innerHTML='';}});
function renderResults(data){if(!data.length){$('results').textContent='Aucun build.';return;}$('results').innerHTML=data.map((r,i)=>`<article class="result"><div class="rank">#${i+1}</div><div><strong>Score ${Number(r.score).toFixed(2)}</strong><div class="stats">${Object.entries(r.stats||{}).map(([k,v])=>`${k}: ${typeof v==='number'?Number(v).toFixed(1):v}`).join(' · ')}</div><div class="mods">${(r.build||[]).map(m=>`${m.slot||'?'} / ${m.set_name||m.set||'?'} / ${m.primary_stat||'?'} ${m.primary_value??''}`).join('<br>')}</div></div></article>`).join('');}
$('clearData').addEventListener('click',()=>{currentData=null;mods=[];$('modsCount').textContent='0';$('charsCount').textContent='0';fillCharacters([]);$('results').textContent='Importez d’abord vos données.';$('dataInfo').textContent='Aucune donnée.';$('log').textContent='Données effacées.';});
document.querySelectorAll('.nav').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.nav').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));btn.classList.add('active');$(btn.dataset.page).classList.add('active');}));
boot();
