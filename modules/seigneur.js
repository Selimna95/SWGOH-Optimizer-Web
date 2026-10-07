async function loadOptimizerReferenceData(){
  // V44: les profils Optimizer ne doivent plus être une dépendance bloquante.
  // Le Worker sait maintenant charger optimizer_profiles.json lui-même.
  // On tente les sources locales pour l'UI, mais l'Optimizer peut démarrer même
  // si le script embarqué n'a pas été publié par GitHub Pages.
  const embedded=window.__SWGOH_OPTIMIZER_PROFILES__;
  if(embedded && typeof embedded==='object' && Object.keys(embedded).length){
    optimizerProfiles=embedded;
    log(`Profils Optimizer UI disponibles : ${Object.keys(optimizerProfiles).length}.`);
  }else{
    const candidates=[
      new URL('./python/optimizer_profiles.json',document.baseURI).href,
      new URL('/SWGOH-Optimizer-Web/python/optimizer_profiles.json',location.origin).href,
    ];
    let loaded=null;
    for(const url of candidates){
      try{
        const r=await fetch(url+'?v=45',{cache:'no-store'});
        if(!r.ok)continue;
        const json=await r.json();
        if(json&&typeof json==='object'&&Object.keys(json).length){loaded=json;break;}
      }catch(e){}
    }
    if(loaded){
      optimizerProfiles=loaded;
      log(`Profils Optimizer UI chargés depuis le JSON : ${Object.keys(optimizerProfiles).length}.`);
    }else{
      optimizerProfiles={};
      log('Profils Optimizer UI non chargés : le Worker les récupérera directement depuis python/optimizer_profiles.json.');
    }
  }
  // Kyber est une référence facultative : SWGOH.GG sera interrogé au besoin,
  // puis le profil local du Worker sert de secours.
  const kyberCandidates=[
    new URL('./python/kyber_profiles.json',document.baseURI).href,
    new URL('/SWGOH-Optimizer-Web/python/kyber_profiles.json',location.origin).href,
  ];
  profiles={};
  for(const url of kyberCandidates){
    try{
      const r=await fetch(url+'?v=45',{cache:'no-store'});
      if(r.ok){const json=await r.json();if(json&&typeof json==='object'){profiles=json;break;}}
    }catch(e){}
  }
  log(`Références Kyber locales : ${Object.keys(profiles||{}).length}.`);
  return true;
}

async function boot(){
  // V45: l'activation de l'Optimizer ne dépend plus des téléchargements
  // de références UI. V44 pouvait laisser optimizerReady=false pendant ces
  // requêtes et afficher "Le moteur Optimizer n'est pas prêt".
  optimizerReady=true;
  $('pythonState').textContent='WORKER';
  setRuntime('MOTEUR OPTIMIZER PRÊT',true);
  log('Moteur Optimizer autorisé immédiatement. Initialisation du Worker en arrière-plan…');

  try{
    getOptimizerWorker();
    log('Worker Optimizer initialisé.');
  }catch(e){
    log('Initialisation du Worker différée : '+(e?.message||e));
  }

  // Les profils UI/Kyber sont facultatifs pour l'activation du moteur.
  try{
    await loadOptimizerReferenceData();
    log(`Références UI chargées. Profils Optimizer locaux : ${Object.keys(optimizerProfiles||{}).length}.`);
  }catch(e){
    log('Références UI non disponibles : le Worker reste autonome.');
  }

  // Pyodide principal est facultatif et ne doit jamais bloquer l'Optimizer.
  try{
    if(typeof loadPyodide==='function'){
      pyodide=await loadPyodide();
      const optimizerResponse=await fetch(new URL('./python/optimizer.py',document.baseURI).href+'?v=45',{cache:'no-store'});
      if(!optimizerResponse.ok) throw new Error(`optimizer.py HTTP ${optimizerResponse.status}`);
      const optimizer=await optimizerResponse.text();
      pyodide.FS.writeFile('/home/pyodide/optimizer.py',optimizer);
      pyodide.runPython(`import sys; sys.path.append('/home/pyodide'); import optimizer`);
      log('Moteur Python principal disponible en secours.');
    }
  }catch(e){
    log('Moteur Python principal indisponible : le Worker reste utilisé pour l’optimisation.');
  }
}

$('fileInput').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{currentData=JSON.parse(await file.text());mods=extractMods(currentData);const importedUnits=extractCharacters(currentData);const split=splitRosterUnits(importedUnits);rosterCharacters=split.characters;rosterShips=split.ships;buildFactionMap();updateRosterCounts(rosterCharacters,rosterShips);fillCharacters(rosterCharacters);updateAccountSummary(file.name,'IMPORT JSON');renderV18SpeedRecap('v18DashboardSpeed');renderModsAnalysis();renderDataTable();renderHolocronVerdict(holocronTopChangeCandidates().slice(0,10));renderSithariNexus();$('dataInfo').textContent=`Fichier: ${file.name}\nMods détectés: ${mods.length}\nPersonnages détectés: ${rosterCharacters.length}\nVaisseaux détectés: ${rosterShips.length}`;$('log').textContent='';log(`Import: ${file.name}`);log(`${mods.length} mods détectés.`);log(`${rosterCharacters.length} personnages + ${rosterShips.length} vaisseaux détectés.`);document.querySelector('[data-page="data"]').click();}catch(e){log('JSON invalide: '+e.message);}});


