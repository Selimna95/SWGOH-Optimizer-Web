let pyodide = null;
let optimizerReady = false;
let optimizerWorker = null;
let optimizerRequestId = 0;
let optimizerTimer = null;
let currentData = null;
let mods = [];
let profiles = {};
let optimizerProfiles = {};
let currentDataset = 'characters';
let modFiltersReady = false;
let rosterCharacters = [];
let rosterShips = [];
let factionMap = {};
let analysisSelectedCharacter = '';
let analysisFaction = '';
let analysisMode = 'character';
let analysisInventoryRows = [];
let analysisSide = 'ALL';
let analysisStatus = 'TOUS';
let analysisAuditSpeed = 'TOUS';
let analysisAuditSort = 'priority';

const $ = (id) => document.getElementById(id);
function log(msg) { $('log').textContent += `\n${msg}`; $('log').scrollTop = $('log').scrollHeight; }
function setRuntime(text, ok=false) { $('runtime').textContent = text; $('runtime').classList.toggle('ok', ok); }
function cleanAllyCode(value) { return String(value || '').replace(/\D/g, '').slice(0, 9); }
function formatAlly(code) { const x=cleanAllyCode(code); return x.length===9 ? `${x.slice(0,3)}-${x.slice(3,6)}-${x.slice(6)}` : x; }
function slug(s) { return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
function esc(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function num(value, digits=0) { const n=Number(value); return Number.isFinite(n) ? n.toLocaleString('fr-FR',{maximumFractionDigits:digits}) : '0'; }

function statNameFromAny(value) {
  const rawNames = {1:'Health',5:'Speed',17:'Potency',18:'Tenacity',28:'Protection',41:'Offense',42:'Defense',45:'Critical Chance',48:'Offense',49:'Defense',53:'Critical Chance',55:'Health',56:'Protection',57:'Speed'};
  if (value == null) return '';
  if (typeof value === 'number') return rawNames[value] || String(value);
  if (typeof value === 'string' || typeof value === 'number') {
    const text=String(value).trim();
    if (/^\d+$/.test(text) && rawNames[Number(text)]) return rawNames[Number(text)];
    return text;
  }
  if (typeof value !== 'object') return '';
  let raw=value.name ?? value.stat ?? value.unitStat ?? value.unitStatId ?? value.statId ?? value.type ?? '';
  if (raw && typeof raw === 'object') raw=raw.name ?? raw.unitStat ?? raw.unitStatId ?? raw.statId ?? '';
  if (/^\d+$/.test(String(raw)) && rawNames[Number(raw)]) return rawNames[Number(raw)];
  return String(raw).trim();
}
function statValueFromAny(value) {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const text=value.trim();
    const m=text.match(/[-+]?\d+(?:[.,]\d+)?/);
    return m ? Number(m[0].replace(',','.')) : 0;
  }
  if (typeof value === 'object') {
    if (value.display_value != null) return statValueFromAny(value.display_value);
    if (value.displayValue != null) return statValueFromAny(value.displayValue);
    if (value.value != null && typeof value.value !== 'object') return statValueFromAny(value.value);
    if (value.amount != null) return statValueFromAny(value.amount);
    if (value.unscaledDecimalValue != null) return Number(value.unscaledDecimalValue) / 100000000;
    if (value.unscaled_decimal_value != null) return Number(value.unscaled_decimal_value) / 100000000;
  }
  return 0;
}
function statObjectFromAny(value) {
  if (value == null) return {stat:'', value:0};
  if (typeof value === 'object') {
    const nested = value.stat && typeof value.stat === 'object' ? value.stat : value;
    const display = nested.display_value ?? nested.displayValue ?? value.display_value ?? value.displayValue;
    let stat = statNameFromAny(nested.name ?? nested.stat ?? nested.unitStat ?? nested.unitStatId ?? value.name ?? value.stat ?? value.unitStat ?? value.unitStatId);
    if (display != null && /%/.test(String(display)) && stat && !/%$/.test(stat)) stat += ' %';
    const val = display != null ? statValueFromAny(display) : statValueFromAny(nested.value ?? nested.amount ?? nested.unscaledDecimalValue ?? nested.unscaled_decimal_value ?? value.value ?? value.amount);
    return {stat, value:val, display_value:display ?? ''};
  }
  return {stat:String(value).trim(), value:0, display_value:''};
}
function normalizeMod(m, index=0) {
  if (!m || typeof m !== 'object') return null;
  const out = {...m};
  out.game_id = out.game_id ?? out.id ?? out.modId ?? out.uid ?? `web-${index}`;
  out.slot = out.slot ?? out.slot_id ?? out.slotId ?? out.mod_slot ?? out.modSlot ?? out.shape;
  out.set_name = out.set_name ?? out.set ?? out.setName ?? out.setId ?? out.modSetId ?? out.mod_set_id;
  if (out.set_name && typeof out.set_name === 'object') out.set_name = out.set_name.name ?? out.set_name.id ?? out.set_name.setId ?? out.set_name.modSetId;

  const primaryRaw = out.primary_stat ?? out.primaryStat ?? out.primary ?? out.primaryStatValue;
  const primary = statObjectFromAny(primaryRaw);
  out.primary_stat = primary.stat || (typeof out.primary_stat === 'string' ? out.primary_stat : '');
  out.primary_value = primary.display_value ? primary.value : statValueFromAny(out.primary_value ?? out.primaryValue ?? primaryRaw?.value ?? primaryRaw?.amount ?? 0);

  const secs = out.secondary_stats ?? out.secondaryStats ?? out.secondaryStat ?? out.secondary ?? [];
  if (Array.isArray(secs)) secs.slice(0,4).forEach((raw,i)=>{
    const s=statObjectFromAny(raw);
    out[`secondary_${i+1}_stat`] = s.stat;
    out[`secondary_${i+1}_value`] = s.display_value ? s.value : statValueFromAny(raw?.value ?? raw?.amount ?? raw?.unscaledDecimalValue ?? raw?.unscaled_decimal_value ?? s.value);
  });

  out.level = Number(out.level ?? 0);
  out.rarity = Number(out.rarity ?? out.pips ?? 0);
  out.character = out.character ?? out.characterName ?? out.equippedTo ?? out.equipped_to ?? out.usingIn ?? '';
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
function setText(id, value) { const el=$(id); if(el) el.textContent=String(value); }
function updateRosterCounts(characters, ships) {
  const c=Array.isArray(characters)?characters.length:0, s=Array.isArray(ships)?ships.length:0, m=Array.isArray(mods)?mods.length:0;
  setText('charsCount',c); setText('shipsCount',s); setText('unitsCount',c+s); setText('modsCount',m);
  setText('tabCharsCount',c); setText('tabShipsCount',s); setText('tabModsCount',m);
}
function optimizerProfileForCharacter(character) {
  if (!character || !optimizerProfiles || typeof optimizerProfiles !== 'object') return null;
  const base=String(character?.baseId||character?.base_id||'').toUpperCase();
  const name=slug(character?.name||character?.character||'');
  if (base && optimizerProfiles[base]) return optimizerProfiles[base];
  for (const p of Object.values(optimizerProfiles)) {
    if (base && String(p?.base_id||'').toUpperCase()===base) return p;
    if (name && slug(p?.name||p?.character)===name) return p;
  }
  return null;
}
function baseStatsForCharacter(character) {
  const direct=character?.base_stats || character?.baseStats;
  if (direct && typeof direct === 'object') return direct;
  const p=optimizerProfileForCharacter(character);
  if (p?.base_stats && typeof p.base_stats === 'object') return p.base_stats;
  const stats=character?.stats;
  if (stats && typeof stats === 'object') return stats;
  return {};
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

function normalizeKyberKey(value){return String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'');}
function kyberProfileValid(p){if(!p||typeof p!=='object')return false;const a=p.averages||{};return Number(a.Speed||0)>=100&&Number(a.Health||0)>=10000&&Number(a.Protection||0)>=10000;}
function cleanLinesFromDoc(doc){const body=doc?.body;if(!body)return[];const clone=body.cloneNode(true);clone.querySelectorAll('script,style,noscript').forEach(n=>n.remove());clone.querySelectorAll('br').forEach(n=>n.replaceWith(document.createTextNode('\n')));clone.querySelectorAll('div,p,li,tr,h1,h2,h3,h4,h5,h6,section,article,table,thead,tbody,th,td').forEach(n=>n.insertBefore(document.createTextNode('\n'),n.firstChild));return String(clone.textContent||'').split(/\n+/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);}
function numberFromText(value){const m=String(value??'').replace(/,/g,'').match(/[-+]?[0-9]+(?:\.[0-9]+)?/);return m?Number(m[0]):0;}
function parseKyberProfileHTML(text,character,kyberSlug){const lines=cleanLinesFromDoc(parseHTML(text));const profile={character:String(character||''),source:'SWGOH.GG Kyber / Top 1000 GAC',url:`https://swgoh.gg/units/${kyberSlug}/best-mods/`,sets:[],slots:{},averages:{},secondary_focus:{}};const pct=/^(.+?)\s+([0-9]+(?:\.[0-9]+)?)%$/;const findIndex=(pred,start=0)=>{for(let i=start;i<lines.length;i++)if(pred(lines[i]))return i;return -1;};let i=lines.indexOf('Primary Set');if(i>=0){const j=findIndex(x=>x==='Secondary Set',i+1);for(const line of lines.slice(i+1,j>=0?j:lines.length)){const m=line.match(pct);if(!m)continue;const label=m[1].trim();let base=label.replace(/^Triple\s+/,'').replace(/^Double\s+/,'').trim();if(base==='Crit Damage')base='Critical Damage';const count=label.startsWith('Triple ')?6:label.startsWith('Double ')?4:['Health','Defense','Potency','Tenacity','Critical Chance','Critical Avoidance'].includes(base)?2:4;profile.sets.push({name:base,count,weight:Number(m[2])/100});}}
i=lines.indexOf('Secondary Stat Focus');if(i>=0){const j=findIndex(x=>x==='Relic',i+1);const labels=new Set(['Speed','Health','Protection','Offense','Defense','Potency','Tenacity','Critical Chance %','Critical Damage','Critical Chance','Offense %','Health %','Protection %','Defense %','Armor','Resistance','Physical Damage','Special Damage']);for(let k=i+1;k<(j>=0?j:lines.length)-1;k++){if(!labels.has(lines[k]))continue;const next=lines[k+1]||'';if(/avg/i.test(next)){profile.secondary_focus[lines[k]]=numberFromText(next);k++;}}}
i=findIndex(x=>/^Average Stats for /i.test(x));if(i>=0){const j=findIndex(x=>/^Best Mod Set for /i.test(x),i+1);const block=lines.slice(i+1,j>=0?j:lines.length);for(const stat of ['Health','Protection','Speed','Physical Damage','Special Damage','Armor','Potency','Tenacity']){const idx=block.findIndex(x=>x===stat);if(idx>=0&&block[idx+1])profile.averages[stat]=numberFromText(block[idx+1]);}}
for(const [slot,prefix] of [['Arrow','Best Arrow Mod '],['Triangle','Best Triangle Mod '],['Circle','Best Circle Mod '],['Cross','Best Cross Mod ']]){const idx=findIndex(x=>x.startsWith(prefix));if(idx<0)continue;const prim={};for(let k=idx+1;k<lines.length;k++){if(lines[k].startsWith('Best '))break;const m=lines[k].match(pct);if(m&&m[1]!=='Primary Stat')prim[m[1].trim()]=Number(m[2])/100;}if(Object.keys(prim).length)profile.slots[slot]={primaries:prim};}
if(!Object.keys(profile.averages).length){const text=lines.join('\n');for(const stat of ['Health','Protection','Speed']){const m=text.match(new RegExp('\\b'+stat+'\\s+([0-9][0-9,]*(?:\\.[0-9]+)?)','i'));if(m)profile.averages[stat]=numberFromText(m[1]);}}return kyberProfileValid(profile)?profile:null;}
async function fetchKyberProfile(character){if(!character)return null;const existing=profileForCharacter(character);if(kyberProfileValid(existing))return existing;const display=character.name||character.character||character.baseId||character.base_id||'';const candidates=[];const add=v=>{const s=slug(v);if(s&&!candidates.includes(s))candidates.push(s);};add(display);add(character.baseId||character.base_id);const tryCandidate=async candidate=>{try{const r=await fetch(`${workerUrl()}/?path=best-mods&slug=${encodeURIComponent(candidate)}`,{headers:{'Accept':'text/html,application/xhtml+xml'}});if(!r.ok)return null;const html=await r.text();if(!/Best Mods|Data Slice:\s*Kyber/i.test(html))return null;return parseKyberProfileHTML(html,display,candidate);}catch(e){return null;}};for(const candidate of candidates){const parsed=await tryCandidate(candidate);if(parsed){profiles[candidate]=parsed;return parsed;}}try{const r=await fetch(`${workerUrl()}/?path=characters-index`,{headers:{'Accept':'text/html,application/xhtml+xml'}});if(r.ok){const doc=parseHTML(await r.text());const wanted=normalizeKyberKey(display);for(const a of doc.querySelectorAll('a[href*="/units/"]')){const label=normalizeKyberKey(a.textContent);const href=a.getAttribute('href')||'';const m=href.match(/\/units\/([^/]+)/);if(label===wanted&&m){const candidate=m[1];const parsed=await tryCandidate(candidate);if(parsed){profiles[candidate]=parsed;return parsed;}}}}}catch(e){}return null;}
let kyberRequestSeq=0;
async function ensureSelectedKyberProfile(){const c=selectedCharacter();if(!c)return null;const seq=++kyberRequestSeq;$('characterInfo').innerHTML=`<span class="tag">${esc(c.baseId||c.base_id||'')}</span> <strong>${esc(c.name||c.character||c.baseId||'')}</strong> · récupération du profil Kyber…`;const p=await fetchKyberProfile(c);if(seq===kyberRequestSeq)updateCharacterInfo();if(p)log(`Référence Kyber récupérée : ${c.name||c.baseId}.`);else log(`Référence Kyber indisponible : ${c.name||c.baseId}.`);return p;}
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
function slotFromShape(shape){const s=String(shape||'').toLowerCase();return ({'1':'Square','2':'Square','3':'Arrow','4':'Diamond','5':'Triangle','6':'Circle','7':'Cross',transmitter:'Square',receiver:'Arrow',processor:'Diamond','holo-array':'Triangle','data-bus':'Circle',multiplexer:'Cross'})[s]||shape;}
function parseStatGeneric(node){if(!node)return{stat:'',value:0};const label=firstText(node,['.statmod-stat-label','[class*="statmod-stat-label"]','[data-stat-name]'])||node.getAttribute?.('data-stat-name')||'';const raw=firstText(node,['.statmod-stat-value','[class*="statmod-stat-value"]','[data-stat-value]'])||node.getAttribute?.('data-stat-value')||node.textContent||'';return{stat:label.trim(),value:parseNumberValue(raw)};}
function parseModsPage(doc,page){
  const nodes=[...doc.querySelectorAll('.collection-mod, [class*="collection-mod"], [data-mod-id], [data-id].mod')],result=[];
  nodes.forEach((node,idx)=>{const alt=firstAttr(node,['.statmod-img','img[class*="statmod-img"]'],'alt');const words=alt.trim().split(/\s+/).filter(Boolean);const shape=words.at(-1)||'';const set=words.length>=5?words.slice(2,-1).join(' '):(words.length>=4?words[2]:'');const primary=parseStatGeneric(node.querySelector('.statmod-stats-1 .statmod-stat, [class*="statmod-stats-1"] [class*="statmod-stat"]'));const secondary=[...node.querySelectorAll('.statmod-stats-2 .statmod-stat, [class*="statmod-stats-2"] [class*="statmod-stat"]')].map(parseStatGeneric).filter(x=>x.stat);const char=firstAttr(node,['img.char-portrait-img','img[class*="char-portrait-img"]'],'alt');const level=parseNumberValue(firstText(node,['.statmod-level','[class*="statmod-level"]']));const rarity=node.querySelectorAll('.statmod-pip, [class*="statmod-pip"]').length;const id=node.getAttribute('data-id')||node.getAttribute('data-mod-id')||`gg-${page}-${idx}`;if(shape||set||primary.stat||secondary.length)result.push(normalizeMod({game_id:id,slot:slotFromShape(shape),set_name:set,rarity,level,primary_stat:primary.stat,primary_value:primary.value,secondary_stats:secondary,character:char},page*1000+idx));});
  return result.filter(Boolean);
}
function parseCharacters(doc){const result=[],nodes=[...doc.querySelectorAll('.collection-char-list .collection-char, .collection-char, [class*="collection-char"]')],seen=new Set();for(const node of nodes){const name=firstText(node,['.collection-char-name-link','[class*="collection-char-name"]','a[href*="/character/"]']);if(!name||seen.has(name))continue;seen.add(name);const level=parseNumberValue(firstText(node,['.char-portrait-full-level','[class*="char-portrait-full-level"]']));let gear=0;const portrait=node.querySelector('.player-char-portrait,[class*="player-char-portrait"]');for(let i=1;i<=13;i++)if(portrait?.classList.contains(`char-portrait-full-gear-t${i}`))gear=i;const stars=[...node.querySelectorAll('.star, [class*="star"]')].filter(x=>!String(x.className).includes('inactive')).length;result.push({name,level,gear,stars});}return result;}
function looksLikeMod(o){
  if(!o||typeof o!=='object')return false;
  const keys=Object.keys(o).map(k=>k.toLowerCase());
  return (keys.includes('slot')||keys.includes('slot_id')||keys.includes('modslot')||keys.includes('shape')) &&
         (keys.includes('level')||keys.includes('pips')||keys.includes('rarity')) &&
         (keys.includes('set')||keys.includes('set_id')||keys.includes('setname')||keys.includes('setid')||keys.includes('primary')||keys.includes('primary_stat')||keys.includes('primarystat'));
}
function extractApiMods(json){
  const out=[]; let i=0;
  const visit=(o)=>{ if(!o||typeof o!=='object')return; if(looksLikeMod(o)) out.push(normalizeMod({...o,game_id:o.id||o.uid||o.modId||`api-${i}`},i++)); };
  // Prefer known mod arrays/containers when present, then fall back to a recursive walk.
  const known=[];
  for(const key of ['mods','Mods','data']) if(Array.isArray(json?.[key])) known.push(...json[key]);
  if(Array.isArray(json?.mods)) known.push(...json.mods);
  if(known.length) known.forEach(visit);
  if(!out.length) walkObjects(json,visit);
  const seen=new Set();
  return out.filter(m=>m&&!seen.has(m.game_id)&&seen.add(m.game_id));
}
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
    log('Lecture des mods publics pour décoder les statistiques affichées…');
    const htmlMods=[];
    for(let page=1;page<=100;page++){
      const pageMods=parseModsPage(parseHTML(await fetchText(`${base}/mods/?page=${page}`)),page);
      if(!pageMods.length)break;
      htmlMods.push(...pageMods);
      log(`Page mods ${page}: ${pageMods.length} mods.`);
      if(pageMods.length<30)break;
    }
    // Les pages publiques donnent les valeurs réellement affichées (ex. 8 Speed, 5.88%).
    // L'API reste un filet de sécurité pour les éventuels mods non présents dans les pages.
    const merged=[...htmlMods];
    const seenIds=new Set(merged.map(m=>m.game_id));
    for(const m of apiMods){ if(!seenIds.has(m.game_id)){ merged.push(m); seenIds.add(m.game_id); } }
    const seen=new Set();mods=merged.filter(m=>m&&!seen.has(m.game_id)&&seen.add(m.game_id));
    log(`Mods décodés : ${htmlMods.length} via pages publiques + ${Math.max(0,mods.length-htmlMods.length)} compléments API = ${mods.length}.`);
    currentData={allyCode,name:title,characters:chars,ships,mods};updateRosterCounts(chars,ships);buildFactionMap();fillCharacters(chars);updateAccountSummary(title,fmt);renderV18SpeedRecap('v18DashboardSpeed');renderModsAnalysis();renderDataTable();
    $('dataInfo').textContent=`Source: SWGOH.GG public pages${workerUrl()?' + Cloudflare Worker relay':''}\nJoueur: ${title}\nAlly Code: ${fmt}\nPersonnages: ${chars.length}\nVaisseaux: ${ships.length}\nUnités totales: ${chars.length+ships.length}\nMods: ${mods.length}\nProfils Kyber disponibles dans cette version: ${Object.keys(profiles).length}`;
    log(`TERMINÉ : ${chars.length} personnages, ${ships.length} vaisseaux, ${mods.length} mods exploitables.`);if(!mods.length)log('Aucun mod lisible. Utilise l’import JSON en attendant.');document.querySelector('[data-page="data"]').click();
  }catch(e){log(`Échec du chargement : ${e.message||e}`);log('Si le relais est configuré et renvoie une erreur HTTP, utilise l’import JSON.');}
  finally{$('loadPlayer').disabled=false;$('loadPlayer').textContent='CHARGER MON PROFIL';}
}
function updateAccountSummary(title,fmt){$('accountSummary').innerHTML=`<div><span>JOUEUR</span><strong>${esc(title)}</strong></div><div><span>ALLY CODE</span><strong>${esc(fmt)}</strong></div><div><span>PERSONNAGES</span><strong>${rosterCharacters.length}</strong></div><div><span>VAISSEAUX</span><strong>${rosterShips.length}</strong></div><div><span>MODS</span><strong>${mods.length}</strong></div>`;}

