let pyodide = null;
let optimizerReady = false;
let currentData = null;
let mods = [];
let profiles = {};

const $ = (id) => document.getElementById(id);
function log(msg) { $('log').textContent += `\n${msg}`; $('log').scrollTop = $('log').scrollHeight; }
function setRuntime(text, ok=false) { $('runtime').textContent = text; $('runtime').classList.toggle('ok', ok); }

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
  if (Array.isArray(data?.data?.mods)) return data.data.mods.map(normalizeMod).filter(Boolean);
  return [];
}

function extractCharacters(data) {
  const names = new Set();
  const roster = data?.rosterUnit || data?.units || data?.data?.rosterUnit || [];
  if (Array.isArray(roster)) roster.forEach(u=>{
    const x=u?.data && typeof u.data==='object' ? u.data : u;
    const n=x?.definitionId || x?.baseId || x?.character;
    if(n) names.add(String(n).split(':')[0]);
  });
  mods.forEach(m=>{ if(m.character) names.add(String(m.character)); });
  return [...names].sort((a,b)=>a.localeCompare(b));
}

function fillCharacters(names) {
  const select=$('character'); select.innerHTML='';
  names.forEach(n=>{ const o=document.createElement('option'); o.value=n; o.textContent=n; select.appendChild(o); });
  if(!names.length) { const o=document.createElement('option'); o.textContent='Aucun personnage détecté'; select.appendChild(o); }
}

async function boot() {
  try {
    setRuntime('CHARGEMENT PYTHON…');
    pyodide = await loadPyodide();
    const optimizer = await fetch('python/optimizer.py').then(r=>r.text());
    const kyber = await fetch('python/kyber_profiles.json').then(r=>r.text());
    pyodide.FS.writeFile('/home/pyodide/optimizer.py', optimizer);
    pyodide.FS.writeFile('/home/pyodide/kyber_profiles.json', kyber);
    pyodide.runPython(`import sys; sys.path.append('/home/pyodide'); import optimizer, json`);
    profiles = JSON.parse(kyber);
    optimizerReady = true;
    $('pythonState').textContent='OK';
    setRuntime('PYTHON WEBASSEMBLY PRÊT', true);
    log('Moteur Python chargé dans le navigateur.');
  } catch(e) {
    setRuntime('ERREUR PYTHON'); $('pythonState').textContent='ERREUR'; log('Erreur: '+e);
  }
}

$('fileInput').addEventListener('change', async e => {
  const file=e.target.files[0]; if(!file) return;
  try {
    currentData=JSON.parse(await file.text());
    mods=extractMods(currentData);
    const chars=extractCharacters(currentData);
    $('modsCount').textContent=mods.length;
    $('charsCount').textContent=chars.length;
    fillCharacters(chars);
    $('dataInfo').textContent=`Fichier: ${file.name}\nTaille: ${file.size.toLocaleString('fr-FR')} octets\nMods détectés: ${mods.length}\nPersonnages détectés: ${chars.length}`;
    $('log').textContent=''; log(`Import: ${file.name}`); log(`${mods.length} mods détectés.`);
    if(!mods.length) log('Aucun tableau mods standard détecté. Le convertisseur Comlink devra être activé pour ce format.');
    document.querySelector('[data-page="optimizer"]').click();
  } catch(e) { log('JSON invalide: '+e.message); }
});

$('runOptimizer').addEventListener('click', async ()=>{
  $('optimizerError').textContent=''; $('results').innerHTML='Calcul…';
  if(!optimizerReady || !mods.length) { $('optimizerError').textContent='Python ou mods non disponibles.'; return; }
  const character=$('character').value;
  const profile=profiles[character] || profiles[character.toLowerCase()] || null;
  if(!profile) { $('optimizerError').textContent=`Profil Kyber non trouvé pour « ${character} ».`; $('results').innerHTML=''; return; }
  try {
    const modsJson=JSON.stringify(mods), profileJson=JSON.stringify(profile);
    const count=Math.min(50,Math.max(1,Number($('buildCount').value)||10));
    const limit=Math.min(150,Math.max(5,Number($('limitPerSlot').value)||80));
    pyodide.globals.set('mods_json', modsJson); pyodide.globals.set('profile_json', profileJson); pyodide.globals.set('n_builds', count); pyodide.globals.set('limit_slot', limit);
    const raw=pyodide.runPython(`import json\nmods=json.loads(mods_json)\nprofile=json.loads(profile_json)\nr=optimizer.find_top_builds(mods, number_of_builds=n_builds, limit_per_slot=limit_slot, kyber=profile, character=${JSON.stringify(character)})\njson.dumps(r)`).toJs();
    const data=JSON.parse(raw);
    renderResults(data);
  } catch(e) { $('optimizerError').textContent=String(e); $('results').innerHTML=''; }
});

function renderResults(data) {
  if(!data.length){ $('results').textContent='Aucun build.'; return; }
  $('results').innerHTML=data.map((r,i)=>`<article class="result"><div class="rank">#${i+1}</div><div><strong>Score ${Number(r.score).toFixed(2)}</strong><div class="stats">${Object.entries(r.stats||{}).map(([k,v])=>`${k}: ${typeof v==='number'?Number(v).toFixed(1):v}`).join(' · ')}</div><div class="mods">${(r.build||[]).map(m=>`${m.slot||'?'} / ${m.set_name||m.set||'?'} / ${m.primary_stat||'?'} ${m.primary_value??''}`).join('<br>')}</div></div></article>`).join('');
}

$('clearData').addEventListener('click',()=>{ currentData=null; mods=[]; $('modsCount').textContent='0'; $('charsCount').textContent='0'; fillCharacters([]); $('results').textContent='Importez d’abord vos données.'; $('dataInfo').textContent='Aucune donnée.'; $('log').textContent='Données effacées.'; });

document.querySelectorAll('.nav').forEach(btn=>btn.addEventListener('click',()=>{ document.querySelectorAll('.nav').forEach(x=>x.classList.remove('active')); document.querySelectorAll('.page').forEach(x=>x.classList.remove('active')); btn.classList.add('active'); $(btn.dataset.page).classList.add('active'); }));

boot();