const KNOWN_GALACTIC_LEGEND_IDS=new Set(['GLREY','SUPREMELEADERKYLOREN','GRANDMASTERLUKE','JEDIMASTERKENOBI','LORDVADER','JABBATHEHUTT','GLLEIA','SITHPALPATINE','GLAHSOKATANO']);
function isGalacticLegendCharacter(c){
  const raw=c?.raw||c?.data||c||{};
  const base=compactKey(c?.baseId||c?.base_id||c?.id||'');
  if(KNOWN_GALACTIC_LEGEND_IDS.has(base))return true;
  const explicit=[raw?.isGalacticLegend,raw?.is_galactic_legend,c?.isGalacticLegend,c?.is_galactic_legend];
  if(explicit.some(v=>v===true||v===1||String(v).toLowerCase()==='true'))return true;
  const values=[];
  const collect=(v)=>{if(v==null)return;if(Array.isArray(v))return v.forEach(collect);if(typeof v==='object'){for(const k of ['name','displayName','nameKey','id','categoryId','category','faction','tags','categories','role'])collect(v[k]);return;}values.push(String(v));};
  collect(raw);
  const text=compactKey(values.join(' '));
  return text.includes('GALACTICLEGEND');
}
function forgeSourceStatusAllowed(status){
  if($('optimizerAllRoster')?.checked===true)return true;
  if(status==='TRÈS FAIBLES')return $('optimizerVeryLow')?.checked!==false;
  if(status==='FAIBLES')return $('optimizerLow')?.checked!==false;
  if(status==='MOYENS')return $('optimizerMedium')?.checked===true;
  return false;
}
function forgeScopedMods(){
  const all=$('optimizerAllRoster')?.checked===true;
  const allowed=[];
  for(const c of rosterCharacters){
    if(isGalacticLegendCharacter(c))continue;
    const st=v176ModStatus(getCharacterMods(c)).status;
    if(!forgeSourceStatusAllowed(st))continue;
    for(const m of getCharacterMods(c)) allowed.push(m);
  }
  return allowed;
}

