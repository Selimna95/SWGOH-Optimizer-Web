function showPage(page){
  document.body.dataset.page=page;
  document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('active',x.dataset.page===page));
  document.querySelectorAll('.page').forEach(x=>x.classList.toggle('active',x.id===page));
  if(page==='mods-analysis') renderModsAnalysis();
  if(page==='top-changes') renderHolocronTopChanges();
  if(page==='sithari') renderSithariNexus();
}
['optimizerIncomplete','optimizerVeryLow','optimizerLow','optimizerMedium','optimizerAllRoster'].forEach(id=>$(id)?.addEventListener('change',()=>{
  const all=$('optimizerAllRoster')?.checked===true;
  ['optimizerIncomplete','optimizerVeryLow','optimizerLow','optimizerMedium'].forEach(x=>{const el=$(x);if(el)el.disabled=all;});
  updateCharacterInfo();
}));

document.querySelectorAll('[data-speed-tier]').forEach(btn=>btn.addEventListener('click',()=>setReallocationSpeedTier(btn.dataset.speedTier)));
$('reallocationCharacterChoices')?.addEventListener('click',event=>{
  const btn=event.target.closest('[data-character-key]');
  if(btn)setReallocationCharacter(btn.dataset.characterKey);
});

$('reallocationModSelect')?.addEventListener('change',()=>{
  const n=Number($('reallocationModSelect')?.value);
  if(Number.isFinite(n) && mods[n]) setReallocationMod(n);
  else { reallocationSelectedModIndex=null; renderReallocationSelectionVisual(null); renderReallocationSecondaryOptions(''); renderReallocationResults(); }
});
$('reallocationSecondary')?.addEventListener('change',renderReallocationResults);
$('reallocationIncomplete')?.addEventListener('change',renderReallocationResults);
$('reallocationVeryLow')?.addEventListener('change',renderReallocationResults);
$('reallocationLow')?.addEventListener('change',renderReallocationResults);
$('runReallocation')?.addEventListener('click',renderReallocationResults);
$('clearData').addEventListener('click',()=>{currentData=null;mods=[];modFiltersReady=false;const mf=$('modFilters'),ms=$('modSummary');if(mf)mf.hidden=true;if(ms)ms.hidden=true;rosterCharacters=[];rosterShips=[];factionMap={};analysisSelectedCharacter='';analysisFaction='';analysisSide='ALL';analysisStatus='TOUS';analysisAuditSpeed='TOUS';analysisAuditSort='priority';updateRosterCounts([],[]);fillCharacters([]);if($('v18DashboardSpeed'))$('v18DashboardSpeed').innerHTML='';$('results').textContent='Chargez d’abord vos données.';$('dataInfo').textContent='Aucune donnée.';if($('playerName'))$('playerName').textContent='Profil non chargé';if($('playerAlly'))$('playerAlly').textContent='—';if($('heroPlayerName'))$('heroPlayerName').textContent='Profil non chargé';if($('heroPlayerAlly'))$('heroPlayerAlly').textContent='—';if($('heroProfileState'))$('heroProfileState').textContent='EN ATTENTE';$('dataTableMeta').textContent='Aucune donnée.';$('dataTable').innerHTML='<div class="empty">Chargez un profil pour afficher les données.</div>';$('log').textContent='Données effacées.';renderSithariNexus();});

document.querySelectorAll('.analysis-tab').forEach(btn=>btn.addEventListener('click',()=>setAnalysisTab(btn.dataset.analysisTab)));
$('analysisFaction')?.addEventListener('change',()=>{analysisFaction=$('analysisFaction').value;analysisSelectedCharacter='';renderSelectionPanel();});
$('analysisSide')?.addEventListener('change',()=>{analysisSide=$('analysisSide').value;renderSelectionPanel();});
$('analysisStatus')?.addEventListener('change',()=>{analysisStatus=$('analysisStatus').value;renderSelectionPanel();});
$('analysisAuditSpeed')?.addEventListener('change',()=>{analysisAuditSpeed=$('analysisAuditSpeed').value;renderSelectionPanel();});
$('analysisAuditSort')?.addEventListener('change',()=>{analysisAuditSort=$('analysisAuditSort').value;renderSelectionPanel();});
$('analysisCharacter')?.addEventListener('change',()=>{analysisSelectedCharacter=$('analysisCharacter').value;setAnalysisTab('report');});
$('analysisMode')?.addEventListener('change',()=>{analysisMode=$('analysisMode').value;renderSelectionPanel();});
['analysisSearch','analysisSetFilter','analysisSlotFilter','analysisPrimaryFilter','analysisSecondaryFilter','analysisSpeedFilter'].forEach(id=>$(id)?.addEventListener('input',renderInventory));
$('closeModDetail')?.addEventListener('click',closeModDetail);
$('modDetailModal')?.addEventListener('click',e=>{if(e.target.id==='modDetailModal')closeModDetail();});

function navigateToPageFromElement(btn){
  if(!btn)return;
  const page=String(btn.dataset.page||'').trim();
  if(!page || !document.getElementById(page))return;
  showPage(page);
  if(page==='data')renderDataTable();
}

// Navigation principale + boutons du Command Deck.
// Un seul gestionnaire pour éviter les doubles clics et les routages contradictoires.
document.addEventListener('click',e=>{
  const btn=e.target.closest?.('[data-page]');
  if(!btn)return;
  e.preventDefault();
  e.stopPropagation();
  navigateToPageFromElement(btn);
});

document.getElementById('sithariAccess')?.addEventListener('click',()=>showPage('sithari'));
$('sithariFaction')?.addEventListener('change',e=>{sithariFaction=e.target.value;sithariRenderAll();});
$('sithariCharacterSearch')?.addEventListener('input',e=>{sithariSearch=e.target.value||'';sithariRenderSelectors();});
$('sithariClearSelection')?.addEventListener('click',()=>{sithariSelectedKeys=[];sithariActiveKey='';sithariRenderAll();});
renderGalacticPower();
renderSithariNexus();
boot();


// DISCIPLE ENGINE SAFETY NET V185
// Direct handlers ensure the result area is always updated even if another
// legacy listener was attached earlier or a dynamically rebuilt panel replaced
// the original element. Select elements fire `change` on committed choices.
function discipleForceSearch(){
  try { renderReallocationResults(); }
  catch(err){
    const box=$('reallocationResults');
    if(box)box.innerHTML=`<div class="disciple-no-result disciple-quest-result"><b>LANCEZ-VOUS DANS LA QUÊTE DE CE MOD</b><span>Impossible d’exécuter la recherche Disciple.</span><small>${esc(err?.message||String(err))}</small></div>`;
  }
}
function discipleBindLiveControls(){
  const run=$('runReallocation'); if(run)run.onclick=discipleForceSearch;
  const sec=$('reallocationSecondary'); if(sec)sec.onchange=discipleForceSearch;
  const ids=['reallocationIncomplete','reallocationVeryLow','reallocationLow'];
  ids.forEach(id=>{const el=$(id);if(el)el.onchange=discipleForceSearch;});
}
discipleBindLiveControls();
