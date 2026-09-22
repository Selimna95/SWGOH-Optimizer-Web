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
let accountGalacticPower = { total: 0, characters: 0, ships: 0 };

const $ = (id) => document.getElementById(id);
function log(msg) { $('log').textContent += `\n${msg}`; $('log').scrollTop = $('log').scrollHeight; }
function setRuntime(text, ok=false) { $('runtime').textContent = text; $('runtime').classList.toggle('ok', ok); }
function cleanAllyCode(value) { return String(value || '').replace(/\D/g, '').slice(0, 9); }
function formatAlly(code) { const x=cleanAllyCode(code); return x.length===9 ? `${x.slice(0,3)}-${x.slice(3,6)}-${x.slice(6)}` : x; }
function slug(s) { return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
function esc(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function num(value, digits=0) { const n=Number(value); return Number.isFinite(n) ? n.toLocaleString('fr-FR',{maximumFractionDigits:digits}) : '0'; }
function parseLabeledNumber(text,label){const escaped=String(label).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const m=String(text||'').match(new RegExp(escaped+'\\s*([0-9][0-9,]*)','i'));return m?Number(String(m[1]).replace(/,/g,'')):0;}
function extractGalacticPowerFromProfile(text){const body=String(text||'');let total=parseLabeledNumber(body,'Galactic Power');const characters=parseLabeledNumber(body,'Galactic Power (Characters)');const ships=parseLabeledNumber(body,'Galactic Power (Ships)');if(!total)total=characters+ships;return {total,characters,ships};}
function renderGalacticPower(){const t=accountGalacticPower.total,c=accountGalacticPower.characters,s=accountGalacticPower.ships;setText('gpTotal',t?num(t):'0');setText('gpCharacters',c?num(c):'0');setText('gpShips',s?num(s):'0');setText('gpBreakdown',t?`${num(c)} terrestre · ${num(s)} spatial`:'En attente de synchronisation');}

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
  setText('topUnitsCount',c+s);
  const pct=(c+s+m)>0?100:0; setText('healthPercent',pct+'%'); setText('healthText',pct?'Synchronisé':'En attente');
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
function workerUrl() {
  const stored = String(localStorage.getItem('swgohRelayUrl') || '').trim().replace(/\/$/,'');
  const field = String($('relayUrl')?.value || '').trim().replace(/\/$/,'');
  const candidate = stored || field || DEFAULT_WORKER_URL;
  try {
    const u = new URL(candidate);
    if (!/^https?:$/.test(u.protocol)) throw new Error('protocol');
    return u.origin + u.pathname.replace(/\/$/,'');
  } catch(e) {
    return DEFAULT_WORKER_URL;
  }
}
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
function unitToCharacter(u,index=0){const o=u?.data&&typeof u.data==='object'?u.data:u;if(!o||typeof o!=='object')return null;const baseId=o.base_id??o.baseId??o.definitionId;const name=o.name??o.character??o.characterName??o.unitName;const hasRosterFields=baseId&&Number.isFinite(Number(o.level))&&Number.isFinite(Number(o.rarity))&&(Object.prototype.hasOwnProperty.call(o,'gear_level')||Object.prototype.hasOwnProperty.call(o,'gearLevel')||Object.prototype.hasOwnProperty.call(o,'gear')||Object.prototype.hasOwnProperty.call(o,'power')||Object.prototype.hasOwnProperty.call(o,'combat_type'));if(!hasRosterFields)return null;const relicTierRaw=o.relic_tier??o.relicTier??o.relic_level??o.relicLevel??o.relic?.tier??o.relic?.relicTier??0;return{name:name||baseId,baseId,level:Number(o.level||0),gear:Number(o.gear_level??o.gearLevel??o.gear??0),stars:Number(o.rarity??o.starLevel??o.stars??0),power:Number(o.power||0),combatType:Number(o.combat_type??o.combatType??1),relic_tier:Number(relicTierRaw)||0,raw:u};}
function extractApiCharacters(json){const direct=Array.isArray(json?.units)?json.units:[];let out=direct.map(unitToCharacter).filter(Boolean);if(!out.length){const candidates=[];walkObjects(json,o=>{const unit=unitToCharacter(o);if(unit)candidates.push(unit);});out=candidates;}const seen=new Set();return out.filter(x=>{const key=`${x.baseId||''}|${x.name||''}`;if(seen.has(key))return false;seen.add(key);return true;});}
async function fetchJSON(url){const r=await fetch(url,{headers:{'Accept':'application/json,text/plain,*/*'}});if(!r.ok)throw new Error(`HTTP ${r.status}`);return JSON.parse(await r.text());}

async function loadRemotePlayer(){
  const allyCode=cleanAllyCode($('allyCode').value);if(allyCode.length!==9){log('Ally Code invalide : 9 chiffres attendus.');return;}
  $('loadPlayer').disabled=true;$('loadPlayer').textContent='CHARGEMENT…';$('log').textContent='';const fmt=formatAlly(allyCode);log(`Recherche du joueur ${fmt}…`);
  try{
    const relay=workerUrl();
    log(`Relais Cloudflare actif : ${relay}`);
    try {
      const probe = await fetch(`${relay}/?ally=${allyCode}&path=api-profile`, {headers:{'Accept':'application/json'}});
      if (!probe.ok) throw new Error(`HTTP ${probe.status}`);
      log('Test du relais : OK.');
    } catch (probeErr) {
      throw new Error(`Relais Cloudflare inaccessible (${probeErr.message}). Vérifie que le Worker est toujours déployé.`);
    }else log('Aucun relais configuré : tentative directe depuis le navigateur.');
    const base=`https://swgoh.gg/p/${allyCode}`;let apiChars=[],apiMods=[];
    if(relay){log('Tentative API JSON SWGOH.GG via le Worker…');try{const api=await fetchJSON(`${relay}/?ally=${allyCode}&path=api-profile`);apiChars=extractApiCharacters(api);apiMods=extractApiMods(api);log(`API : ${apiChars.length} unités candidates, ${apiMods.length} mods candidats.`);}catch(e){log(`API profil indisponible : ${e.message}`);}if(!apiMods.length){try{const apiModsJson=await fetchJSON(`${relay}/?ally=${allyCode}&path=api-mods`);apiMods=extractApiMods(apiModsJson);log(`API mods : ${apiMods.length} mods candidats.`);}catch(e){log(`API mods indisponible : ${e.message}`);}}}
    const profileText=await fetchText(`${base}/`),profileDoc=parseHTML(profileText),title=profileDoc.querySelector('h1')?.textContent?.trim()||'Joueur',bodyText=profileDoc.body.textContent||'';accountGalacticPower=extractGalacticPowerFromProfile(bodyText);renderGalacticPower();const rosterMatch=bodyText.match(/Roster\s+([0-9,]+)\s+units/i);const modsMatch=bodyText.match(/([0-9,]+)\s+Mods/i);log(`Profil SWGOH.GG trouvé : ${title}.`);if(rosterMatch)log(`Roster annoncé : ${rosterMatch[1]} unités.`);if(modsMatch)log(`Mods annoncés : ${modsMatch[1]}.`);log('Lecture du roster…');
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
    currentData={allyCode,name:title,characters:chars,ships,mods,galacticPower:accountGalacticPower};updateRosterCounts(chars,ships);renderGalacticPower();buildFactionMap();fillCharacters(chars);updateAccountSummary(title,fmt);renderV18SpeedRecap('v18DashboardSpeed');renderModsAnalysis();renderDataTable();
    $('dataInfo').textContent=`Source: SWGOH.GG public pages${workerUrl()?' + Cloudflare Worker relay':''}\nJoueur: ${title}\nAlly Code: ${fmt}\nPersonnages: ${chars.length}\nVaisseaux: ${ships.length}\nUnités totales: ${chars.length+ships.length}\nMods: ${mods.length}\nProfils Kyber disponibles dans cette version: ${Object.keys(profiles).length}`;
    log(`TERMINÉ : ${chars.length} personnages, ${ships.length} vaisseaux, ${mods.length} mods exploitables.`);if(!mods.length)log('Aucun mod lisible.');showPage('dashboard');
  }catch(e){log(`Échec du chargement : ${e.message||e}`);log('Si le relais est configuré et renvoie une erreur HTTP, utilise l’import JSON.');}
  finally{$('loadPlayer').disabled=false;$('loadPlayer').textContent='CHARGER MON PROFIL';}
}
function updateAccountSummary(title,fmt){$('accountSummary').innerHTML=`<div><span>JOUEUR</span><strong>${esc(title)}</strong></div><div><span>ALLY CODE</span><strong>${esc(fmt)}</strong></div><div><span>PERSONNAGES</span><strong>${rosterCharacters.length}</strong></div><div><span>VAISSEAUX</span><strong>${rosterShips.length}</strong></div><div><span>MODS</span><strong>${mods.length}</strong></div>`;setText('topAccountName',title||'—');setText('topProfileState','CONNECTÉ');}

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
function prepareModFilters(){ modFiltersReady=true; }
function renderModSummary(rows){
  const box=$('modSummary'); if(!box)return;
  if(currentDataset!=='mods'){box.hidden=true;return;}
  const equipped=rows.filter(m=>String(m.character||'').trim()).length;
  const free=rows.length-equipped;
  const six=rows.filter(m=>Number(m.level)>=15).length;
  box.hidden=false;
  box.innerHTML=`<div><span>MODS AFFICHÉS</span><strong>${num(rows.length)}</strong></div><div><span>ÉQUIPÉS</span><strong>${num(equipped)}</strong></div><div><span>LIBRES</span><strong>${num(free)}</strong></div><div><span>NIVEAU 15</span><strong>${num(six)}</strong></div>`;
}
function getFilteredMods(){
  const q=String($('dataSearch')?.value||'').trim().toLowerCase();
  return mods.map(normalizeModForDisplay).filter(m=>!q||JSON.stringify(m).toLowerCase().includes(q));
}