function forgeKyberSetRules(profile){
  const rec=optimizerRecommendationSummary(profile);
  const rules=[];
  for(const s of rec.sets){
    const label=String(s.label||'').replace(/^Triple\s+/i,'').replace(/^Double\s+/i,'');
    const parts=label.split(/\s*\+\s*/).map(x=>x.trim()).filter(Boolean);
    const counts={};
    if(parts.length===1) counts[parts[0]]=6;
    else if(parts.length>=2){counts[parts[0]]=4;counts[parts[1]]=2;}
    if(Object.keys(counts).length) rules.push({label,counts,weight:Number(s.weight||0)});
  }
  return rules;
}
function forgeModSetConformity(mod,profile){
  const actual=String(mod?.set_name||mod?.set||'').trim().toLowerCase();
  const rules=forgeKyberSetRules(profile);
  if(!actual||!rules.length)return {ok:null,reason:'Référence de set indisponible'};
  const best=rules.some(rule=>Object.keys(rule.counts).some(set=>set.toLowerCase()===actual));
  return {ok:best,reason:best?'Set présent dans la référence Kyber':'Set hors référence Kyber'};
}
function forgeModPrimaryConformity(mod,profile){
  const slot=optimizerSlotKey(mod?.slot);
  const expected=optimizerPrimaryReference(profile,slot);
  const entries=Object.entries(expected).sort((a,b)=>Number(b[1]||0)-Number(a[1]||0));
  if(!entries.length)return {ok:null,expected:'Référence indisponible'};
  const actual=compactKey(mod?.primary_stat||'');
  const match=entries.find(([name])=>compactKey(name)===actual);
  return {ok:!!match,expected:entries[0]?.[0]||'—',expectedPct:match?Number(match[1]||0):Number(entries[0]?.[1]||0)};
}
function forgeCharacterAudit(character,profile){
  const equipped=getCharacterMods(character);
  const rules=forgeKyberSetRules(profile);
  const primaryBySlot={};
  for(const slot of ['Square','Arrow','Diamond','Triangle','Circle','Cross']){
    const entries=Object.entries(optimizerPrimaryReference(profile,slot)).sort((a,b)=>Number(b[1]||0)-Number(a[1]||0));
    primaryBySlot[slot]=entries;
  }
  const issues=equipped.map((m,index)=>{
    const set=forgeModSetConformity(m,profile), primary=forgeModPrimaryConformity(m,profile);
    return {...m,_equippedIndex:index,_set:set,_primary:primary,_mismatch:set.ok===false||primary.ok===false};
  });
  return {equipped,issues,primaryBySlot,setRules:rules};
}
function forgeAllSourceMods(){
  const out=[];
  for(const raw of mods){
    const m=normalizeModForDisplay(raw);
    const ownerKey=modOwnerKey(m);
    const owner=rosterCharacters.find(c=>characterKey(c)===ownerKey);
    if(owner&&isGalacticLegendCharacter(owner))continue;
    const st=owner?v176ModStatus(getCharacterMods(owner)).status:'INVENTAIRE';
    out.push({...m,_sourceStatus:st,_sourceOwner:owner?.name||m.character||'Libre'});
  }
  return out;
}
function forgeSourceAllowedForSearch(m){
  if($('optimizerAllRoster')?.checked===true)return true;
  const st=String(m?._sourceStatus||'');
  if(st==='INCOMPLETS')return $('optimizerIncomplete')?.checked!==false;
  if(st==='TRÈS FAIBLES')return $('optimizerVeryLow')?.checked!==false;
  if(st==='FAIBLES')return $('optimizerLow')?.checked!==false;
  if(st==='MOYENS')return $('optimizerMedium')?.checked===true;
  return false;
}
function forgeSearchSourceSummary(){
  if($('optimizerAllRoster')?.checked===true)return 'TOUT LE ROSTER · GL EXCLUES';
  const a=[];
  if($('optimizerIncomplete')?.checked!==false)a.push('INCOMPLETS');
  if($('optimizerVeryLow')?.checked!==false)a.push('TRÈS FAIBLES');
  if($('optimizerLow')?.checked!==false)a.push('FAIBLES');
  if($('optimizerMedium')?.checked===true)a.push('MOYENS');
  return a.join(' + ')||'AUCUNE SOURCE';
}
function forgeSecondaryStats(m){
  const out=[];
  for(let i=1;i<=4;i++){
    const stat=String(m?.[`secondary_${i}_stat`]||'').trim();
    if(!stat||compactKey(stat)==='SPEED')continue;
    out.push({stat,value:Number(m?.[`secondary_${i}_value`]||0)});
  }
  return out;
}
function forgeHasSecondary(m,wanted){
  const target=compactKey(wanted); if(!target)return false;
  return forgeSecondaryStats(m).some(x=>compactKey(x.stat)===target || compactKey(x.stat).includes(target) || target.includes(compactKey(x.stat)));
}
function forgeSlotCompatible(m,slot){return optimizerSlotKey(m?.slot)===optimizerSlotKey(slot);}
function forgeSetCompatible(m,profile){
  const rules=forgeKyberSetRules(profile); const actual=String(m?.set_name||'').toLowerCase();
  if(!rules.length)return false;
  return rules.some(r=>Object.keys(r.counts).some(s=>String(s).toLowerCase()===actual));
}
function forgePrimaryCompatible(m,profile){return forgeModPrimaryConformity(m,profile).ok===true;}
function forgeCandidateScore(m,profile,secA,secB){
  const a=forgeHasSecondary(m,secA), b=forgeHasSecondary(m,secB);
  const speed=modTotalSpeed(m);
  const set=forgeSetCompatible(m,profile), primary=forgePrimaryCompatible(m,profile);
  let contribution=0;
  for(const x of forgeSecondaryStats(m)) if(compactKey(x.stat)===compactKey(secA)||compactKey(x.stat)===compactKey(secB)) contribution+=Number(x.value||0);
  return {both:a&&b,one:(a||b),a,b,speed,set,primary,contribution};
}
function forgeSearchCandidates(character,profile,slot,secA,secB){
  const current=getCharacterMods(character).find(m=>forgeSlotCompatible(m,slot));
  const source=forgeAllSourceMods().filter(m=>forgeSourceAllowedForSearch(m)&&forgeSlotCompatible(m,slot));
  const candidates=source.filter(m=>String(m.game_id||m.id||'')!==String(current?.game_id||current?.id||''));
  const ranked=candidates.map(m=>({...m,_rank:forgeCandidateScore(m,profile,secA,secB)})).sort((x,y)=>{
    if(Number(y._rank.both)-Number(x._rank.both))return Number(y._rank.both)-Number(x._rank.both);
    if(Number(y._rank.one)-Number(x._rank.one))return Number(y._rank.one)-Number(x._rank.one);
    if(Number(y._rank.primary)-Number(x._rank.primary))return Number(y._rank.primary)-Number(x._rank.primary);
    if(Number(y._rank.set)-Number(x._rank.set))return Number(y._rank.set)-Number(x._rank.set);
    if(Number(y._rank.contribution)-Number(x._rank.contribution))return Number(y._rank.contribution)-Number(x._rank.contribution);
    return Number(y._rank.speed)-Number(x._rank.speed);
  });
  const both=ranked.filter(x=>x._rank.both).slice(0,5);
  const result=both.length?both:ranked.filter(x=>x._rank.one).slice(0,5);
  return {current,sourceCount:source.length,candidates:result,usedBoth:both.length>0};
}
function forgeSecondaryOptions(profile){
  const rec=optimizerRecommendationSummary(profile); const names=[];
  for(const x of rec.secondaries||[]){const n=String(x.name||'').trim();if(n&&compactKey(n)!=='SPEED'&&!names.includes(n))names.push(n);}
  ['Offense %','Health %','Protection %','Critical Chance %','Defense %','Potency','Tenacity','Critical Damage'].forEach(n=>{if(!names.includes(n))names.push(n);});
  return names;
}
function renderForgeCharacterPanel(character,profile){
  const audit=forgeCharacterAudit(character,profile);
  const mismatches=audit.issues.filter(x=>x._mismatch);
  const secondaries=forgeSecondaryOptions(profile);
  const first=secondaries[0]||'Offense %', second=secondaries.find(x=>x!==first)||'Health %';
  const characterPortrait=essentialPortraitHtml(character);
  const currentSlots=audit.issues.map(m=>`<button type="button" class="forge-current-mod ${m._mismatch?'is-mismatch':'is-match'}" data-forge-slot="${esc(m.slot)}"><span>${modIconHtml(m,'48')}</span><b>${esc(m.slot||'—')}</b><small>${m._mismatch?'ÉCART':'CONFORME'}</small><em>${esc(m.set_name||'—')}</em></button>`).join('');
  const mismatchHtml=mismatches.length?mismatches.map(m=>`<article class="forge-audit-card is-mismatch"><div class="forge-audit-mod">${modIconHtml(m,'54')}</div><div><b>${esc(m.slot||'—')} · ${esc(m.set_name||'—')}</b><span>${m._set.ok===false?'✕ SET HORS RÉFÉRENCE':'✓ SET'} · ${m._primary.ok===false?`✕ PRIMAIRE · attendu ${esc(m._primary.expected)}`:'✓ PRIMAIRE'}</span></div><button type="button" class="forge-analyse-mod" data-forge-slot="${esc(m.slot)}">RECHERCHER</button></article>`).join(''):`<div class="forge-audit-empty">Les 6 mods sont conformes aux critères identifiés. Aucun remplacement prioritaire.</div>`;
  $('forgeCharacterAudit').innerHTML=`<div class="forge-audit-character"><div class="forge-audit-character-portrait">${characterPortrait}</div><div><span>PERSONNAGE ANALYSÉ</span><strong>${esc(character?.name||'Personnage')}</strong><small>Référence Kyber appliquée aux 6 slots.</small></div></div><div class="forge-audit-summary"><div><span>MODS DU PERSONNAGE</span><b>${audit.equipped.length}/6</b></div><div><span>ÉCARTS DÉTECTÉS</span><b>${mismatches.length}</b></div><div><span>SETS KYBER</span><b>${audit.setRules.length?'IDENTIFIÉS':'À RÉCUPÉRER'}</b></div></div><div class="forge-current-mods">${currentSlots}</div><div class="forge-mismatch-list">${mismatchHtml}</div>`;
  const selects=(id,val)=>`<select id="${id}">${secondaries.map(n=>`<option value="${esc(n)}" ${n===val?'selected':''}>${esc(n)}</option>`).join('')}</select>`;
  $('forgeSearchPanel').innerHTML=`<div class="forge-search-grid"><label>MOD À REMPLACER<select id="forgeTargetSlot">${audit.issues.map(m=>`<option value="${esc(m.slot)}" ${m._mismatch?'selected':''}>${esc(m.slot)} · ${m._mismatch?'ÉCART':'conforme'}</option>`).join('')}</select></label><label>SECONDAIRE 1 ${selects('forgeSecondaryA',first)}</label><label>SECONDAIRE 2 ${selects('forgeSecondaryB',second)}</label><button type="button" id="forgeSearchBtn" class="primary">RECHERCHER 5 OPTIONS</button></div><div class="forge-search-note">La vitesse n'est pas une secondaire recherchée. Elle sert uniquement à départager les candidats.</div><div id="forgeSearchResults"></div>`;
  $('forgeSearchBtn')?.addEventListener('click',()=>renderForgeSearchResults(character,profile));
  document.querySelectorAll('[data-forge-slot]').forEach(btn=>btn.addEventListener('click',()=>{const s=btn.dataset.forgeSlot;const el=$('forgeTargetSlot');if(el)el.value=s;}));
}
function forgeModDeltaMarkup(current,candidate){
  if(!current||!candidate)return '<div class="forge-delta-empty">Comparaison indisponible.</div>';
  const stats=new Map();
  const add=(name,value,kind)=>{
    const key=compactKey(name); if(!key||key==='SPEED')return;
    const prev=stats.get(key)||{name:String(name),from:0,to:0};
    prev[kind]=Number(value||0); stats.set(key,prev);
  };
  for(let i=1;i<=4;i++) add(current[`secondary_${i}_stat`],current[`secondary_${i}_value`],'from');
  for(let i=1;i<=4;i++) add(candidate[`secondary_${i}_stat`],candidate[`secondary_${i}_value`],'to');
  const rows=[...stats.values()].map(x=>({...x,delta:x.to-x.from})).filter(x=>Math.abs(x.delta)>0.00001).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
  const speedDelta=modTotalSpeed(candidate)-modTotalSpeed(current);
  const primaryChanged=compactKey(current.primary_stat)!==compactKey(candidate.primary_stat);
  const setChanged=compactKey(current.set_name)!==compactKey(candidate.set_name);
  const body=rows.slice(0,6).map(x=>`<span class="${x.delta>0?'gain':'loss'}"><b>${x.delta>0?'+':''}${num(x.delta,1)}</b><em>${esc(x.name)}</em></span>`).join('');
  const tags=[];
  if(speedDelta)tags.push(`<span class="${speedDelta>0?'gain':'loss'}"><b>${speedDelta>0?'+':''}${num(speedDelta,0)}</b><em>VITESSE</em></span>`);
  if(primaryChanged)tags.push(`<span class="neutral"><b>↔</b><em>PRIMAIRE ${esc(current.primary_stat||'?')} → ${esc(candidate.primary_stat||'?')}</em></span>`);
  if(setChanged)tags.push(`<span class="neutral"><b>↔</b><em>SET ${esc(current.set_name||'?')} → ${esc(candidate.set_name||'?')}</em></span>`);
  return `<div class="forge-delta"><div class="forge-delta-head"><span>GAINS / PERTES</span><small>mod actuel → candidat</small></div><div class="forge-delta-list">${tags.concat(body).join('')||'<span class="neutral"><b>0</b><em>Aucun écart chiffré</em></span>'}</div></div>`;
}
function forgeSourcePortrait(ownerName){
  const owner=rosterCharacters.find(c=>compactKey(c?.name||c?.character||c?.baseId)===compactKey(ownerName||''));
  return owner?essentialPortraitHtml(owner):essentialPortraitHtml({name:ownerName||'?' });
}
function renderForgeSearchResults(character,profile){
  const slot=$('forgeTargetSlot')?.value||''; const a=$('forgeSecondaryA')?.value||''; const b=$('forgeSecondaryB')?.value||'';
  const box=$('forgeSearchResults'); if(!box)return;
  if(!a||!b||compactKey(a)===compactKey(b)){box.innerHTML='<div class="forge-audit-empty">Choisis deux secondaires différentes. La vitesse est exclue de cette recherche.</div>';return;}
  const result=forgeSearchCandidates(character,profile,slot,a,b);
  const rows=result.candidates;
  if(!rows.length){box.innerHTML=`<div class="forge-no-result"><b>AUCUN CANDIDAT</b><span>Aucun mod du périmètre <strong>${esc(forgeSearchSourceSummary())}</strong> ne possède les secondaires recherchées. Active MOYENS ou TOUT LE ROSTER pour élargir.</span></div>`;return;}
  box.innerHTML=`<div class="forge-search-header"><div><span>ARSENAL DISPONIBLE</span><b>${result.sourceCount} mods · ${rows.length} choix affichés</b></div><strong>${result.usedBoth?'✓ DEUX SECONDAIRES':'→ UNE SECONDAIRE · MEILLEUR APPORT'}</strong></div><div class="forge-candidate-grid">${rows.map((m,i)=>{const r=m._rank;const secs=forgeSecondaryStats(m);const hit=secs.filter(x=>compactKey(x.stat)===compactKey(a)||compactKey(x.stat)===compactKey(b));return `<article class="forge-candidate ${r.both?'both':''}"><div class="forge-candidate-rank"><span>${String(i+1).padStart(2,'0')}</span><b>${r.both?'✓✓':'✓'}</b></div><div class="forge-candidate-icon">${modIconHtml(m,'58')}</div><div class="forge-candidate-main"><div class="forge-candidate-owner">${forgeSourcePortrait(m._sourceOwner)}<span>${esc(m._sourceOwner||'Libre')}</span></div><strong>${esc(m.slot)} · ${esc(m.set_name||'—')}</strong><small>${esc(m._sourceStatus||'—')}</small><div class="forge-candidate-primary"><span>PRIMAIRE</span><b>${esc(m.primary_stat||'—')}</b>${r.primary?'✓ KYBER':''}</div><div class="forge-candidate-seconds">${secs.map(x=>`<span class="${hit.some(h=>compactKey(h.stat)===compactKey(x.stat))?'hit':''}">${esc(x.stat)} <b>${num(x.value,1)}</b></span>`).join('')}</div></div>${forgeModDeltaMarkup(result.current,m)}<div class="forge-candidate-speed"><span>VITESSE</span><b>${num(modTotalSpeed(m),0)}</b><small>${r.set?'SET KYBER':'SET différent'}</small></div></article>`;}).join('')}</div>`;
}

