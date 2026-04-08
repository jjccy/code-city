// ── UI Rendering & Game Actions ─────────────────────────────────────────────
// Reads globals `state` and `vscode` set by the main.html bootstrap script.

// ── Resources ────────────────────────────────────────────────────────────────

function renderResources() {
  document.getElementById('r-normal').textContent  = state.resources.normalFeed;
  document.getElementById('r-premium').textContent = state.resources.premiumFeed;
  document.getElementById('r-xp').textContent      = state.resources.cityXP;
  document.getElementById('r-rare').textContent    = state.resources.rareMaterials.toFixed(1);
}

// ── Pets ─────────────────────────────────────────────────────────────────────

function renderPets() {
  const HATCH_COST = 20;
  const canHatch   = state.resources.normalFeed >= HATCH_COST;
  const hatchBtn   = document.getElementById('btn-add-pet');
  hatchBtn.disabled    = !canHatch;
  hatchBtn.textContent = `+ Hatch New Pet (🌱 ${HATCH_COST})`;
  document.getElementById('hatch-cost-hint').textContent =
    canHatch ? '' : `Need ${HATCH_COST} normal feed to hatch`;

  const list = document.getElementById('pet-list');
  if (!state.pets.length) {
    list.innerHTML = '<div class="empty-state">No pets yet.<br>Hatch one to get started!</div>';
    return;
  }

  list.innerHTML = state.pets.map(pet => {
    const species    = state.speciesList.find(s => s.id === pet.speciesId);
    const stageLabel = ['Baby', 'Evolved', 'Final'][pet.stage];
    const pathLabel  = pet.path === 'undecided' ? '' :
      pet.path === 'manual'
        ? '<span class="pet-path-manual">⭐ Manual path</span>'
        : '<span class="pet-path-llm">🤖 LLM path</span>';

    const normalMax  = species.normalFeedCost  * (pet.stage + 1);
    const premiumMax = species.premiumFeedCost * (pet.stage + 1);
    const normalPct  = Math.min(100, Math.round(pet.normalFedTotal  / normalMax  * 100));
    const premiumPct = Math.min(100, Math.round(pet.premiumFedTotal / premiumMax * 100));

    const assigned     = state.city.buildings.find(b => pet.assignedTo === b.id);
    const assignedLabel = assigned
      ? `🔨 Working at ${state.buildingTypes.find(t => t.id === assigned.typeId)?.name}`
      : '';

    // Feed button gate logic
    const isMax           = pet.stage >= 2;
    const normalBlocked   = pet.path === 'manual';
    const premiumBlocked  = pet.path === 'llm';
    const normalDisabled  = isMax || normalBlocked  || normalPct  >= 100 || state.resources.normalFeed  < 1;
    const premiumDisabled = isMax || premiumBlocked || premiumPct >= 100 || state.resources.premiumFeed < 1;

    // Special ability
    const isManualFinal = pet.stage >= 2 && pet.path === 'manual';
    const formName      = pet.form.name.toLowerCase();
    const abilityDef    = isManualFinal && state.specialAbilities
      ? state.specialAbilities[formName] : null;

    let abilityUI = '';
    if (abilityDef) {
      const activeAbility = (state.activeAbilities || []).find(
        a => a.petId === pet.id && a.expiresAt > Date.now()
      );
      abilityUI = `<div style="font-size:10px;color:var(--mauve);margin-top:2px">${abilityDef.description}</div>`;
      if (pet.specialAbilityUnlocked) {
        abilityUI += `<button onclick="useAbility('${pet.id}')" style="margin-top:4px;border-color:var(--mauve);color:var(--mauve)">⚡ Use Ability</button>`;
      } else if (activeAbility) {
        const remSec = Math.ceil((activeAbility.expiresAt - Date.now()) / 1000);
        abilityUI += `<div style="font-size:10px;color:var(--yellow);margin-top:2px">⏱️ Active: ${formatDuration(remSec)} remaining</div>`;
      } else {
        abilityUI += `<div style="font-size:10px;color:var(--muted);margin-top:2px">✓ Ability used</div>`;
      }
    }

    return `
      <div class="pet-card">
        <div class="pet-header">
          <div class="pet-emoji">${pet.form.emoji}</div>
          <div class="pet-info">
            <div class="pet-name">${pet.name}</div>
            <div class="pet-stage">${pet.form.name} · ${stageLabel} ${pathLabel}</div>
            ${assignedLabel ? `<div style="font-size:10px;color:var(--yellow)">${assignedLabel}</div>` : ''}
            ${abilityUI}
          </div>
        </div>
        ${isMax ? '<div style="font-size:10px;color:var(--yellow);margin-bottom:4px">🏆 Max stage — no further evolution</div>' : ''}
        ${pet.stage === 1 ? `<div style="font-size:10px;color:${state.resources.rareMaterials >= 5 ? 'var(--green)' : 'var(--red)'};margin-bottom:4px">💎 Final evolution needs 5 rare mats (have ${state.resources.rareMaterials.toFixed(1)})</div>` : ''}
        <div class="feed-bar">
          <span style="font-size:10px;white-space:nowrap">🌱 ${normalPct}%</span>
          <div class="progress-wrap"><div class="progress-fill fill-normal" style="width:${normalPct}%"></div></div>
        </div>
        <div class="feed-bar">
          <span style="font-size:10px;white-space:nowrap">⭐ ${premiumPct}%</span>
          <div class="progress-wrap"><div class="progress-fill fill-premium" style="width:${premiumPct}%"></div></div>
        </div>
        <div class="pet-actions">
          <button onclick="feed('${pet.id}','normal')" ${normalDisabled ? 'disabled' : ''}>
            🌱 Feed (${state.resources.normalFeed})
          </button>
          <button onclick="feed('${pet.id}','premium')" ${premiumDisabled ? 'disabled' : ''}>
            ⭐ Premium (${state.resources.premiumFeed})
          </button>
          <button onclick="showAssign('${pet.id}')">🏗️ Assign</button>
        </div>
      </div>`;
  }).join('');
}