function modSetLabel(value){
  const raw=String(value??'').trim();
  if(!raw)return '';
  const key=raw.toLowerCase().replace(/[_-]+/g,' ');
  const map={'1':'Health','2':'Offense','3':'Defense','4':'Speed','5':'Crit Chance','6':'Crit Damage','7':'Potency','8':'Tenacity','health':'Health','offense':'Offense','defense':'Defense','speed':'Speed','crit chance':'Crit Chance','crit damage':'Crit Damage','potency':'Potency','tenacity':'Tenacity'};
  return map[raw]||map[key]||raw;
}
function modSlotLabel(value){
  const raw=String(value??'').trim();
  const key=raw.toLowerCase().replace(/[_-]+/g,' ');
  const map={'1':'Square','2':'Square','3':'Arrow','4':'Diamond','5':'Triangle','6':'Circle','7':'Cross','square':'Square','arrow':'Arrow','diamond':'Diamond','triangle':'Triangle','circle':'Circle','cross':'Cross','transmitter':'Square','receiver':'Arrow','processor':'Diamond','holo array':'Triangle','data bus':'Circle','multiplexer':'Cross'};
  return map[raw]||map[key]||raw;
}
function normalizeModForDisplay(m){
  if(!m)return m;
  const out={...m};
  out.set_name=modSetLabel(out.set_name??out.set??out.setId??out.set_id);
  out.slot=modSlotLabel(out.slot??out.slot_id??out.slotId??out.modSlot);
  out.character=out.character??out.characterName??out.equippedTo??out.equipped_to??'';
  out.level=Number(out.level??0);
  out.rarity=Number(out.rarity??out.pips??0);
  return out;
}
function prepareModFilters(){
  const setSel=$('modSetFilter'),slotSel=$('modSlotFilter');
  if(!setSel||!slotSel)return;
  const sets=[...new Set(mods.map(m=>normalizeModForDisplay(m).set_name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr'));
  const slots=[...new Set(mods.map(m=>normalizeModForDisplay(m).slot).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr'));
  setSel.innerHTML='<option value="">Tous les sets</option>'+sets.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  slotSel.innerHTML='<option value="">Tous les slots</option>'+slots.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  modFiltersReady=true;
}
function renderModSummary(rows){
  const box=$('modSummary'); if(!box)return;
  if(currentDataset!=='mods'){box.hidden=true;return;}
  const equipped=rows.filter(m=>String(m.character||'').trim()).length;
  const free=rows.length-equipped;
  const six=rows.filter(m=>Number(m.level)>=15).length;
  box.hidden=false;
  box.innerHTML=`<div><span>MODS FILTRÉS</span><strong>${num(rows.length)}</strong></div><div><span>ÉQUIPÉS</span><strong>${num(equipped)}</strong></div><div><span>LIBRES</span><strong>${num(free)}</strong></div><div><span>NIVEAU 15</span><strong>${num(six)}</strong></div>`;
}
function getFilteredMods(){
  const q=String($('dataSearch')?.value||'').trim().toLowerCase();
  const set=String($('modSetFilter')?.value||'');
  const slot=String($('modSlotFilter')?.value||'');
  const owner=String($('modOwnerFilter')?.value||'');
  const minLevel=Number($('modLevelFilter')?.value||0);
  return mods.map(normalizeModForDisplay).filter(m=>{
    const text=JSON.stringify(m).toLowerCase();
    if(q&&!text.includes(q))return false;
    if(set&&m.set_name!==set)return false;
    if(slot&&m.slot!==slot)return false;
    const equipped=String(m.character||'').trim().length>0;
    if(owner==='equipped'&&!equipped)return false;
    if(owner==='free'&&equipped)return false;
    if(Number(m.level||0)<minLevel)return false;
    return true;
  });
}
function displayModStat(name,value){const n=String(name||'');return `${n} ${num(value,1)}${n.endsWith(' %')?'%':''}`;}
function modSecondaries(m){const arr=[];for(let i=1;i<=4;i++){const s=m[`secondary_${i}_stat`],v=m[`secondary_${i}_value`];if(s)arr.push(displayModStat(s,v));}return arr.join(' · ');}
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
    const filterBox=$('modFilters'); if(filterBox)filterBox.hidden=false;
    if(!modFiltersReady)prepareModFilters();
    rows=getFilteredMods();
    rows.sort((a,b)=>{const sa=String(a.set_name||''),sb=String(b.set_name||'');return sa.localeCompare(sb,'fr')||Number(b.level||0)-Number(a.level||0)||String(a.slot||'').localeCompare(String(b.slot||''),'fr');});
    $('dataTableMeta').textContent=`${rows.length} mod(s) affiché(s) sur ${mods.length}`;
    renderModSummary(rows);
    $('dataTable').innerHTML=rows.length?`<table><thead><tr><th>Slot</th><th>Set</th><th>Primaire</th><th>Secondaires</th><th>Niv.</th><th>Rareté</th><th>Équipé</th></tr></thead><tbody>${rows.map(m=>`<tr><td><strong>${esc(m.slot||'—')}</strong></td><td>${esc(m.set_name||'—')}</td><td><strong>${esc(m.primary_stat||'—')}</strong> ${num(m.primary_value,1)}${String(m.primary_stat||'').endsWith(' %')?'%':''}</td><td>${esc(modSecondaries(m)||'—')}</td><td>${num(m.level)}</td><td>${num(m.rarity)}★</td><td>${esc(m.character||'Libre')}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">Aucun mod ne correspond aux filtres.</div>';
  }
}

$('loadPlayer').addEventListener('click',loadRemotePlayer);$('allyCode').addEventListener('keydown',e=>{if(e.key==='Enter')loadRemotePlayer();});$('saveRelay').addEventListener('click',saveWorkerUrl);$('relayUrl').value=localStorage.getItem('swgohRelayUrl')||'';$('relayState').textContent=workerUrl()?'RELAIS CONFIGURÉ':'RELAIS NON CONFIGURÉ';$('character').addEventListener('change',()=>{updateCharacterInfo();ensureSelectedKyberProfile();});$('dataSearch').addEventListener('input',renderDataTable);['modSetFilter','modSlotFilter','modOwnerFilter','modLevelFilter'].forEach(id=>$(id)?.addEventListener('input',renderDataTable));
document.querySelectorAll('.data-tab').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.data-tab').forEach(x=>x.classList.remove('active'));btn.classList.add('active');currentDataset=btn.dataset.dataset;const mf=$('modFilters'),ms=$('modSummary');if(mf)mf.hidden=currentDataset!=='mods';if(ms)ms.hidden=currentDataset!=='mods';renderDataTable();}));


function getOptimizerWorker() {
  if (optimizerWorker) return optimizerWorker;
  optimizerWorker = new Worker('./optimizer-worker.mjs', { type: 'module' });
  optimizerWorker.addEventListener('error', (event) => {
    log('Erreur du Worker Python : ' + (event.message || 'erreur inconnue'));
  });
  return optimizerWorker;
}

function runOptimizationInWorker(character, profile, nBuilds, limitSlot) {
  const worker = getOptimizerWorker();
  const id = ++optimizerRequestId;
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const onMessage = (event) => {
      const data = event.data || {};
      if (data.id !== id) return;
      if (data.type === 'status') {
        $('results').innerHTML = `<div class="calculating">${esc(data.message || 'Calcul en cours…')}<br><small>Temps écoulé : ${Math.round((performance.now()-started)/1000)} s</small></div>`;
        return;
      }
      worker.removeEventListener('message', onMessage);
      if (data.type === 'done') {
        resolve(JSON.parse(data.result));
      } else {
        reject(new Error(data.error || 'Erreur inconnue du Worker Python.'));
      }
    };
    worker.addEventListener('message', onMessage);
    worker.postMessage({ id, mods, profile, base_stats: baseStatsForCharacter(character), n_builds: nBuilds, limit_slot: limitSlot, character_name: character.name || character.baseId || '' });
  });
}


/* ========================= V18 — ANALYSE MODS / INVENTAIRE / FACTIONS ========================= */

const V176_FACTION_RULES = {
  "Jedi":["JEDI","YODA","KITFISTO","PLOKOON","AAYLASECURA","BARRISSOFFEE","MACEWINDU","QUIGON","KELLERAN","JARJARBINKS","KENOBI"],
  "Sith":["SITH","DARTH","PALPATINE","SIDIOUS","VADER","MAUL","TALON","TRAYA","NIHILUS","SION","SAKURA","KYLOREN"],
  "Empire":["VADER","PALPATINE","EMPEROR","TARKIN","THRAWN","PIETT","VEERS","STARCK","GIDEON","SHORETROOPER","DEATHTROOPER","STORMTROOPER","ROYALGUARD","DARKTROOPER","EMPIRE"],
  "Imperial Trooper":["VEERS","PIETT","STARCK","GIDEON","RANGETROOPER","DEATHTROOPER","SNOWTROOPER","SHORETROOPER","MAGMATROOPER","DARKTROOPER","MORTAR","SCOUTTROOPER"],
  "Clone Trooper":["CLONE","REX","CODY","FIVES","ECHO","WOLFFE","ARC","SHAAKTI","BATCHER"],
  "501st":["501ST","REX","FIVES","ARC","ECHO","GENERALSKYWALKER"],
  "Bad Batch":["BADBATCH","BATCHERS","OMEGA","TECH","WRECKER","CROSSHAIR"],
  "Galactic Republic":["PADME","JEDIMASTERKENOBI","GENERALKENOBI","ANAKIN","AHSOKA","CLONE","REX","CODY","MACEWINDU","PLOKOON","KITFISTO","REPUBLIC"],
  "Separatist":["SEPARATIST","DOOKU","GRIEVOUS","ASAJJ","NUTEGUNRAY","WAT","GEONOSIAN","B2SUPERBATTLE","B1BATTLE","DROIDEKA","MAGNAGUARD","SEPARATIST"],
  "Geonosian":["GEONOSIAN","BROODALPHA","SUNFAC","POGGLE","GEONOSIANSPY","GEO"],
  "Rebel":["REBEL","LUKE","LEIA","HAN","CHEWBACCA","ACKBAR","LANDO","WEDGE","BIGGS","HERA","EZRA","KANAN","SABINE","CHOPPER","ZEB","SAWGERRERA","JYNERSO","CASSIANANDOR","K2SO","RADDUS","MONMOTHMA"],
  "Rebel Fighter":["MONMOTHMA","SAWGERRERA","CASSIANANDOR","JYNERSO","CARADUNE","KYLEKATARN","BISTAN","PAO","HOTHREBELSOLDIER","BIGGSDARKLIGHTER"],
  "Rogue One":["JYNERSO","CASSIANANDOR","K2SO","RADDUS","BISTAN","CHIRRUTIMWE","BAZEMALBUS","PAO"],
  "Resistance":["RESISTANCE","REY","FINN","POE","BB8","ROSE","HOLDO","AMILYNHOLDO","ZORII"],
  "First Order":["FIRSTORDER","KYLO","HUX","PHASMA","SITHTROOPER","FOEXECUTIONER","FOSITHTROOPER","FOE","FOSTORM"],
  "Mandalorian":["MANDALOR","MANDO","BOKATAN","ARMORER","SABINE","GARSAAXON","PREVIZSLA","MAULS7","JANGO"],
  "Bounty Hunter":["BOBA","BOSSK","DENGAR","IG88","CADBANE","AURRA","FENNEC","JANGO","EMBO","ZAM","GREEDO","GREEF","MANDO","BOUNTY"],
  "Scoundrel":["SCOUT","SMUGGLER","HONDO","QIRA","ENFYS","ZALBAR","MISSION","SMUGGLERHAN","L3","VANDOR","SOLO","CHEWBACCA"],
  "Hutt Cartel":["HUTT","JABBA","BOUNTY","BOBA","CADBANE","GREEDO","KRRSANTAN","EMBO"],
  "Droid":["DROID","R2D2","C3PO","BB8","K2SO","T3M4","HK47","IG88","DROIDEKA","B1BATTLE","B2SUPERBATTLE","L3"],
  "Ewok":["EWOK","WICKET","PAPLOO","LOGRAY","ELDER","CHIEFCHIRPA","SCOUT"],
  "Nightsister":["NIGHTSISTER","ASAJJ","TALZIN","DAKA","ZOMBIE","NIGHTSISTERACOLYTE","NIGHTSISTERSPIRIT"],
  "Tusken":["TUSKEN","URRURRURR","CHIEFNEBIT","TUSKENRAIDER","TUSKENSHAMAN"],
  "Phoenix":["PHOENIX","HERA","EZRA","KANAN","SABINE","ZEB","CHOPPER","GARAZEB"],
  "Old Republic":["REVAN","BASTILA","JOLEE","JUHANI","CANDEROUS","T3M4","MISSIONVAO"],
  "Sith Empire":["DARKREVAN","DARTHREVAN","BASTILASHANDARK","SITHTROOPER","SITHMARAUDER","HK47","MALAK"],
  "Inquisitorius":["INQUISITOR","FIFTHBROTHER","SEVENTHSISTER","EIGHTHBROTHER","NINTHSISTER","THIRDBROTHER","MARROK"]
};

function compactKey(v){ return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,''); }
function characterKey(c){ return compactKey(c?.baseId??c?.base_id??c?.name??c?.character??''); }
function modOwnerKey(m){ return compactKey(m?.character??m?.baseId??m?.base_id??m?.characterId??m?.character_id??''); }
function getCharacterMods(c){
  if(!c) return [];
  const targets=new Set([characterKey(c),compactKey(c.name),compactKey(c.baseId),compactKey(c.base_id)].filter(Boolean));
  return mods.map(normalizeModForDisplay).filter(m=>{
    const owner=modOwnerKey(m);
    return owner && [...targets].some(t=>owner===t);
  }).slice(0,6).sort((a,b)=>({Square:0,Arrow:1,Diamond:2,Triangle:3,Circle:4,Cross:5}[a.slot]??99)-({Square:0,Arrow:1,Diamond:2,Triangle:3,Circle:4,Cross:5}[b.slot]??99));
}
function modSpeedMetrics(m){
  const primary=compactKey(m.primary_stat)==='SPEED';
  let secondary=null;
  for(let i=1;i<=4;i++){
    if(compactKey(m[`secondary_${i}_stat`])==='SPEED'){ secondary=Number(m[`secondary_${i}_value`]); break; }
  }
  return {secondary:Number.isFinite(secondary)?secondary:null,primary};
}
function modPrimarySpeed(m){ return modSpeedMetrics(m).primary ? Number(m.primary_value||0) : 0; }
function modTotalSpeed(m){ const x=modSpeedMetrics(m); return (x.secondary||0)+modPrimarySpeed(m); }
function speedCategory(v){
  const n=Number(v||0);
  if(n<=0)return 'no_speed';
  if(n<=10)return '1_10';
  if(n<=15)return '11_15';
  if(n<=21)return '16_21';
  return '22plus';
}
function speedCategoryLabel(k){ return ({'1_10':'1 – 10','11_15':'11 – 15','16_21':'16 – 21','22plus':'> 21','no_speed':'Sans Speed','primary_speed':'Primaire Speed'})[k]||k; }
function v176ModStatus(modsForCharacter){
  const list=Array.isArray(modsForCharacter)?modsForCharacter:[];
  const count=Math.min(6,list.length);
  const totalSpeed=list.reduce((s,m)=>s+modTotalSpeed(m),0);
  if(count===0)return {status:'SANS MODS',class:'critical',totalSpeed};
  if(count<6)return {status:'INCOMPLETS',class:'incomplete',totalSpeed};
  if(totalSpeed<30)return {status:'TRÈS FAIBLES',class:'verylow',totalSpeed};
  if(totalSpeed<50)return {status:'FAIBLES',class:'low',totalSpeed};
  if(totalSpeed<70)return {status:'MOYENS',class:'medium',totalSpeed};
  return {status:'BONS',class:'good',totalSpeed};
}
function factionsForCharacter(c){
  const out=[];
  const raw=c?.raw||c?.data||{};
  const candidates=[];
  const add=(v)=>{if(v==null)return;if(Array.isArray(v))v.forEach(add);else if(typeof v==='object'){['name','displayName','nameKey','id','categoryId','faction'].forEach(k=>add(v[k]));}else candidates.push(String(v));};
  ['factions','faction','categories','category','categoryIdList','categoryIds'].forEach(k=>add(raw?.[k]));
  const rawText=compactKey(candidates.join(' '));
  const key=compactKey(`${c?.baseId||''} ${c?.name||''} ${c?.character||''} ${candidates.join(' ')}`);
  for(const [faction,needles] of Object.entries(V176_FACTION_RULES)){
    const fk=compactKey(faction);
    if(candidates.some(v=>compactKey(v)===fk || compactKey(v).includes(fk) || fk.includes(compactKey(v))) ||
       needles.some(n=>key.includes(compactKey(n))) || (rawText && rawText.includes(fk))) out.push(faction);
  }
  return [...new Set(out)];
}
function buildFactionMap(){
  factionMap={};
  for(const c of rosterCharacters){
    if(rosterUnitType(c)==='ship')continue;
    factionMap[characterKey(c)] = factionsForCharacter(c);
  }
  return factionMap;
}
function charactersInFaction(faction){
  if(!faction || faction==='Toutes les factions') return [...rosterCharacters];
  return rosterCharacters.filter(c=>(factionMap[characterKey(c)]||[]).includes(faction));
}
function allFactions(){
  const set=new Set();
  for(const c of rosterCharacters) for(const f of (factionMap[characterKey(c)]||[])) set.add(f);
  return [...set].sort((a,b)=>a.localeCompare(b,'fr'));
}
function speedBreakdown(list=mods){
  const out={'1_10':0,'11_15':0,'16_21':0,'22plus':0,'no_speed':0,'primary_speed':0,total:0};
  for(const raw of list){
    const m=normalizeModForDisplay(raw); out.total++;
    const x=modSpeedMetrics(m);
    if(x.primary) out.primary_speed++;
    else out[speedCategory(x.secondary)]++;
  }
  return out;
}
function inventoryRows(){
  return mods.map((raw,i)=>{
    const m=normalizeModForDisplay(raw);
    const x=modSpeedMetrics(m);
    return {...m,_index:i,_speed:x.secondary||0,_primarySpeed:x.primary,_totalSpeed:modTotalSpeed(m),_speedCategory:x.primary?'primary_speed':speedCategory(x.secondary)};
  });
}
function renderV18SpeedRecap(containerId='v18SpeedRecap'){
  const box=$(containerId); if(!box)return;
  const b=speedBreakdown(mods);
  const cards=[
    ['1_10','1 – 10','secondary'],['11_15','11 – 15','secondary'],['16_21','16 – 21','secondary'],['22plus','> 21','secondary'],
    ['primary_speed','Primaire Speed','primary'],['no_speed','Sans Speed','secondary']
  ];
  box.innerHTML=cards.map(([k,label])=>`<button class="speed-recap-card speed-${k}" data-speed-category="${k}"><span>${label}</span><strong>${num(b[k])}</strong><small>${b.total?((b[k]/b.total)*100).toFixed(1):'0.0'} %</small></button>`).join('');
  box.querySelectorAll('[data-speed-category]').forEach(el=>el.addEventListener('click',()=>{
    const k=el.dataset.speedCategory;
    showPage('mods-analysis');
    setTimeout(()=>{setAnalysisTab('inventory'); $('analysisSpeedFilter').value=k; renderInventory();},0);
  }));
}
function showPage(page){
  document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('active',x.dataset.page===page));
  document.querySelectorAll('.page').forEach(x=>x.classList.toggle('active',x.id===page));
  if(page==='mods-analysis') renderModsAnalysis();
}
function setAnalysisTab(tab){
  document.querySelectorAll('.analysis-tab').forEach(x=>x.classList.toggle('active',x.dataset.analysisTab===tab));
  document.querySelectorAll('.analysis-panel').forEach(x=>x.hidden=x.dataset.analysisPanel!==tab);
  if(tab==='recap') renderAnalysisRecap();
  if(tab==='selection') renderSelectionPanel();
  if(tab==='inventory') renderInventory();
}
function analysisCharacterRows(){
  const faction=analysisFaction||'Toutes les factions';
  return charactersInFaction(faction).map(c=>{
    const cm=getCharacterMods(c); const s=v176ModStatus(cm);
    const secSpeed=cm.reduce((n,m)=>n+(modSpeedMetrics(m).secondary||0),0);
    const primarySpeed=cm.reduce((n,m)=>n+modPrimarySpeed(m),0);
    return {character:c,mods:cm,modCount:cm.length,speed:secSpeed,primarySpeed,totalSpeed:s.totalSpeed,status:s.status,class:s.class,best:cm.reduce((mx,m)=>Math.max(mx,modSpeedMetrics(m).secondary||0),0),factions:factionMap[characterKey(c)]||[]};
  }).sort((a,b)=>b.totalSpeed-a.totalSpeed||String(a.character.name).localeCompare(String(b.character.name),'fr'));
}
function renderAnalysisRecap(){
  const b=speedBreakdown(mods);
  const el=$('analysisRecap'); if(!el)return;
  const sets={}; for(const raw of mods){const m=normalizeModForDisplay(raw);sets[m.set_name]=(sets[m.set_name]||0)+1;}
  const setRows=Object.entries(sets).sort((a,b)=>b[1]-a[1]).slice(0,12);
  el.innerHTML=`<div class="v18-summary-grid">
    <div class="v18-kpi"><span>MODS</span><strong>${num(b.total)}</strong><small>${mods.filter(m=>String(normalizeModForDisplay(m).character||'').trim()).length} équipés</small></div>
    <div class="v18-kpi"><span>1 – 10 SPEED</span><strong>${num(b['1_10'])}</strong><small>${b.total?((b['1_10']/b.total)*100).toFixed(1):0}%</small></div>
    <div class="v18-kpi"><span>11 – 15 SPEED</span><strong>${num(b['11_15'])}</strong><small>${b.total?((b['11_15']/b.total)*100).toFixed(1):0}%</small></div>
    <div class="v18-kpi"><span>16 – 21 SPEED</span><strong>${num(b['16_21'])}</strong><small>${b.total?((b['16_21']/b.total)*100).toFixed(1):0}%</small></div>
    <div class="v18-kpi"><span>&gt; 21 SPEED</span><strong>${num(b['22plus'])}</strong><small>${b.total?((b['22plus']/b.total)*100).toFixed(1):0}%</small></div>
    <div class="v18-kpi"><span>PRIMAIRE SPEED</span><strong>${num(b.primary_speed)}</strong><small>flèches Speed</small></div>
    <div class="v18-kpi"><span>SANS SPEED</span><strong>${num(b.no_speed)}</strong><small>aucune secondaire Speed</small></div>
  </div>
  <div class="v18-two-col">
    <div><h3>VENTILATION PAR VITESSE</h3><div id="v18SpeedRecap" class="speed-recap-grid"></div></div>
    <div><h3>SETS — STOCK ACTUEL</h3><div class="set-bars">${setRows.map(([s,n])=>`<div class="set-row"><span>${esc(s)}</span><b>${num(n)}</b><i><em style="width:${Math.max(3,(n/b.total)*100)}%"></em></i></div>`).join('')}</div></div>
  </div>`;
  renderV18SpeedRecap();
}
function characterAlignmentFromFactions(c){
  const fs=factionMap[characterKey(c)]||[];
  const light=new Set(['Jedi','Rebel','Rebel Fighter','Resistance','Galactic Republic','501st','Clone Trooper','Bad Batch','Phoenix','Rogue One','Old Republic','Ewok','Scoundrel','Mandalorian']).size;
  const dark=new Set(['Sith','Sith Empire','Empire','Imperial Trooper','First Order','Separatist','Nightsister','Inquisitorius','Geonosian','Bounty Hunter','Hutt Cartel']).size;
  const hasL=fs.some(f=>['Jedi','Rebel','Rebel Fighter','Resistance','Galactic Republic','501st','Clone Trooper','Bad Batch','Phoenix','Rogue One','Old Republic','Ewok','Scoundrel'].includes(f));
  const hasD=fs.some(f=>['Sith','Sith Empire','Empire','Imperial Trooper','First Order','Separatist','Nightsister','Inquisitorius','Geonosian'].includes(f));
  if(hasL&&!hasD)return 'LIGHT'; if(hasD&&!hasL)return 'DARK'; return 'MIXED';
}
function auditRows(){
  const faction=analysisFaction||'Toutes les factions';
  let rows=charactersInFaction(faction).filter(c=>rosterUnitType(c)!=='ship').map(c=>{
    const cm=getCharacterMods(c), st=v176ModStatus(cm);
    const secSpeed=cm.reduce((n,m)=>n+(modSpeedMetrics(m).secondary||0),0);
    const primarySpeed=cm.reduce((n,m)=>n+modPrimarySpeed(m),0);
    const speedCats=new Set(); let speedCount=0;
    for(const m of cm){const x=modSpeedMetrics(m); if(x.primary)speedCats.add('primary_speed'); else speedCats.add(speedCategory(x.secondary)); if((x.secondary||0)>0)speedCount++;}
    const p=optimizerProfileForCharacter(c)||{};
    const relic=Number(c.relic_tier??c.relicTier??p.relic_tier??0)||0;
    const priority=(cm.length===0?100000:cm.length<6?50000:0)+Math.max(0,70-st.totalSpeed)*100+relic*2;
    return {character:c,mods:cm,modCount:cm.length,secSpeed,primarySpeed,totalSpeed:st.totalSpeed,status:st.status,class:st.class,best:cm.reduce((mx,m)=>Math.max(mx,modSpeedMetrics(m).secondary||0),0),factions:factionMap[characterKey(c)]||[],relic,speedCount,speedCats,priority,side:characterAlignmentFromFactions(c)};
  });
  if(analysisSide!=='ALL') rows=rows.filter(r=>r.side===analysisSide);
  if(analysisStatus!=='TOUS') rows=rows.filter(r=>r.status===analysisStatus);
  if(analysisAuditSpeed!=='TOUS') rows=rows.filter(r=>r.speedCats.has(analysisAuditSpeed));
  if(analysisAuditSort==='speed') rows.sort((a,b)=>a.secSpeed-b.secSpeed||a.relic-b.relic);
  else if(analysisAuditSort==='mods') rows.sort((a,b)=>a.modCount-b.modCount||a.secSpeed-b.secSpeed||b.relic-a.relic);
  else if(analysisAuditSort==='relic') rows.sort((a,b)=>b.relic-a.relic||b.secSpeed-a.secSpeed);
  else rows.sort((a,b)=>b.priority-a.priority||a.secSpeed-b.secSpeed||b.relic-a.relic||String(a.character.name||'').localeCompare(String(b.character.name||''),'fr'));
  return rows;
}
function renderSelectionPanel(){
  const factionSelect=$('analysisFaction'), charSelect=$('analysisCharacter'); if(!factionSelect||!charSelect)return;
  if(analysisMode==='character') analysisFaction='Toutes les factions';
  const factions=['Toutes les factions',...allFactions()];
  factionSelect.innerHTML=factions.map(f=>`<option value="${esc(f)}">${esc(f)}</option>`).join('');
  factionSelect.disabled=analysisMode==='character'; factionSelect.value=analysisFaction||'Toutes les factions';
  const chars=charactersInFaction(analysisFaction||'Toutes les factions').filter(c=>rosterUnitType(c)!=='ship').sort((a,b)=>String(a.name||a.baseId).localeCompare(String(b.name||b.baseId),'fr'));
  charSelect.innerHTML=chars.map(c=>`<option value="${esc(characterKey(c))}">${esc(c.name||c.baseId)}</option>`).join('');
  if(analysisSelectedCharacter && chars.some(c=>characterKey(c)===analysisSelectedCharacter)) charSelect.value=analysisSelectedCharacter;
  else if(chars.length) {analysisSelectedCharacter=characterKey(chars[0]);charSelect.value=analysisSelectedCharacter;}
  const rows=auditRows();
  const all=charactersInFaction(analysisFaction||'Toutes les factions').filter(c=>rosterUnitType(c)!=='ship');
  $('selectionMeta').textContent=`${rows.length} personnage(s) affiché(s) sur ${all.length} · ${analysisFaction||'Toutes les factions'}`;
  $('selectionTable').innerHTML=rows.map(r=>`<tr class="${r.class}" data-character-key="${esc(characterKey(r.character))}">
    <td><strong>${esc(r.character.name||r.character.baseId)}</strong><small>${esc(r.factions.join(' · '))}</small></td>
    <td>${r.relic?'R'+num(r.relic):'—'}</td><td>${r.modCount}/6</td><td>${num(r.totalSpeed)}</td><td>${num(r.secSpeed)}</td><td>${r.speedCount}</td><td>${r.primarySpeed?num(r.primarySpeed):'NON'}</td><td><span class="audit-badge ${r.class}">${esc(r.status)}</span></td>
  </tr>`).join('')||'<tr><td colspan="8">Aucun personnage ne correspond aux filtres.</td></tr>';
  $('selectionTable').querySelectorAll('[data-character-key]').forEach(row=>row.addEventListener('click',()=>{analysisSelectedCharacter=row.dataset.characterKey;charSelect.value=analysisSelectedCharacter;renderCharacterDetail();}));
  renderCharacterDetail();
}
function renderCharacterDetail(){
  const c=rosterCharacters.find(x=>characterKey(x)===analysisSelectedCharacter);
  const box=$('characterModDetail'); if(!box)return;
  if(!c){box.innerHTML='<div class="empty">Sélectionnez un personnage.</div>';return;}
  const cm=getCharacterMods(c), s=v176ModStatus(cm);
  const secSpeed=cm.reduce((n,m)=>n+(modSpeedMetrics(m).secondary||0),0), primarySpeed=cm.reduce((n,m)=>n+modPrimarySpeed(m),0);
  box.innerHTML=`<div class="character-detail-head"><div><span class="tag">${esc(c.baseId||'')}</span><h2>${esc(c.name||c.baseId)}</h2><p>Niveau ${num(c.level)} · Gear ${num(c.gear)} · ${num(c.stars)}★ · Puissance ${num(c.power)} · Factions : ${esc((factionMap[characterKey(c)]||[]).join(' · ')||'—')}</p></div><div class="detail-kpis"><b>${cm.length}/6</b><span>mods</span><b>${num(secSpeed)}</b><span>Speed secondaire</span><b>${num(primarySpeed)}</b><span>Speed primaire</span><strong class="audit-badge ${s.class}">${esc(s.status)}</strong></div></div>
  <div class="mod-detail-grid">${[...cm,...Array(Math.max(0,6-cm.length)).fill(null)].slice(0,6).map((m,i)=>m?renderModCard(m):`<div class="mod-card empty-slot"><strong>${['Square','Arrow','Diamond','Triangle','Circle','Cross'][i]}</strong><span>MOD MANQUANT</span></div>`).join('')}</div>`;
}
function renderModCard(m){
  const x=modSpeedMetrics(m), speed=x.secondary??0, owner=m.character||'Libre';
  const sec=modSecondaries(m)||'—';
  const speedClass=x.primary?'speed_primary':speedCategory(speed);
  return `<button class="mod-detail-card ${speedClass}" data-mod-index="${m._index??''}">
    <div class="mod-card-top"><strong>${esc(m.slot||'—')}</strong><span>${esc(m.set_name||'—')}</span></div>
    <div class="mod-primary"><b>${esc(m.primary_stat||'—')}</b> ${num(m.primary_value,1)}</div>
    <div class="mod-speed-line">${x.primary?'Primaire Speed':(speed>0?`Speed secondaire +${num(speed)}`:'Sans Speed')}</div>
    <div class="mod-secondaries">${esc(sec)}</div>
    <small>Niv. ${num(m.level)} · ${num(m.rarity)}★ · ${esc(owner)}</small>
  </button>`;
}
function renderInventory(){
  const wrap=$('inventoryTable'), meta=$('inventoryMeta'); if(!wrap)return;
  const q=String($('analysisSearch')?.value||'').trim().toLowerCase();
  const set=$('analysisSetFilter')?.value||'', slot=$('analysisSlotFilter')?.value||'', speed=$('analysisSpeedFilter')?.value||'', owner=$('analysisOwnerFilter')?.value||'', primary=$('analysisPrimaryFilter')?.value||'';
  const minLevel=Number($('analysisLevelFilter')?.value||0);
  let rows=inventoryRows().filter(m=>{
    if(q && !JSON.stringify(m).toLowerCase().includes(q))return false;
    if(set && m.set_name!==set)return false;
    if(slot && m.slot!==slot)return false;
    if(speed && m._speedCategory!==speed)return false;
    const equipped=String(m.character||'').trim()!=='';
    if(owner==='equipped'&&!equipped)return false;
    if(owner==='free'&&equipped)return false;
    if(primary && compactKey(m.primary_stat)!==compactKey(primary))return false;
    if(m.level<minLevel)return false;
    return true;
  });
  const sort=$('analysisSort')?.value||'speed_desc';
  rows.sort((a,b)=>{
    if(sort==='speed_desc') return b._totalSpeed-a._totalSpeed;
    if(sort==='speed_asc') return a._totalSpeed-b._totalSpeed;
    if(sort==='level_desc') return b.level-a.level||b._totalSpeed-a._totalSpeed;
    if(sort==='set') return String(a.set_name).localeCompare(String(b.set_name),'fr')||b._totalSpeed-a._totalSpeed;
    if(sort==='slot') return String(a.slot).localeCompare(String(b.slot),'fr')||b._totalSpeed-a._totalSpeed;
    return String(a.character||'').localeCompare(String(b.character||''),'fr');
  });
  meta.textContent=`${rows.length} mod(s) affiché(s) sur ${mods.length}`;
  wrap.innerHTML=rows.map(m=>{
    const x=modSpeedMetrics(m);
    return `<tr class="${m._speedCategory}" data-mod-index="${m._index}">
      <td><strong>${esc(m.slot||'—')}</strong></td><td>${esc(m.set_name||'—')}</td>
      <td><strong>${esc(m.primary_stat||'—')}</strong> ${num(m.primary_value,1)}</td>
      <td>${esc(modSecondaries(m)||'—')}</td><td class="speed-cell">${x.primary?'★':(x.secondary?`+${num(x.secondary)}`:'—')}</td>
      <td>${num(m.level)}</td><td>${num(m.rarity)}★</td><td>${esc(m.character||'Libre')}</td>
    </tr>`;
  }).join('')||'<tr><td colspan="8">Aucun mod ne correspond aux filtres.</td></tr>';
  wrap.querySelectorAll('[data-mod-index]').forEach(row=>row.addEventListener('click',()=>showModInventoryDetail(Number(row.dataset.modIndex))));
}
function showModInventoryDetail(index){
  const raw=mods[index]; if(!raw)return;
  const m=normalizeModForDisplay(raw), x=modSpeedMetrics(m);
  const modal=$('modDetailModal'); if(!modal)return;
  $('modDetailTitle').textContent=`${m.slot||'Mod'} · ${m.set_name||'—'}`;
  $('modDetailBody').innerHTML=`<div class="modal-mod-grid">
    <div><span>ID</span><b>${esc(m.game_id||m.id||'—')}</b></div>
    <div><span>PROPRIÉTAIRE</span><b>${esc(m.character||'Libre')}</b></div>
    <div><span>SET</span><b>${esc(m.set_name||'—')}</b></div>
    <div><span>SLOT</span><b>${esc(m.slot||'—')}</b></div>
    <div><span>PRIMAIRE</span><b>${esc(m.primary_stat||'—')} ${num(m.primary_value,1)}</b></div>
    <div><span>SPEED</span><b>${x.primary?'Primaire Speed':(x.secondary?`+${num(x.secondary)} secondaire`:'Aucune')}</b></div>
    <div><span>NIVEAU</span><b>${num(m.level)}</b></div>
    <div><span>RARETÉ</span><b>${num(m.rarity)}★</b></div>
  </div><h3>SECONDAIRES</h3><ul>${[1,2,3,4].map(i=>m[`secondary_${i}_stat`]?`<li>${esc(m[`secondary_${i}_stat`])} : <strong>${num(m[`secondary_${i}_value`],1)}</strong></li>`:'').join('')||'<li>Aucune donnée secondaire.</li>'}</ul>`;
  modal.hidden=false;
}
function closeModDetail(){if($('modDetailModal'))$('modDetailModal').hidden=true;}
function prepareV18Filters(){
  const sets=[...new Set(mods.map(m=>normalizeModForDisplay(m).set_name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr'));
  const primaries=[...new Set(mods.map(m=>normalizeModForDisplay(m).primary_stat).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr'));
  const setSel=$('analysisSetFilter'), primSel=$('analysisPrimaryFilter');
  if(setSel)setSel.innerHTML='<option value="">Tous les sets</option>'+sets.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  if(primSel)primSel.innerHTML='<option value="">Toutes les primaires</option>'+primaries.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
}
function renderModsAnalysis(){
  buildFactionMap(); prepareV18Filters();
  if(!analysisSelectedCharacter && rosterCharacters.length) analysisSelectedCharacter=characterKey(rosterCharacters[0]);
  renderV18SpeedRecap();
  const tab=document.querySelector('.analysis-tab.active')?.dataset.analysisTab||'recap';
  setAnalysisTab(tab);
}

async function boot(){try{setRuntime('CHARGEMENT PYTHON…');pyodide=await loadPyodide();const optimizer=await fetch('python/optimizer.py').then(r=>r.text());const kyber=await fetch('python/kyber_profiles.json').then(r=>r.text());const optimizerProfilesText=await fetch('python/optimizer_profiles.json').then(r=>r.text());optimizerProfiles=JSON.parse(optimizerProfilesText);pyodide.FS.writeFile('/home/pyodide/optimizer.py',optimizer);pyodide.FS.writeFile('/home/pyodide/kyber_profiles.json',kyber);pyodide.FS.writeFile('/home/pyodide/optimizer_profiles.json',optimizerProfilesText);pyodide.runPython(`import sys; sys.path.append('/home/pyodide'); import optimizer, json`);profiles=JSON.parse(kyber);optimizerReady=true;$('pythonState').textContent='OK';setRuntime('PYTHON WEBASSEMBLY PRÊT',true);log('Moteur Python chargé dans le navigateur.');}catch(e){setRuntime('ERREUR PYTHON');$('pythonState').textContent='ERREUR';log('Erreur Python: '+e);}}

$('fileInput').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{currentData=JSON.parse(await file.text());mods=extractMods(currentData);const importedUnits=extractCharacters(currentData);const split=splitRosterUnits(importedUnits);rosterCharacters=split.characters;rosterShips=split.ships;buildFactionMap();updateRosterCounts(rosterCharacters,rosterShips);fillCharacters(rosterCharacters);updateAccountSummary(file.name,'IMPORT JSON');renderV18SpeedRecap('v18DashboardSpeed');renderModsAnalysis();renderDataTable();$('dataInfo').textContent=`Fichier: ${file.name}\nMods détectés: ${mods.length}\nPersonnages détectés: ${rosterCharacters.length}\nVaisseaux détectés: ${rosterShips.length}`;$('log').textContent='';log(`Import: ${file.name}`);log(`${mods.length} mods détectés.`);log(`${rosterCharacters.length} personnages + ${rosterShips.length} vaisseaux détectés.`);document.querySelector('[data-page="data"]').click();}catch(e){log('JSON invalide: '+e.message);}});

$('runOptimizer').addEventListener('click',async()=>{
  $('optimizerError').textContent='';
  $('results').innerHTML='<div class="calculating">Préparation de l’optimisation…<br><small>Le calcul va maintenant s’exécuter dans un Worker séparé pour garder l’interface réactive.</small></div>';
  if(!optimizerReady||!mods.length){$('optimizerError').textContent='Python ou mods non disponibles.';return;}
  const character=selectedCharacter();
  if(!character){$('optimizerError').textContent='Sélectionnez un personnage.';return;}
  const profile=await ensureSelectedKyberProfile();
  if(!profile){$('optimizerError').textContent=`Référence Kyber indisponible pour « ${character.name||character.baseId} ».`;$('results').innerHTML='';return;}

  const nBuilds=Math.min(50,Math.max(1,Number($('buildCount').value)||10));
  const limitSlot=Math.min(150,Math.max(5,Number($('limitPerSlot').value)||80));
  $('runOptimizer').disabled=true;
  $('runOptimizer').textContent='CALCUL EN COURS…';
  const baseStats=baseStatsForCharacter(character); log(`Optimisation lancée pour ${character.name||character.baseId} · ${nBuilds} builds · ${limitSlot} candidats/slot · stats de base ${Object.keys(baseStats).length ? 'chargées' : 'indisponibles'}.`);
  const started=performance.now();
  try {
    const data=await runOptimizationInWorker(character,profile,nBuilds,limitSlot);
    renderResults(data);
    log(`Optimisation terminée en ${((performance.now()-started)/1000).toFixed(1)} s · ${data.length} build(s).`);
  } catch(e) {
    $('optimizerError').textContent=String(e?.message||e);
    $('results').innerHTML='<div class="empty">Le calcul Python a rencontré une erreur. Consultez le journal ci-dessus.</div>';
    log('Erreur optimisation : '+String(e?.message||e));
  } finally {
    $('runOptimizer').disabled=false;
    $('runOptimizer').textContent='LANCER L’OPTIMISATION';
  }
});
function renderResults(data){if(!data.length){$('results').textContent='Aucun build.';return;}$('results').innerHTML=data.map((r,i)=>`<article class="result"><div class="rank">#${i+1}</div><div><div class="result-head"><strong>Score ${Number(r.score).toFixed(2)}</strong></div><div class="stats">${Object.entries(r.stats||{}).map(([k,v])=>`${esc(k)}: ${typeof v==='number'?num(v,1):esc(v)}`).join(' · ')}</div><div class="build-grid">${(r.build||[]).map(m=>`<div class="mod-card"><strong>${esc(m.slot||'?')}</strong><span>${esc(m.set_name||m.set||'?')}</span><span>${esc(m.primary_stat||'?')} ${num(m.primary_value,1)}${String(m.primary_stat||'').endsWith(' %')?'%':''}</span><small>${esc([1,2,3,4].map(i=>m[`secondary_${i}_stat`]?displayModStat(m[`secondary_${i}_stat`],m[`secondary_${i}_value`]):'').filter(Boolean).join(' · '))}</small></div>`).join('')}</div></div></article>`).join('');}

$('clearData').addEventListener('click',()=>{currentData=null;mods=[];modFiltersReady=false;const mf=$('modFilters'),ms=$('modSummary');if(mf)mf.hidden=true;if(ms)ms.hidden=true;rosterCharacters=[];rosterShips=[];factionMap={};analysisSelectedCharacter='';analysisFaction='';analysisSide='ALL';analysisStatus='TOUS';analysisAuditSpeed='TOUS';analysisAuditSort='priority';updateRosterCounts([],[]);fillCharacters([]);if($('v18DashboardSpeed'))$('v18DashboardSpeed').innerHTML='';$('results').textContent='Chargez d’abord vos données.';$('dataInfo').textContent='Aucune donnée.';$('accountSummary').innerHTML='<span>Aucune donnée chargée.</span>';$('dataTableMeta').textContent='Aucune donnée.';$('dataTable').innerHTML='<div class="empty">Chargez un profil pour afficher les données.</div>';$('log').textContent='Données effacées.';});

document.querySelectorAll('.analysis-tab').forEach(btn=>btn.addEventListener('click',()=>setAnalysisTab(btn.dataset.analysisTab)));
$('analysisFaction')?.addEventListener('change',()=>{analysisFaction=$('analysisFaction').value;analysisSelectedCharacter='';renderSelectionPanel();});
$('analysisSide')?.addEventListener('change',()=>{analysisSide=$('analysisSide').value;renderSelectionPanel();});
$('analysisStatus')?.addEventListener('change',()=>{analysisStatus=$('analysisStatus').value;renderSelectionPanel();});
$('analysisAuditSpeed')?.addEventListener('change',()=>{analysisAuditSpeed=$('analysisAuditSpeed').value;renderSelectionPanel();});
$('analysisAuditSort')?.addEventListener('change',()=>{analysisAuditSort=$('analysisAuditSort').value;renderSelectionPanel();});
$('analysisCharacter')?.addEventListener('change',()=>{analysisSelectedCharacter=$('analysisCharacter').value;renderCharacterDetail();});
$('analysisMode')?.addEventListener('change',()=>{analysisMode=$('analysisMode').value;renderSelectionPanel();});
['analysisSearch','analysisSetFilter','analysisSlotFilter','analysisSpeedFilter','analysisOwnerFilter','analysisPrimaryFilter','analysisLevelFilter','analysisSort'].forEach(id=>$(id)?.addEventListener('input',renderInventory));
$('closeModDetail')?.addEventListener('click',closeModDetail);
$('modDetailModal')?.addEventListener('click',e=>{if(e.target.id==='modDetailModal')closeModDetail();});

document.querySelectorAll('.nav').forEach(btn=>btn.addEventListener('click',()=>{showPage(btn.dataset.page);if(btn.dataset.page==='data')renderDataTable();}));

boot();