$('runOptimizer').addEventListener('click',async()=>{
  $('optimizerError').textContent='';
  const character=selectedCharacter();
  if(!character){$('optimizerError').textContent='Sélectionnez un personnage.';return;}
  $('runOptimizer').disabled=true;$('runOptimizer').textContent='ANALYSE EN COURS…';
  $('results').innerHTML='<div class="calculating">Analyse du personnage et de sa référence Kyber…</div>';
  try{
    const profile=await ensureSelectedKyberProfile();
    if(!profile || !kyberProfileValid(profile))throw new Error(`Référence Kyber indisponible pour « ${character.name||character.baseId} ».`);
    renderForgeCharacterPanel(character,profile);
    $('results').innerHTML='<div class="forge-results-ready">Référence Kyber identifiée. Sélectionne un mod en écart, deux secondaires, puis lance la recherche ciblée.</div>';
  }catch(e){$('optimizerError').textContent=String(e?.message||e);$('results').innerHTML='';}
  finally{$('runOptimizer').disabled=false;$('runOptimizer').textContent='ANALYSER LE PERSONNAGE';}
});
function optimizerStatLabel(key){
  const labels={
    Speed:'VITESSE',Health:'SANTÉ',Protection:'PROTECTION',
    'Physical Damage':'DÉGÂTS PHYS.', 'Special Damage':'DÉGÂTS SPÉC.',
    Potency:'PUISSANCE',Tenacity:'TÉNACITÉ',Armor:'ARMURE',Resistance:'RÉSISTANCE',
    'Critical Damage':'DÉGÂTS CRIT.', 'Critical Chance':'CHANCE CRIT.',
    'Special Critical Chance':'CRIT. SPÉC.', 'Physical Critical Chance':'CRIT. PHYS.',
    'Armor Penetration':'PÉN. ARMURE','Resistance Penetration':'PÉN. RÉSIST.',
    Accuracy:'PRÉCISION','Critical Avoidance':'ÉVITEMENT CRIT.',
    'Dodge Chance':'ESQUIVE','Deflection Chance':'DÉVIATION','Mastery':'MAÎTRISE'
  };
  return labels[key]||String(key||'').replace(/_/g,' ').toUpperCase();
}
function optimizerStatValue(key,value){
  if(typeof value!=='number') return esc(value);
  if(['Potency','Tenacity','Critical Chance','Critical Avoidance','Critical Damage','Mastery'].includes(key)){
    return num(value,3);
  }
  return num(value,1);
}
function optimizerModSecondaries(m){
  const out=[];
  for(let j=1;j<=4;j++){
    const stat=m?.[`secondary_${j}_stat`];
    if(!stat) continue;
    const value=m?.[`secondary_${j}_value`];
    out.push(displayModStat(stat,value));
  }
  return out;
}
function optimizerBuildReferenceAudit(build, profile){
  const rec=optimizerRecommendationSummary(profile);
  const topSet=rec.sets[0]?.label||'';
  const topSetNames=String(topSet).replace(/^triple\s+/i,'').split(/\s*\+\s*/).map(x=>x.trim().toLowerCase()).filter(Boolean);
  const buildSets={};
  build.forEach(m=>{const set=String(m.set_name||m.set||'').trim().toLowerCase();if(set)buildSets[set]=(buildSets[set]||0)+1;});
  let setHits=0;
  if(topSetNames.length===1) setHits=Math.min(buildSets[topSetNames[0]]||0,6);
  else if(topSetNames.length===2) setHits=Math.min(buildSets[topSetNames[0]]||0,4)+Math.min(buildSets[topSetNames[1]]||0,2);
  const primary=optimizerPrimaryConformity(build,profile);
  const focus=rec.secondaries.map(x=>String(x.name||'').toLowerCase().replace(/[^a-z0-9%]/g,''));
  let secondaryHits=0;
  build.forEach(m=>{
    for(let i=1;i<=4;i++){
      const stat=String(m[`secondary_${i}_stat`]||'').toLowerCase().replace(/[^a-z0-9%]/g,'');
      if(stat && focus.some(f=>stat===f || stat.includes(f) || f.includes(stat))){secondaryHits++;break;}
    }
  });
  const secondaryTotal=build.length;
  const setPct=topSetNames.length?Math.round((setHits/6)*100):0;
  const primaryPct=primary.known?Math.round((primary.hits/primary.known)*100):0;
  const secondaryPct=secondaryTotal?Math.round((secondaryHits/secondaryTotal)*100):0;
  const compliance=Math.round(setPct*.4+primaryPct*.4+secondaryPct*.2);
  return {topSet,setHits,setPct,primaryHits:primary.hits,primaryKnown:primary.known,primaryPct,primaryDetails:primary.details,secondaryHits,secondaryTotal,secondaryPct,focusCount:focus.length,compliance};
}
function optimizerVerdictForBuild(audit, scope, index){
  const gaps=[];
  if(audit.setPct<100)gaps.push(`Set dominant : ${audit.setHits}/6 emplacements conformes`);
  if(audit.primaryKnown && audit.primaryPct<100)gaps.push(`Primaires : ${audit.primaryHits}/${audit.primaryKnown} conformes à Kyber`);
  if(audit.secondaryTotal && audit.secondaryPct<70)gaps.push(`Secondaires : ${audit.secondaryHits}/${audit.secondaryTotal} mods portent un focus Kyber`);
  const canBroaden=!/MOYENS|TOUT LE ROSTER/.test(scope);
  if(canBroaden && audit.compliance<75) return {kind:'action',title:'Élargir le périmètre',text:'Le meilleur candidat reste éloigné de la doctrine Kyber dans le périmètre actuel. Active MOYENS pour donner à la Forge davantage de choix.'};
  if(audit.compliance>=90) return {kind:'strong',title:'Configuration proche de la doctrine',text:'Le candidat respecte fortement la référence Kyber tout en restant dans l’arsenal disponible.'};
  if(gaps.length) return {kind:'warn',title:'Compromis identifié',text:`La Forge retient ce candidat avec ${audit.compliance}% d’adéquation. ${gaps.slice(0,2).join(' · ')}.`};
  sithariBindActionControls(box);
  return {kind:'neutral',title:`Candidat ${index+1} analysé`,text:'La configuration est évaluée par rapport aux sets, primaires et secondaires de référence Kyber.'};
}

