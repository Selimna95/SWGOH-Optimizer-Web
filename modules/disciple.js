function setAnalysisTab(tab){
  document.querySelectorAll('.analysis-tab').forEach(x=>x.classList.toggle('active',x.dataset.analysisTab===tab));
  document.querySelectorAll('.analysis-panel').forEach(x=>x.hidden=x.dataset.analysisPanel!==tab);
  if(tab==='recap') renderAnalysisRecap();
  if(tab==='selection') renderSelectionPanel();
  if(tab==='report') renderCharacterReport();
  if(tab==='inventory') renderInventory();
  if(tab==='reallocation') renderReallocationPanel();
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
function relicLevelFromTier(value){
  // SWGOH/Comlink: relic.currentTier 0/1/2 = R0 (not relic), values >2 are actual relic + 2.
  // Current game max is R10, so tier 12 = R10. Never display impossible R11+.
  const n=Number(value);
  if(!Number.isFinite(n)||n<=2)return 0;
  return Math.max(0,Math.min(10,Math.floor(n)-2));
}
function auditRows(){
  const faction=analysisFaction||'Toutes les factions';
  let rows=charactersInFaction(faction).filter(c=>rosterUnitType(c)!=='ship').map(c=>{
    const cm=getCharacterMods(c), st=v176ModStatus(cm);
    const secSpeed=cm.reduce((n,m)=>n+(modSpeedMetrics(m).secondary||0),0);
    const primarySpeed=cm.reduce((n,m)=>n+modPrimarySpeed(m),0);
    const speedCats=new Set(); let speedCount=0;
    for(const m of cm){const x=modSpeedMetrics(m); if(x.primary)speedCats.add('primary_speed'); else speedCats.add(speedCategory(x.secondary)); if(x.primary || (x.secondary||0)>0)speedCount++;}
    const p=optimizerProfileForCharacter(c)||{};
    const relicTier=Number(c.relic_tier??c.relicTier??p.relic_tier??0)||0; const relic=relicLevelFromTier(relicTier);
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
function factionBadgeHtml(name){
  const label=String(name||'').trim();
  if(!label)return '';
  const key=compactKey(label);
  let side='neutral';
  if(['LIGHT','LUMIERE','JEDI','REPUBLIC','RESISTANCE','REBELS','PHOENIX','GALACTICREPUBLIC'].some(x=>key.includes(x))) side='light';
  if(['DARK','OBSCUR','SITH','EMPIRE','FIRSTORDER','SEPARATISTS','NIGHTSISTERS'].some(x=>key.includes(x))) side='dark';
  return `<span class=\"faction-badge ${side}\">${esc(label)}</span>`;
}
function factionBadgesHtml(list){
  const values=Array.isArray(list)?list.filter(Boolean):[];
  return values.length?`<span class=\"faction-badges\">${values.map(factionBadgeHtml).join('')}</span>`:'<span class=\"faction-badges\"><span class=\"faction-badge neutral\">Faction non renseignée</span></span>';
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
    <td><strong>${esc(r.character.name||r.character.baseId)}</strong>${factionBadgesHtml(r.factions)}</td>
    <td>${r.relic?'R'+num(r.relic):'—'}</td><td>${r.modCount}/6</td><td>${num(r.totalSpeed)}</td><td>${num(r.secSpeed)}</td><td>${r.speedCount}</td><td>${r.primarySpeed?num(r.primarySpeed):'NON'}</td><td><span class="audit-badge ${r.class}">${esc(r.status)}</span></td>
    <td><button type="button" class="detail-mods-btn" data-open-character="${esc(characterKey(r.character))}">OUVRIR LE RAPPORT</button></td>
  </tr>`).join('')||'<tr><td colspan="9">Aucun personnage ne correspond aux filtres.</td></tr>';
  $('selectionTable').querySelectorAll('tr[data-character-key]').forEach(row=>row.addEventListener('click',e=>{if(e.target.closest('.detail-mods-btn'))return;analysisSelectedCharacter=row.dataset.characterKey;charSelect.value=analysisSelectedCharacter;setAnalysisTab('report');}));
  $('selectionTable').querySelectorAll('[data-open-character]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();analysisSelectedCharacter=btn.dataset.openCharacter;charSelect.value=analysisSelectedCharacter;setAnalysisTab('report');}));
  renderCharacterDetail();
}
function characterReportStats(c){
  const p=optimizerProfileForCharacter(c)||{};
  const base=p.base_stats||{};
  const current=p.current_stats||{};
  const diff=p.mod_stat_diffs||{};
  const keys=[
    ['Health','Health'],['Protection','Protection'],['Speed','Speed'],['Physical Damage','Physical Damage'],['Special Damage','Special Damage'],
    ['Offense','Offense'],['Defense','Defense'],['Potency','Potency'],['Tenacity','Tenacity'],['Armor','Armor'],['Resistance','Resistance'],
    ['Physical Critical Chance','Crit Chance'],['Special Critical Chance','Special Crit Chance'],['Critical Damage','Critical Damage'],['Critical Avoidance','Critical Avoidance'],['Mastery','Mastery']
  ];
  const seen=new Set(), rows=[];
  for(const [key,label] of keys){
    const b=base[key], cur=current[key], d=diff[key];
    if(b==null && cur==null && d==null) continue;
    seen.add(key);
    rows.push({label,base:b,current:cur,diff:d});
  }
  for(const [key,cur] of Object.entries(current)) if(!seen.has(key) && (base[key]!=null || diff[key]!=null)) rows.push({label:key,base:base[key],current:cur,diff:diff[key]});
  return {profile:p,rows};
}
function formatReportStat(v,key=''){
  if(v==null || v==='') return '—';
  const n=Number(v); if(!Number.isFinite(n)) return esc(v);
  const pct=['Potency','Tenacity','Critical Damage','Crit Chance','Special Crit Chance','Physical Critical Chance','Critical Avoidance','Mastery'].some(x=>key.toLowerCase().includes(x.toLowerCase()));
  if(pct && Math.abs(n)<=2) return `${num(n*100,2)} %`;
  return num(n, n%1 ? 2 : 0);
}
function renderCharacterReport(){
  const box=$('characterReport'); if(!box)return;
  const c=rosterCharacters.find(x=>characterKey(x)===analysisSelectedCharacter);
  if(!c){box.innerHTML='<div class="empty">Sélectionnez un personnage depuis PERSONNAGE / FACTION.</div>';return;}
  const cm=getCharacterMods(c), s=v176ModStatus(cm), p=optimizerProfileForCharacter(c)||{}, st=characterReportStats(c);
  const secSpeed=cm.reduce((n,m)=>n+(modSpeedMetrics(m).secondary||0),0);
  const primarySpeed=cm.reduce((n,m)=>n+modPrimarySpeed(m),0);
  const totalSpeed=cm.reduce((n,m)=>n+(modSpeedMetrics(m).secondary||0)+modPrimarySpeed(m),0)+Number(st.profile.base_stats?.Speed||0);
  const speedCount=cm.filter(m=>{const x=modSpeedMetrics(m);return x.primary||(x.secondary||0)>0;}).length;
  const factions=factionMap[characterKey(c)]||[];
  const order=['Square','Arrow','Diamond','Triangle','Circle','Cross'];
  const bySlot=new Map(cm.map(m=>[m.slot,m]));
  const cards=order.map(slot=>{const m=bySlot.get(slot); return m?renderReportModCard(m):`<div class="report-mod-card missing"><div class="report-mod-slot">${slot}</div><h3>MOD MANQUANT</h3><p>Aucun mod équipé sur cet emplacement.</p></div>`;}).join('');
  box.innerHTML=`
    <div class="report-toolbar"><button class="analysis-back" id="backToCharacterSelection">← PERSONNAGE / FACTION</button></div>
    <div class="report-header">
      <div><span class="tag">RAPPORT PERSONNAGE</span><h1>${esc(c.name||c.baseId)}</h1>${factionBadgesHtml(factions)}</div>
      <div class="report-identity"><div><span>NIVEAU</span><b>${num(c.level||p.level)}</b></div><div><span>GEAR</span><b>${num(c.gear||c.gear_level||p.gear_level)}</b></div><div><span>RELIC</span><b>${'R'+num(relicLevelFromTier(c.relic_tier??c.relicTier??p.relic_tier??0))}</b></div><div><span>ÉTOILES</span><b>${num(c.stars||c.rarity||p.rarity)}★</b></div><div><span>PUISSANCE</span><b>${num(c.power||c.power_rating||c.powerRating)}</b></div></div>
    </div>
    <div class="report-kpis"><div><span>MODS</span><strong>${cm.length}/6</strong></div><div><span>SPEED TOTALE DES MODS</span><strong>${num(totalSpeed)}</strong></div><div><span>SPEED SECONDAIRE</span><strong>+${num(secSpeed)}</strong></div><div><span>PRIMAIRE SPEED</span><strong>${primarySpeed?'+'+num(primarySpeed):'NON'}</strong></div><div><span>MODS AVEC SPEED</span><strong>${speedCount}/6</strong></div><div><span>STATUT V176</span><strong class="audit-badge ${s.class}">${esc(s.status)}</strong></div></div>
    <div class="report-section"><div class="report-section-title">STATISTIQUES DU PERSONNAGE</div><div class="report-stats-wrap"><table class="v18-table report-stats"><thead><tr><th>Statistique</th><th>Base</th><th>Actuelle</th><th>Apport mods</th></tr></thead><tbody>${st.rows.map(r=>`<tr><td>${esc(r.label)}</td><td>${formatReportStat(r.base,r.label)}</td><td>${formatReportStat(r.current,r.label)}</td><td>${formatReportStat(r.diff,r.label)}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="report-section"><div class="report-section-title">LES 6 MODS ÉQUIPÉS</div><div class="report-mod-grid">${cards}</div></div>
    <div class="report-section report-analysis-grid"><div><div class="report-section-title">ANALYSE SPEED</div><div class="report-list"><div><span>Speed secondaire</span><b>+${num(secSpeed)}</b></div><div><span>Speed primaire</span><b>${primarySpeed?'+'+num(primarySpeed):'Aucune'}</b></div><div><span>Speed totale apportée par les mods</span><b>+${num(secSpeed+primarySpeed)}</b></div><div><span>Meilleure Speed secondaire</span><b>+${num(cm.reduce((x,m)=>Math.max(x,modSpeedMetrics(m).secondary||0),0))}</b></div><div><span>Mods niveau 15</span><b>${cm.filter(m=>Number(m.level)===15).length}/6</b></div></div></div><div><div class="report-section-title">SETS</div><div class="report-list">${[...new Set(cm.map(m=>m.set_name).filter(Boolean))].map(set=>`<div><span>${esc(set)}</span><b>${cm.filter(m=>m.set_name===set).length}</b></div>`).join('')||'<div><span>Aucun set</span><b>—</b></div>'}</div></div></div>
    <div class="report-section"><div class="report-section-title">SECONDAIRES DES MODS</div><div class="report-secondary-list">${cm.map(m=>`<div class="report-secondary-row"><strong>${esc(m.slot)}</strong><span>${esc(modSecondaries(m)||'—')}</span></div>`).join('')||'<div>Aucun mod équipé.</div>'}</div></div>`;
  $('backToCharacterSelection')?.addEventListener('click',()=>setAnalysisTab('selection'));
  box.querySelectorAll('[data-mod-index]').forEach(el=>el.addEventListener('click',()=>showModInventoryDetail(Number(el.dataset.modIndex))));
}
function renderReportModCard(m){
  const x=modSpeedMetrics(m), sec=modSecondaries(m)||'Aucune';
  return `<button type="button" class="report-mod-card" data-mod-index="${m._index??''}"><div class="report-mod-slot"><span>${esc(m.slot)}</span><em>${esc(m.set_name||'—')}</em>${modIconHtml(m,'52')}</div><h3>${esc(m.primary_stat||'—')} ${num(m.primary_value,1)}</h3><div class="report-mod-speed">${x.primary?'PRIMAIRE SPEED':(x.secondary?`SPEED SECONDAIRE +${num(x.secondary)}`:'SANS SPEED')}</div><p>${esc(sec)}</p><small>Niveau ${num(m.level)} · ${modDots(m)} dots · Tier ${modIconTier(m)} · ${esc(m.character||'Libre')}</small></button>`;
}

function renderCharacterDetail(){
  const c=rosterCharacters.find(x=>characterKey(x)===analysisSelectedCharacter);
  const box=$('characterModDetail'); if(!box)return;
  if(!c){box.innerHTML='<div class="empty">Sélectionnez un personnage.</div>';return;}
  const cm=getCharacterMods(c), s=v176ModStatus(cm);
  const secSpeed=cm.reduce((n,m)=>n+(modSpeedMetrics(m).secondary||0),0), primarySpeed=cm.reduce((n,m)=>n+modPrimarySpeed(m),0);
  box.innerHTML=`<div class="character-detail-head"><div><span class="tag">PERSONNAGE</span><h2>${esc(c.name||c.baseId)}</h2><p>Niveau ${num(c.level)} · Gear ${num(c.gear)} · ${relicLevelFromTier(c.relic_tier??c.relicTier??0)?'R'+num(relicLevelFromTier(c.relic_tier??c.relicTier)):'Sans Relic'} · ${num(c.stars)}★ · Puissance ${num(c.power)}</p>${factionBadgesHtml(factionMap[characterKey(c)]||[])}</div><div class="detail-kpis"><b>${cm.length}/6</b><span>mods équipés</span><b>${num(secSpeed)}</b><span>Speed secondaire</span><b>${num(primarySpeed)}</b><span>Speed primaire</span><strong class="audit-badge ${s.class}">${esc(s.status)}</strong></div></div>
  <div class="character-detail-actions"><strong>DÉTAIL DES 6 MODS ÉQUIPÉS</strong><button type="button" class="detail-mods-btn" id="openCharacterInventory">OUVRIR DANS L’INVENTAIRE</button></div>
  <div class="mod-detail-grid">${[...cm,...Array(Math.max(0,6-cm.length)).fill(null)].slice(0,6).map((m,i)=>m?renderModCard(m):`<div class="mod-card empty-slot"><strong>${['Square','Arrow','Diamond','Triangle','Circle','Cross'][i]}</strong><span>MOD MANQUANT</span></div>`).join('')}</div>`;
  $('openCharacterInventory')?.addEventListener('click',()=>openCharacterInventory(c));
}
function renderModCard(m){
  const x=modSpeedMetrics(m), speed=x.secondary??0, owner=m.character||'Libre';
  const sec=modSecondaries(m)||'—';
  const speedClass=x.primary?'speed_primary':speedCategory(speed);
  return `<button class="mod-detail-card ${speedClass}" data-mod-index="${m._index??''}">
    <div class="mod-card-top"><strong>${esc(m.slot||'—')}</strong><span>${esc(m.set_name||'—')}</span>${modIconHtml(m,'54')}</div>
    <div class="mod-primary"><b>${esc(m.primary_stat||'—')}</b> ${num(m.primary_value,1)}</div>
    <div class="mod-speed-line">${x.primary?'Primaire Speed':(speed>0?`Speed secondaire +${num(speed)}`:'Sans Speed')}</div>
    <div class="mod-secondaries">${esc(sec)}</div>
    <small>Niv. ${num(m.level)} · ${num(m.rarity)}★ · ${esc(owner)}</small>
  </button>`;
}
function openCharacterInventory(character){
  if(!character)return;
  const name=String(character.name||character.baseId||'').trim();
  const search=$('analysisSearch');
  if(search)search.value=name;
  const owner=$('analysisOwnerFilter');
  if(owner)owner.value='equipped';
  setAnalysisTab('inventory');
  renderInventory();
}
function renderInventory(){
  const wrap=$('inventoryTable'), meta=$('inventoryMeta'); if(!wrap)return;
  const q=String($('analysisSearch')?.value||'').trim().toLowerCase();
  const set=$('analysisSetFilter')?.value||'';
  const slot=$('analysisSlotFilter')?.value||'';
  const primary=$('analysisPrimaryFilter')?.value||'';
  const secondary=$('analysisSecondaryFilter')?.value||'';
  const speed=$('analysisSpeedFilter')?.value||'';
  let rows=inventoryRows().filter(m=>{
    if(q && !JSON.stringify(m).toLowerCase().includes(q))return false;
    if(set && m.set_name!==set)return false;
    if(slot && m.slot!==slot)return false;
    if(primary && compactKey(m.primary_stat)!==compactKey(primary))return false;
    if(secondary){
      let found=false;
      for(let i=1;i<=4;i++){
        if(compactKey(secondaryDisplayName(m[`secondary_${i}_stat`]))===compactKey(secondary)){found=true;break;}
      }
      if(!found)return false;
    }
    if(speed && m._speedCategory!==speed)return false;
    return true;
  });
  rows.sort((a,b)=>b._totalSpeed-a._totalSpeed||String(a.set_name||'').localeCompare(String(b.set_name||''),'fr')||String(a.slot||'').localeCompare(String(b.slot||''),'fr'));
  meta.textContent=`${rows.length} mod(s) affiché(s) sur ${mods.length}`;
  wrap.innerHTML=rows.map(m=>{
    const x=modSpeedMetrics(m);
    return `<tr class="${m._speedCategory}" data-mod-index="${m._index}">
      <td>${esc(m.set_name||'—')}</td><td><strong>${esc(m.slot||'—')}</strong></td>
      <td><strong>${esc(m.primary_stat||'—')}</strong> ${num(m.primary_value,1)}</td>
      <td>${esc(modSecondaries(m)||'—')}</td><td class="speed-cell">${x.primary?'★':(x.secondary?`+${num(x.secondary)}`:'—')}</td>
      <td><div class="inventory-mod-icon">${modIconHtml(m)}</div></td><td>${num(m.level)}</td><td>${esc(m.character||'Libre')}</td>
    </tr>`;
  }).join('')||'<tr><td colspan="9">Aucun mod ne correspond aux filtres.</td></tr>';
  wrap.querySelectorAll('[data-mod-index]').forEach(row=>row.addEventListener('click',()=>showModInventoryDetail(Number(row.dataset.modIndex))));
}
function showModInventoryDetail(index){
  const raw=mods[index]; if(!raw)return;
  const m=normalizeModForDisplay(raw), x=modSpeedMetrics(m);
  const modal=$('modDetailModal'); if(!modal)return;
  $('modDetailTitle').textContent=`${m.slot||'Mod'} · ${m.set_name||'—'}`;
  $('modDetailBody').innerHTML=`<div class="modal-actions"><button type="button" class="primary" id="modalReallocationBtn">🔄 RECHERCHER UNE RÉAFFECTATION</button></div><div class="modal-mod-grid">
    <div><span>PROPRIÉTAIRE</span><b>${esc(m.character||'Libre')}</b></div>
    <div><span>SET</span><b>${esc(m.set_name||'—')}</b></div>
    <div><span>SLOT</span><b>${esc(m.slot||'—')}</b></div>
    <div><span>PRIMAIRE</span><b>${esc(m.primary_stat||'—')} ${num(m.primary_value,1)}</b></div>
    <div><span>SPEED</span><b>${x.primary?'Primaire Speed':(x.secondary?`+${num(x.secondary)} secondaire`:'Aucune')}</b></div>
    <div><span>NIVEAU</span><b>${num(m.level)}</b></div>
    <div><span>MOD</span><b>${modIconHtml(m,'48')}</b></div>
  </div><h3>SECONDAIRES</h3><ul>${[1,2,3,4].map(i=>m[`secondary_${i}_stat`]?`<li>${esc(m[`secondary_${i}_stat`])} : <strong>${num(m[`secondary_${i}_value`],1)}</strong></li>`:'').join('')||'<li>Aucune donnée secondaire.</li>'}</ul>`;
  modal.hidden=false;
  const reallocationButton=$('modDetailBody')?.querySelector('#modalReallocationBtn');
  reallocationButton?.addEventListener('click',(event)=>{
    event.preventDefault();
    event.stopPropagation();
    closeModDetail();
    openReallocation(index);
  });
}
function closeModDetail(){if($('modDetailModal'))$('modDetailModal').hidden=true;}
function prepareV18Filters(){
  const sets=[...new Set(mods.map(m=>normalizeModForDisplay(m).set_name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr'));
  const primaries=[...new Set(mods.map(m=>normalizeModForDisplay(m).primary_stat).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr'));
  const secondaries=[...new Set(mods.flatMap(raw=>{
    const m=normalizeModForDisplay(raw);
    return [1,2,3,4].map(i=>m[`secondary_${i}_stat`]).filter(Boolean).map(secondaryDisplayName);
  }))].sort((a,b)=>a.localeCompare(b,'fr'));
  const setSel=$('analysisSetFilter'), primSel=$('analysisPrimaryFilter'), secSel=$('analysisSecondaryFilter');
  if(setSel)setSel.innerHTML='<option value="">Tous les sets</option>'+sets.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  if(primSel)primSel.innerHTML='<option value="">Toutes les primaires</option>'+primaries.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  if(secSel)secSel.innerHTML='<option value="">Toutes les secondaires</option>'+secondaries.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
}
function secondaryDisplayName(name){
  const raw=String(name||'').trim();
  const key=compactKey(raw);
  const map={
    SPEED:'Speed', OFFENSE:'Offense', DEFENSE:'Defense', HEALTH:'Health', PROTECTION:'Protection',
    POTENCY:'Potency', TENACITY:'Tenacity', CRITICALCHANCE:'Critical Chance',
    CRITICALAVOIDANCE:'Critical Avoidance', CRITICALDAMAGE:'Critical Damage'
  };
  return map[key]||raw;
}
function reallocationSpeedTierMatch(mod,tier){
  const x=modSpeedMetrics(mod);
  const speed=Number(x?.secondary);
  const hasSecondary=Number.isFinite(speed) && speed>0;
  if(tier==='no_speed')return !hasSecondary;
  if(tier==='speed_1_5')return hasSecondary && speed>=1 && speed<=5;
  if(tier==='speed_6_9')return hasSecondary && speed>=6 && speed<=9;
  return false;
}
// DISCIPLE ONLY — portrait resolver.
// The game texture key is not always the same as the roster baseId
// (e.g. Luminara -> luminara, Ackbar -> ackbaradmiral, Fives -> trooperclone fives).
// Keep this isolated to DISCIPLE so ACOLYTE and SEIGNEUR SITH remain untouched.
function disciplePortraitCandidates(character){
 const rawName=String(character?.name||character?.character||'').trim();
 const name=rawName.toLowerCase();
 const base=String(character?.baseId||character?.base_id||'').trim().toLowerCase();
 const thumb=String(character?.thumbnailName||character?.thumbnail_name||'').trim().toLowerCase();
 const candidates=[];
 const add=id=>{
   const clean=String(id||'').trim().toLowerCase().replace(/^tex\.charui[_\.]/,'').replace(/\.png$/,'');
   if(clean&&!candidates.includes(clean))candidates.push(clean);
 };
 // If the API already supplied the real portrait/thumbnail, keep it first.
 const direct=String(character?.portraitUrl||character?.portrait_url||character?.image||character?.imageUrl||'').trim();
 const urls=[];
 if(/^https?:\/\//i.test(direct))urls.push(direct);
 if(thumb)add(thumb);
 const exact={
   'luminara unduli':['luminara'],
   'admiral ackbar':['ackbaradmiral'],
   'boba fett, scion of jango':['bobafettold'],
   'crosshair (scarred)':['crosshair','crosshair_scarred','crosshairscarred'],
   'ct-5555 "fives"':['trooperclone fives'],
   'death trooper':['trooperdeath','deathtrooper'],
   'death trooper (peridea)':['troopedeathperidea','death_trooper_peridea','deathtrooperperidea'],
   'colonel ward':['bishop','colonelward','ward'],
   'ewok elder':['ewok chief'],
   'ezra bridger':['ezra s3'],
   'gar saxon':['garsaxon','gar_saxon'],
   'hondo ohnaka':['hondoonaka','hondo'],
   'jawa scavenger':['jawa scavenger'],
   'l3-37':['l337'],
   'range trooper':['trooperranger'],
   'scarif rebel pathfinder':['rebel_scarif','rebel scarif']
 };
 for(const [label,ids] of Object.entries(exact)){
   if(name===label || name.includes(label))ids.forEach(add);
 }
 // Generic baseId/name remain useful for units whose texture key matches directly.
 add(base);
 const slug=name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'');
 add(slug);
 const gameUrls=candidates.map(id=>`https://game-assets.swgoh.gg/textures/tex.charui_${id.replace(/ /g,'_')}.png`);
 // Stable community mirror. Its filenames follow the displayed character name,
 // which covers many cases where SWGOH baseId != texture key.
 const mirrorName=rawName.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'_');
 const mirror=`https://raw.githubusercontent.com/tools4swgoh/swgoh-icons/main/65px-Unit-Character-${encodeURIComponent(mirrorName)}-portrait.png`;
 // Older files in the mirror keep punctuation already percent-encoded in the filename.
 const legacyName=mirrorName.replace(/[^A-Za-z0-9_-]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2,'0')}`);
 const legacyMirror=`https://raw.githubusercontent.com/tools4swgoh/swgoh-icons/main/65px-Unit-Character-${encodeURIComponent(legacyName)}-portrait.png`;
 return [...urls,...gameUrls,mirror,legacyMirror];
}
function disciplePortraitHtml(character){
 const urls=disciplePortraitCandidates(character);
 const label=String(character?.name||character?.baseId||'?');
 if(!urls.length)return `<div class="topchange-portrait topchange-portrait-fallback"><span>${esc(label.slice(0,1))}</span></div>`;
 const encoded=urls.map(u=>u.replace(/'/g,"\\'"));
 const first=encoded[0];
 const rest=JSON.stringify(encoded.slice(1)).replace(/"/g,'&quot;');
 return `<div class="topchange-portrait" data-essential-portrait-list="${rest}"><img src="${first}" alt="${esc(label)}" loading="lazy" data-essential-portrait-index="0"></div>`;
}

function reallocationSpeedTierLabel(tier){
  return tier==='no_speed'?'SANS VITESSE':tier==='speed_1_5'?'1 À 5 VITESSE':tier==='speed_6_9'?'6 À 9 VITESSE':'—';
}
function reallocationCharacterOptions(){
  if(!reallocationSpeedTier)return [];
  // Disciple must remain instantaneous even on a large roster. The previous
  // implementation scanned/normalized the entire mod list once per character,
  // turning a 2k-mod / 400-character roster into hundreds of thousands of
  // repeated operations. Build the owner index in a single pass instead.
  const owners=new Map();
  const charactersByKey=new Map(rosterCharacters.map(c=>[characterKey(c),c]));
  for(const raw of mods){
    const m=normalizeModForDisplay(raw);
    if(!reallocationSpeedTierMatch(m,reallocationSpeedTier))continue;
    const ownerKey=reallocationModOwnerKey(m);
    if(!ownerKey)continue;
    const entry=owners.get(ownerKey)||{character:charactersByKey.get(ownerKey)||null,count:0};
    entry.count++;
    owners.set(ownerKey,entry);
  }
  return [...owners.values()]
    .filter(x=>x.character&&x.count>0)
    .sort((a,b)=>b.count-a.count||String(a.character?.name||'').localeCompare(String(b.character?.name||''),'fr'));
}
function renderReallocationSpeedTierChoices(){
  const box=$('reallocationSpeedTierChoices');
  if(box)box.querySelectorAll('[data-speed-tier]').forEach(btn=>btn.classList.toggle('is-active',btn.dataset.speedTier===reallocationSpeedTier));
  const info=$('reallocationSpeedTierInfo');
  if(!info)return;
  if(!reallocationSpeedTier){info.textContent='Choisis une tranche pour afficher les personnages concernés.';return;}
  const rows=reallocationCharacterOptions();
  const modsCount=rows.reduce((sum,r)=>sum+r.count,0);
  info.innerHTML=`<strong>${esc(reallocationSpeedTierLabel(reallocationSpeedTier))}</strong> · <b>${modsCount}</b> mod(s) · <b>${rows.length}</b> personnage(s) concerné(s)`;
}
function renderReallocationCharacterChoices(){
  const box=$('reallocationCharacterChoices'); if(!box)return;
  if(!reallocationSpeedTier){box.innerHTML='<div class="empty">Choisis d’abord un niveau de vitesse.</div>';return;}
  const rows=reallocationCharacterOptions();
  if(!rows.length){box.innerHTML=`<div class="disciple-no-result"><b>AUCUN PERSONNAGE</b><span>Aucun personnage ne possède actuellement de mod dans <strong>${esc(reallocationSpeedTierLabel(reallocationSpeedTier))}</strong>.</span></div>`;return;}
  box.innerHTML=rows.map(r=>{
    const c=r.character; const key=characterKey(c); const active=key===reallocationCharacterKey;
    return `<button type="button" class="disciple-character-choice ${active?'is-active':''}" data-character-key="${esc(key)}"><div class="disciple-character-choice-portrait">${disciplePortraitHtml(c)}</div><div><strong>${esc(c.name||c.baseId||'Personnage')}</strong><span>${r.count} mod${r.count>1?'s':''} dans la tranche</span></div></button>`;
  }).join('');
  bindEssentialPortraits();
}
function setReallocationSpeedTier(tier){
  if(!['no_speed','speed_1_5','speed_6_9'].includes(tier))return;
  reallocationSpeedTier=tier;
  reallocationCharacterKey='';
  reallocationSelectedModIndex=null;
  renderReallocationSpeedTierChoices();
  renderReallocationCharacterChoices();
  renderReallocationModSelector();
  renderReallocationSelectionVisual(null);
  renderReallocationSecondaryOptions('');
  renderReallocationResults();
}
function setReallocationCharacter(key){
  const match=reallocationCharacterOptions().find(x=>characterKey(x.character)===compactKey(key));
  if(!match)return;
  reallocationCharacterKey=characterKey(match.character);
  reallocationSelectedModIndex=null;
  renderReallocationCharacterChoices();
  renderReallocationModSelector();
  renderReallocationSelectionVisual(null);
  renderReallocationSecondaryOptions('');
  renderReallocationResults();
}

function reallocationSecondaryOptions(){
  const names=new Map();
  for(const raw of mods){
    const m=normalizeModForDisplay(raw);
    for(let i=1;i<=4;i++) if(m[`secondary_${i}_stat`]){
      const label=secondaryDisplayName(m[`secondary_${i}_stat`]);
      names.set(compactKey(label),label);
    }
  }
  return [...names.values()].sort((a,b)=>a.localeCompare(b,'fr'));
}
function reallocationModOwnerKey(mod){
  const ownerKey=modOwnerKey(mod);
  if(!ownerKey)return '';
  const owner=rosterCharacters.find(c=>[characterKey(c),compactKey(c?.name),compactKey(c?.baseId),compactKey(c?.base_id),compactKey(c?.characterId),compactKey(c?.character_id)].filter(Boolean).some(k=>k===ownerKey||k.includes(ownerKey)||ownerKey.includes(k)));
  return owner?characterKey(owner):ownerKey;
}
function reallocationModBelongsToSelection(mod){
  if(reallocationSpeedTier===null || !reallocationCharacterKey || !mod)return false;
  return reallocationSpeedTierMatch(mod,reallocationSpeedTier) && reallocationModOwnerKey(mod)===reallocationCharacterKey;
}
function selectedReallocationMod(){
  if(reallocationSelectedModIndex==null)return null;
  const mod=mods[reallocationSelectedModIndex] ? normalizeModForDisplay(mods[reallocationSelectedModIndex]) : null;
  return reallocationModBelongsToSelection(mod) ? mod : null;
}
function reallocationEquippedModOptions(){
  // Après le choix du niveau puis du personnage, le sélecteur ne montre
  // exclusivement que les mods appartenant à cette tranche de vitesse.
  return mods.map((raw,index)=>({m:normalizeModForDisplay(raw),index}))
    .filter(x=>reallocationModBelongsToSelection(x.m))
    .sort((a,b)=>{
      const sa=String(a.m.slot||'').localeCompare(String(b.m.slot||''),'fr');
      if(sa)return sa;
      return Number(b.m.level||0)-Number(a.m.level||0);
    });
}
function renderReallocationModSelector(){
  const select=$('reallocationModSelect'); if(!select)return;
  const current=selectedReallocationMod();
  const currentId=current?String(current.game_id||current.id||''):'';
  const opts=reallocationEquippedModOptions();
  select.innerHTML='<option value="">Choisir un mod équipé…</option>'+opts.map(x=>{
    const m=x.m;
    const label=`${m.character||'Personnage'} · ${m.slot||'Mod'} · ${m.set_name||'—'} · ${m.primary_stat||'—'} · ${modSecondaries(m)||'sans secondaire'}`;
    return `<option value="${x.index}" ${currentId && String(m.game_id||m.id||'')===currentId?'selected':''}>${esc(label)}</option>`;
  }).join('');
  if(currentId){
    const found=opts.find(x=>String(x.m.game_id||x.m.id||'')===currentId);
    if(found)select.value=String(found.index);
  }
}
function renderReallocationSecondaryOptions(selectedValue=''){
  const select=$('reallocationSecondary'); if(!select)return;
  const opts=reallocationSecondaryOptions();
  select.innerHTML='<option value="">Choisir une secondaire…</option>'+opts.map(x=>`<option value="${esc(compactKey(x))}">${esc(x)}</option>`).join('');
  if(selectedValue && opts.some(x=>compactKey(x)===selectedValue))select.value=selectedValue;
}
function renderReallocationSelectionVisual(selected){
  const box=$('reallocationSelectedModVisual');
  const rules=$('reallocationLockedRules');
  const btn=$('reallocationSelectedModBtn');
  const info=$('reallocationInfo');
  if(!selected){
    if(box)box.innerHTML='<div class="empty">Aucun mod sélectionné.</div>';
    if(rules)rules.innerHTML='<div class="disciple-lock-card"><span>SET</span><b>—</b><small>sera conservé</small></div><div class="disciple-lock-card"><span>PRIMAIRE</span><b>—</b><small>sera conservée</small></div><div class="disciple-lock-card"><span>SLOT</span><b>—</b><small>même emplacement</small></div>';
    if(btn)btn.textContent='AUCUN MOD SÉLECTIONNÉ';
    if(info)info.textContent='Sélectionnez un mod équipé pour commencer.';
    return;
  }
  if(box)box.innerHTML=`<div class="disciple-selected-mod-card"><div class="disciple-selected-mod-icon">${modIconHtml(selected,'58')}</div><div class="disciple-selected-mod-main"><span>${esc(selected.character||'Libre')} · ${esc(selected.slot||'Mod')}</span><strong>${esc(selected.set_name||'—')}</strong><small>${esc(modSecondaries(selected)||'Aucune secondaire')} · niveau ${num(selected.level||0)}</small></div><div class="disciple-selected-mod-speed"><span>VITESSE</span><b>${num(modTotalSpeed(selected))}</b></div></div>`;
  if(rules)rules.innerHTML=`<div class="disciple-lock-card is-locked"><span>SET CONSERVÉ</span><b>${esc(selected.set_name||'—')}</b><small>aucun changement de set</small></div><div class="disciple-lock-card is-locked"><span>PRIMAIRE CONSERVÉE</span><b>${esc(selected.primary_stat||'—')} ${num(selected.primary_value,1)}</b><small>aucun changement de primaire</small></div><div class="disciple-lock-card is-locked"><span>SLOT CONSERVÉ</span><b>${esc(selected.slot||'—')}</b><small>remplacement à emplacement identique</small></div>`;
  if(btn)btn.textContent=`${selected.character||'Libre'} · ${selected.slot||'Mod'} · ${selected.set_name||'—'}`;
  if(info)info.innerHTML=`<strong>${esc(selected.character||'Libre')}</strong> · ${esc(selected.slot||'Mod')} · Set <b>${esc(selected.set_name||'—')}</b> · Primaire <b>${esc(selected.primary_stat||'—')}</b> · ${esc(modSecondaries(selected)||'Aucune secondaire')}`;
}
function setReallocationMod(index){
  const n=Number(index);
  if(!Number.isFinite(n)||!mods[n])return;
  reallocationSelectedModIndex=n;
  const selected=normalizeModForDisplay(mods[n]);
  renderReallocationModSelector();
  renderReallocationSelectionVisual(selected);
  // Disciple = one secondary only. Never auto-select a secondary from the current mod.
  const currentSecondary=$('reallocationSecondary')?.value||'';
  renderReallocationSecondaryOptions(currentSecondary);
  renderReallocationResults();
}
function reallocationStatusAllowed(status){
  if(status==='INCOMPLETS')return $('reallocationIncomplete')?.checked!==false;
  if(status==='TRÈS FAIBLES')return $('reallocationVeryLow')?.checked!==false;
  if(status==='FAIBLES')return $('reallocationLow')?.checked!==false;
  return false;
}
function discipleCanonicalSlot(value){
  const k=compactKey(value).replace(/MODS?$/,'');
  return ({SQUARE:'SQUARE',TRANSMITTER:'SQUARE',ARROW:'ARROW',RECEIVER:'ARROW',DIAMOND:'DIAMOND',PROCESSOR:'DIAMOND',TRIANGLE:'TRIANGLE','HOLOARRAY':'TRIANGLE',CIRCLE:'CIRCLE','DATABUS':'CIRCLE',CROSS:'CROSS',MULTIPLEXER:'CROSS',
    '1':'SQUARE','2':'SQUARE','3':'ARROW','4':'DIAMOND','5':'TRIANGLE','6':'CIRCLE','7':'CROSS'})[k]||k;
}
function discipleCanonicalStat(value){
  let k=compactKey(value);
  k=k.replace(/PERCENT|PCT|PERCENTAGE/g,'');
  return ({SPEED:'SPEED',OFFENSE:'OFFENSE',OFFENSEPERCENT:'OFFENSE',DEFENSE:'DEFENSE',DEFENSEPERCENT:'DEFENSE',HEALTH:'HEALTH',HEALTHPERCENT:'HEALTH',PROTECTION:'PROTECTION',PROTECTIONPERCENT:'PROTECTION',POTENCY:'POTENCY',TENACITY:'TENACITY',CRITICALCHANCE:'CRITICALCHANCE',CRITICCHANCE:'CRITICALCHANCE',CRITCHANCE:'CRITICALCHANCE',CRITICALDAMAGE:'CRITICALDAMAGE',CRITDAMAGE:'CRITICALDAMAGE',CRITICALAVOIDANCE:'CRITICALAVOIDANCE'})[k]||k;
}
function discipleCanonicalSet(value){
  let k=compactKey(value);
  k=k.replace(/MODSET$/,'').replace(/SET$/,'');
  return ({'1':'HEALTH','2':'OFFENSE','3':'DEFENSE','4':'SPEED','5':'CRITICALCHANCE','6':'CRITICALDAMAGE','7':'POTENCY','8':'TENACITY',
    HEALTH:'HEALTH',OFFENSE:'OFFENSE',DEFENSE:'DEFENSE',SPEED:'SPEED',CRITCHANCE:'CRITICALCHANCE',CRITICALCHANCE:'CRITICALCHANCE',CRITDAMAGE:'CRITICALDAMAGE',CRITICALDAMAGE:'CRITICALDAMAGE',POTENCY:'POTENCY',TENACITY:'TENACITY'})[k]||k;
}
function discipleModKeys(m){
  return {slot:discipleCanonicalSlot(m?.slot),set:discipleCanonicalSet(m?.set_name),primary:discipleCanonicalStat(m?.primary_stat)};
}
function reallocationPrimaryMatches(selected,candidate){
  const a=discipleModKeys(selected).primary, b=discipleModKeys(candidate).primary;
  return !!a&&!!b&&a===b;
}
function reallocationCandidateSecondary(candidate,secondaryKey){
  const target=discipleCanonicalStat(secondaryKey);
  for(let i=1;i<=4;i++){
    const stat=candidate?.[`secondary_${i}_stat`];
    if(stat&&discipleCanonicalStat(secondaryDisplayName(stat))===target)return {value:Number(candidate[`secondary_${i}_value`]||0),stat:secondaryDisplayName(stat)};
  }
  return null;
}
function reallocationSourceRows(selected){
  const rows=[];
  const selectedId=String(selected?.game_id||selected?.id||'');
  const selectedOwner=modOwnerKey(selected);
  const selectedKeys=discipleModKeys(selected);
  if(!selectedKeys.slot||!selectedKeys.set||!selectedKeys.primary)return rows;

  // One-pass owner index. This is both faster and safer than rebuilding
  // getCharacterMods(character) for every character and every search.
  const normalizedMods=mods.map(raw=>normalizeModForDisplay(raw));
  const ownerBuckets=new Map();
  for(const m of normalizedMods){
    const owner=modOwnerKey(m);
    if(!owner)continue;
    const bucket=ownerBuckets.get(owner)||[];
    bucket.push(m);
    ownerBuckets.set(owner,bucket);
  }

  const characterByKey=new Map();
  const allowedOwners=new Map();
  for(const c of rosterCharacters){
    const variants=[characterKey(c),compactKey(c?.name),compactKey(c?.baseId),compactKey(c?.base_id),compactKey(c?.characterId),compactKey(c?.character_id)].filter(Boolean);
    const unique=[...new Set(variants)];
    const cm=[];
    for(const [owner,bucket] of ownerBuckets){
      if(unique.some(k=>owner===k || owner.includes(k) || k.includes(owner)))cm.push(...bucket);
    }
    const ck=characterKey(c);
    characterByKey.set(ck,c);
    const st=v176ModStatus(cm);
    if(reallocationStatusAllowed(st.status))allowedOwners.set(ck,st);
  }

  for(const m of normalizedMods){
    const id=String(m.game_id||m.id||'');
    if(selectedId&&id===selectedId)continue;
    const keys=discipleModKeys(m);
    if(keys.slot!==selectedKeys.slot || keys.set!==selectedKeys.set || keys.primary!==selectedKeys.primary)continue;
    const owner=modOwnerKey(m);
    if(!owner)continue;
    let ownerKey='';
    for(const [ck,c] of characterByKey){
      const variants=[ck,compactKey(c?.name),compactKey(c?.baseId),compactKey(c?.base_id),compactKey(c?.characterId),compactKey(c?.character_id)].filter(Boolean);
      if(variants.some(k=>owner===k || owner.includes(k) || k.includes(owner))){ownerKey=ck;break;}
    }
    if(!ownerKey || (selectedOwner && owner===selectedOwner))continue;
    const st=allowedOwners.get(ownerKey);
    if(!st)continue;
    rows.push({character:characterByKey.get(ownerKey),mod:m,status:st.status,class:st.class,speed:modTotalSpeed(m)});
  }
  return rows;
}
function renderReallocationResults(){
  const box=$('reallocationResults');if(!box)return;
  try {
  const selected=selectedReallocationMod();
  if(!selected){box.innerHTML='<div class="empty">Sélectionnez d’abord le mod à remplacer.</div>';return;}
  const secondaryValue=$('reallocationSecondary')?.value||'';
  const secondaryKey=discipleCanonicalStat(secondaryValue);
  if(!secondaryKey){box.innerHTML='<div class="empty">Choisissez une seule secondaire recherchée.</div>';return;}
  const selectedKeys=discipleModKeys(selected);
  const sourceRows=reallocationSourceRows(selected), rows=[];
  for(const r of sourceRows){const match=reallocationCandidateSecondary(r.mod,secondaryKey);if(match)rows.push({...r,value:match.value});}
  rows.sort((a,b)=>b.speed-a.speed||b.value-a.value||String(a.character?.name||'').localeCompare(String(b.character?.name||''),'fr'));
  const scope=['INCOMPLETS','TRÈS FAIBLES','FAIBLES'].filter(x=>x==='INCOMPLETS'?$('reallocationIncomplete')?.checked!==false:x==='TRÈS FAIBLES'?$('reallocationVeryLow')?.checked!==false:$('reallocationLow')?.checked!==false).join(' + ')||'AUCUNE SOURCE';
  const reference=`${selectedKeys.slot} · ${selectedKeys.set} · ${selectedKeys.primary}`;
  const topRows=rows.slice(0,5);
  if(!topRows.length){
    box.innerHTML=`<div class="disciple-result-summary"><div><span>PÉRIMÈTRE</span><b>${esc(scope)}</b><small>mods des personnages ciblés</small></div><div><span>RÉFÉRENCE CONSERVÉE</span><b>${esc(reference)}</b><small>slot · set · primaire</small></div><div><span>COMPATIBLES</span><b>0</b><small>aucune secondaire ${esc(secondaryDisplayName(secondaryValue))}</small></div></div><div class="disciple-no-result disciple-quest-result"><b>LANCEZ-VOUS DANS LA QUÊTE DE CE MOD</b><span>Aucun mod du roster ne correspond à <strong>${esc(selectedKeys.slot)}</strong> + <strong>${esc(selectedKeys.set)}</strong> + <strong>${esc(selectedKeys.primary)}</strong> avec la secondaire <strong>${esc(secondaryDisplayName(secondaryValue))}</strong>.</span><small>Recherche limitée aux mods incomplets, très faibles et faibles des autres personnages.</small></div>`;return;
  }
  box.innerHTML=`<div class="disciple-result-summary"><div><span>RÉFÉRENCE CONSERVÉE</span><b>${esc(reference)}</b><small>slot · set · primaire</small></div><div><span>ARSENAL COMPATIBLE</span><b>${sourceRows.length}</b><small>mod(s)</small></div><div><span>OPTIONS</span><b>${topRows.length}</b><small>maximum 5</small></div><div><span>SECONDAIRE</span><b>${rows.length}</b><small>candidat(s)</small></div></div><div class="disciple-candidate-list">${topRows.map((r,i)=>{const m=r.mod,ownerName=String(r.character?.name||r.character?.baseId||m.character||'Libre'),ownerPortrait=disciplePortraitHtml(r.character||{name:ownerName}),other=[];for(let j=1;j<=4;j++){const stat=m[`secondary_${j}_stat`];if(stat&&discipleCanonicalStat(secondaryDisplayName(stat))!==secondaryKey)other.push(`${secondaryDisplayName(stat)} ${num(m[`secondary_${j}_value`],1)}`);}return `<article class="disciple-candidate"><div class="disciple-candidate-rank"><span>OPTION</span><b>${String(i+1).padStart(2,'0')}</b></div><div class="disciple-candidate-owner">${ownerPortrait}<div><strong>${esc(ownerName)}</strong><span class="audit-badge ${r.class}">${esc(r.status)}</span></div></div><div class="disciple-candidate-mod"><div class="disciple-candidate-icon">${modIconHtml(m,'54')}</div><div><span>${esc(m.slot||'Mod')} · ${esc(m.set_name||'—')}</span><strong>${esc(m.primary_stat||'—')} ${num(m.primary_value,1)}</strong><small>${esc(other.join(' · ')||'Aucune autre secondaire')}</small></div></div><div class="disciple-candidate-speed"><span>VITESSE</span><b>${num(r.speed)}</b><small>secondaire totale</small></div><div class="disciple-candidate-match"><span>${esc(secondaryDisplayName(secondaryValue))}</span><b>+${num(r.value,1)}</b><small>secondaire recherchée</small></div></article>`;}).join('')}</div>`;
  } catch (err) {
    console.error('DISCIPLE search error', err);
    box.innerHTML=`<div class="disciple-no-result disciple-quest-result"><b>LANCEZ-VOUS DANS LA QUÊTE DE CE MOD</b><span>La recherche n’a pas pu produire de proposition. Le moteur Disciple a rencontré une erreur de recherche.</span><small>${esc(err?.message||String(err))}</small></div>`;
  }
}

function renderReallocationPanel(){
  // IMPORTANT: rebuilding the Disciple panel must NEVER reset the user's
  // current search. Mobile browsers can cause the analysis view to be rebuilt
  // after a select change; the previous implementation then erased the
  // secondary and the results immediately after displaying them.
  const previousSecondary = $('reallocationSecondary')?.value || '';
  renderReallocationSpeedTierChoices();
  renderReallocationCharacterChoices();
  renderReallocationModSelector();
  const selected=selectedReallocationMod();
  renderReallocationSelectionVisual(selected);
  renderReallocationSecondaryOptions(previousSecondary);
  renderReallocationResults();
}
function openReallocation(index){
  const n=Number(index);
  if(!Number.isFinite(n) || !mods[n]) return;
  setReallocationMod(n);
  showPage('mods-analysis');
  requestAnimationFrame(()=>{
    setAnalysisTab('reallocation');
    const target=$('reallocationModSelect');
    target?.scrollIntoView({behavior:'smooth',block:'start'});
  });
}

function renderModsAnalysis(){
  // DISCIPLE is intentionally a dedicated mod-by-mod decision space.
  // The legacy analysis panels remain in the codebase for compatibility, but
  // this phase opens directly on the single-secondary reallocation workflow.
  buildFactionMap(); prepareV18Filters();
  setAnalysisTab('reallocation');
}