// ── City ──────────────────────────────────────────────────────────────────────

function renderCity() {
  const buildingList = document.getElementById('building-list');
  const buildOptions = document.getElementById('build-options');

  const towerMult   = state.towerMultiplier ?? 1;
  const libraryDisc = state.libraryDiscount ?? 0;
  const hints = [];
  if (towerMult > 1)   { hints.push(`🗼 Tower bonus: +${Math.round((towerMult - 1) * 100)}% all output`); }
  if (libraryDisc > 0) { hints.push(`📚 Library: −${Math.round(libraryDisc * 100)}% evolution cost`); }
  document.getElementById('city-bonuses').textContent = hints.join('  ·  ');

  buildingList.innerHTML = state.city.buildings.map(b => {
    const type   = state.buildingTypes.find(t => t.id === b.typeId);
    const worker = state.pets.find(p => p.assignedTo === b.id);

    const atMax      = b.level >= 50;
    const baseCost   = Math.max(50, type.cost);
    const feedCost   = baseCost * b.level * 2;
    const xpRequired = type.unlockXP * b.level;
    const hasFood    = state.resources.normalFeed >= feedCost;
    const hasXP      = state.resources.cityXP    >= xpRequired;
    const canUpgrade = !atMax && hasFood && hasXP;

    const upgradeRow = atMax
      ? `<div style="font-size:10px;color:var(--yellow);margin-top:6px">🏆 Max Level (50)</div>`
      : `<div style="font-size:10px;color:var(--muted);margin-top:6px;margin-bottom:4px">
           Upgrade: <span style="color:${hasFood ? 'var(--green)' : 'var(--red)'}">🌱 ${feedCost}</span>
           ${xpRequired > 0 ? `· <span style="color:${hasXP ? 'var(--green)' : 'var(--red)'}">🏙️ ${xpRequired} XP</span>` : ''}
         </div>
         <button onclick="upgradeBuilding('${b.id}')" ${canUpgrade ? '' : 'disabled'}>⬆️ Upgrade</button>`;

    return `
      <div class="building-card" style="margin-bottom:6px">
        <div class="building-header">
          ${(state.spriteUris && state.spriteUris.buildings[type.id])
            ? `<img src="${state.spriteUris.buildings[type.id]}" width="28" height="28"
                   style="image-rendering:pixelated;vertical-align:middle"
                   onerror="this.style.display='none';this.nextElementSibling.style.display=''">
               <div class="building-emoji" style="display:none">${type.emoji}</div>`
            : `<div class="building-emoji">${type.emoji}</div>`
          }
          <div>
            <div class="building-name">${type.name} <span class="building-level">Lv ${b.level}</span></div>
            <div style="font-size:10px;color:var(--muted)">${type.description}</div>
          </div>
        </div>
        ${worker ? `<div class="worker-slot">${worker.form?.emoji} ${worker.name} working here</div>` : ''}
        ${upgradeRow}
      </div>`;
  }).join('');

  const buildable = state.unlockedBuildings.filter(t => t.cost > 0);
  buildOptions.innerHTML = buildable.map(t => `
    <div class="buildable-card" onclick="buildBuilding('${t.id}')">
      ${(state.spriteUris && state.spriteUris.buildings[t.id])
        ? `<img src="${state.spriteUris.buildings[t.id]}" width="28" height="28"
               style="image-rendering:pixelated"
               onerror="this.style.display='none';this.nextElementSibling.style.display=''">
           <div style="display:none">${t.emoji}</div>`
        : `<div>${t.emoji}</div>`
      }
      <div style="font-weight:bold;font-size:11px">${t.name}</div>
      <div class="buildable-cost">🌱 ${t.cost} feed · ${t.unlockXP} XP needed</div>
    </div>`).join('')
    || '<div class="empty-state" style="grid-column:1/-1">Earn more City XP to unlock buildings.</div>';
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function renderStats() {
  const s    = state.stats;
  const rows = [
    ['🔥 Manual chars typed',    s.totalManualChars.toLocaleString()],
    ['🤖 LLM chars accepted',    s.totalLLMChars.toLocaleString()],
    ['🏅 Commits',               s.totalCommits],
    ['📅 Login streak',          `${s.streakDays} days`],
    ['⚡ Longest typing streak', `${s.longestTypingStreak}s`],
    ['🏙️ City level',            state.city.level],
    ['🐾 Pets hatched',          state.pets.length],
  ];
  document.getElementById('stats-list').innerHTML =
    rows.map(([l, v]) => `<div class="stat-row"><span>${l}</span><span class="stat-val">${v}</span></div>`).join('');
}

// ── Hatch Flow ────────────────────────────────────────────────────────────────

function openHatch() {
  hatchSpeciesId = null;
  document.getElementById('btn-add-pet').style.display    = 'none';
  document.getElementById('hatch-form').style.display     = '';
  document.getElementById('hatch-species').style.display  = '';
  document.getElementById('hatch-name').style.display     = 'none';
  renderSpeciesOptions();
}

function closeHatch() {
  hatchSpeciesId = null;
  document.getElementById('hatch-form').style.display  = 'none';
  document.getElementById('btn-add-pet').style.display = '';
}

function renderSpeciesOptions() {
  if (!state) { return; }
  document.getElementById('species-options').innerHTML =
    state.speciesList.map(s => `
      <div class="species-card" onclick="pickSpecies('${s.id}')">
        <div class="species-card-emoji">${s.llmPath[0].emoji}</div>
        <div class="species-card-name">${s.baseName}</div>
        <div class="species-card-desc">${s.llmPath[0].description}</div>
      </div>`).join('');
}

function pickSpecies(speciesId) {
  hatchSpeciesId = speciesId;
  const species = state.speciesList.find(s => s.id === speciesId);
  document.getElementById('hatch-preview-emoji').textContent = species.llmPath[0].emoji;
  document.getElementById('pet-name-input').value            = species.baseName;
  document.getElementById('hatch-species').style.display     = 'none';
  document.getElementById('hatch-name').style.display        = '';
  document.getElementById('pet-name-input').focus();
  document.getElementById('pet-name-input').select();
}

function backToSpecies() {
  hatchSpeciesId = null;
  document.getElementById('hatch-name').style.display    = 'none';
  document.getElementById('hatch-species').style.display = '';
}

function confirmHatch() {
  if (!hatchSpeciesId) { return; }
  const name = document.getElementById('pet-name-input').value.trim();
  if (!name) { document.getElementById('pet-name-input').focus(); return; }
  vscode.postMessage({ type: 'addPetDirect', speciesId: hatchSpeciesId, name });
  closeHatch();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ── Game Actions ──────────────────────────────────────────────────────────────

function feed(petId, feedType)      { vscode.postMessage({ type: 'feedPet', petId, feedType }); }
function showAssign(petId)          { vscode.postMessage({ type: 'showAssign', petId, buildings: state.city.buildings.map(b => b.id) }); }
function buildBuilding(typeId)      { vscode.postMessage({ type: 'buildBuilding', typeId }); }
function upgradeBuilding(buildingId){ vscode.postMessage({ type: 'upgradeBuilding', buildingId }); }
function useAbility(petId)          { vscode.postMessage({ type: 'useAbility', petId }); }

// ── Dev ───────────────────────────────────────────────────────────────────────

function renderDev() {
  document.getElementById('dev-normalFeed').value    = state.resources.normalFeed;
  document.getElementById('dev-premiumFeed').value   = state.resources.premiumFeed;
  document.getElementById('dev-cityXP').value        = state.resources.cityXP;
  document.getElementById('dev-rareMaterials').value = state.resources.rareMaterials;

  document.getElementById('dev-pet-list').innerHTML = state.pets.map(pet => {
    const isAbilityPet = pet.stage >= 2 && pet.path === 'manual';
    return `
      <div class="dev-row">
        <span style="flex:1;font-size:11px">${pet.form.emoji} ${pet.name} (Stage ${pet.stage}${isAbilityPet ? ' · ' + (pet.specialAbilityUnlocked ? '⚡ready' : '✓used') : ''})</span>
        <button onclick="devForceEvolve('${pet.id}')" ${pet.stage >= 2 ? 'disabled' : ''}>Force Evolve</button>
        ${isAbilityPet ? `<button onclick="devResetAbility('${pet.id}')" style="border-color:var(--mauve)">↺ Ability</button>` : ''}
      </div>`;
  }).join('') || '<div style="color:var(--muted);font-size:11px;padding:4px 0">No pets</div>';
}

function devSet(key) {
  const val = parseFloat(document.getElementById('dev-' + key).value);
  if (!isNaN(val)) { vscode.postMessage({ type: 'dev:set', key, value: val }); }
}
function devAdd(key, amount)   { vscode.postMessage({ type: 'dev:add', key, amount }); }
function devTick()             { vscode.postMessage({ type: 'dev:tick' }); }
function devForceEvolve(petId) { vscode.postMessage({ type: 'dev:forceEvolve', petId }); }
function devResetAbility(petId){ vscode.postMessage({ type: 'dev:resetAbility', petId }); }
function devReset()            { vscode.postMessage({ type: 'dev:reset' }); }