function renderResults(data){
  if(!data.length){$('results').textContent='Aucun build.';return;}
  const character=selectedCharacter();
  const profile=profileForCharacter(character);
  const scope=optimizerSourceScopeSummary()[0];
  const rec=optimizerRecommendationSummary(profile);
  const refSets=rec.sets.slice(0,3).map(x=>`${x.label}${x.weight!=null?' · '+(x.weight*100).toFixed(1)+' %':''}`).join(' · ')||'Référence Kyber non détaillée';
  const refSecondaries=rec.secondaries.slice(0,4).map(x=>x.name).join(' · ')||'Secondaires Kyber non détaillées';
  $('results').innerHTML=`<div class="forge-results-intro forge-results-command">
    <div class="forge-results-heading"><span class="forge-kicker">RÉSULTATS // SEIGNEUR SITH</span><strong>Configurations optimisées</strong><small>${esc(character?.name||'Personnage')} · recherche guidée par la référence Kyber et limitée à <b>${esc(scope)}</b>.</small></div>
    <div class="forge-result-count"><b>${data.length}</b><span>BUILDS</span></div>
  </div>
  <div class="forge-result-reference-strip">
    <div><span>RÉFÉRENCE KYBER</span><b>${esc(refSets)}</b></div>
    <div><span>SECONDAIRES PRIORITAIRES</span><b>${esc(refSecondaries)}</b></div>
    <div><span>SOURCE MODS</span><b>${esc(scope)} · GL EXCLUES</b></div>
  </div>`+data.map((r,i)=>{
    const build=r.build||[];
    const setCounts={};
    build.forEach(m=>{const set=String(m.set_name||m.set||'').trim();if(set)setCounts[set]=(setCounts[set]||0)+1;});
    const setSummary=Object.entries(setCounts).map(([set,n])=>`${set} ×${n}`).join(' · ')||'Sets non renseignés';
    const audit=optimizerBuildReferenceAudit(build,profile);
    const statsEntries=Object.entries(r.stats||{});
    const featured=['Speed','Health','Protection','Physical Damage','Special Damage','Potency'].filter(k=>Object.prototype.hasOwnProperty.call(r.stats||{},k));
    const featuredStats=featured.map(k=>`<div class="forge-stat featured"><span>${optimizerStatLabel(k)}</span><b>${optimizerStatValue(k,r.stats[k])}</b></div>`).join('');
    const otherStats=statsEntries.filter(([k])=>!featured.includes(k)).map(([k,v])=>`<span class="forge-stat-pill"><b>${optimizerStatLabel(k)}</b><em>${optimizerStatValue(k,v)}</em></span>`).join('');
    const score=typeof r.score==='number'?r.score.toFixed(0):'—';
    const utility=typeof r.utility==='number'?r.utility.toFixed(3):'—';
    const pareto=r.pareto_rank==='PARETO';
    const compliance=audit.compliance;
    const complianceLabel=compliance>=90?'FORTE':compliance>=75?'SOLIDE':compliance>=55?'PARTIELLE':'À AFFINER';
    const verdict=optimizerVerdictForBuild(audit,scope,i);
    return `<article class="result forge-result">
      <header class="forge-result-head">
        <div class="forge-rank"><span>CONFIGURATION</span><b>${i+1}</b></div>
        <div class="forge-result-title"><strong>${i===0?'Configuration principale':'Configuration '+String(i+1).padStart(2,'0')}</strong><small>${esc(setSummary)}</small></div>
        <div class="forge-score"><span>ADÉQUATION À LA RÉFÉRENCE</span><b>${compliance}%</b><small>${esc(complianceLabel)} · Kyber ${esc(score)}</small></div>
      </header>
      <div class="forge-build-meta forge-build-doctrine">
        <div><span>DOCTRINE</span><strong>${audit.topSet?`✓ Set dominant : ${esc(audit.topSet)}`:'Référence de set non détaillée'}</strong></div>
        <div><span>PRIMAIRES</span><strong>${audit.primaryKnown?`${audit.primaryHits}/${audit.primaryKnown} conformes`:'Référence indisponible'}</strong></div>
        <div><span>SECONDAIRES</span><strong>${audit.secondaryHits} slot${audit.secondaryHits>1?'s':''} avec focus Kyber</strong></div>
      </div>
      <section class="forge-reasoning-block">
        <div class="forge-section-title"><span>VERDICT DE L’HOLOCRON</span><small>${pareto?'FRONT DE PARETO':'CANDIDAT RETENU'}</small></div>
        <div class="forge-verdict-main ${verdict.kind}"><div class="forge-verdict-mark">${verdict.kind==='strong'?'✓':verdict.kind==='action'?'→':'!'}</div><div><strong>${esc(verdict.title)}</strong><p>${esc(verdict.text)}</p></div></div>
        <div class="forge-verdict-list">
          <span class="${audit.setPct===100?'ok':'warn'}"><b>${audit.setPct===100?'✓':'!'}</b> Set dominant : ${audit.setHits}/6 emplacements conformes</span>
          <span class="${audit.primaryKnown&&audit.primaryHits===audit.primaryKnown?'ok':'warn'}"><b>${audit.primaryKnown&&audit.primaryHits===audit.primaryKnown?'✓':'!'}</b> Primaires : ${audit.primaryKnown?`${audit.primaryHits}/${audit.primaryKnown} conformes à la référence`:'données Kyber non disponibles'}</span>
          <span class="${audit.secondaryHits?'ok':'warn'}"><b>${audit.secondaryHits?'✓':'!'}</b> Secondaires : ${audit.secondaryHits}/${audit.secondaryTotal} mods avec focus Kyber</span>
          <span class="ok"><b>✓</b> Mods recherchés sur : ${esc(scope)}</span>
        </div>
      </section>
      <section class="forge-stats-block">
        <div class="forge-section-title"><span>ÉTAT APRÈS APPLICATION</span><small>6 mods · comparaison immédiate</small></div>
        <div class="forge-featured-stats">${featuredStats}</div>
        ${otherStats?`<div class="forge-all-stats">${otherStats}</div>`:''}
      </section>
      <section class="forge-mods-block">
        <div class="forge-section-title"><span>ARSENAL DE LA CONFIGURATION</span><small>6 slots · détails complets</small></div>
        <div class="forge-mod-grid">${build.map((m,mi)=>{
          const primary=String(m.primary_stat||'?');
          const primaryValue=m.primary_value!=null?` ${num(m.primary_value,1)}${String(primary).endsWith('%')?'':' '}`:'';
          const secondaries=optimizerModSecondaries(m);
          const owner=String(m.character||m.equippedTo||m.equipped_to||'').trim();
          return `<article class="forge-mod-card">
            <div class="forge-mod-top"><div class="forge-mod-icon">${modIconHtml(m,'52')}</div><div><span class="forge-slot-index">${mi+1}/6 · ${esc(m.slot||'?')}</span><strong>${esc(m.set_name||m.set||'SET INCONNU')}</strong></div></div>
            <div class="forge-mod-primary"><span>PRIMAIRE</span><b>${esc(primary)}${esc(primaryValue)}</b></div>
            <div class="forge-mod-secondaries"><span>SECONDAIRES</span>${secondaries.length?secondaries.map(x=>`<b>${esc(x)}</b>`).join(''):'<em>Aucune secondaire renseignée</em>'}</div>
            ${owner?`<div class="forge-mod-owner"><span>ACTUELLEMENT</span><b>${esc(owner)}</b></div>`:''}
          </article>`;
        }).join('')}</div>
      </section>
    </article>`;
  }).join('');
}

