# Code City — Project Context

Use this file to onboard a new Claude session or pick up where we left off.

---

## Origin

Inspired by the **pokemon-pets** VS Code extension (`anasfiguigui.pokemon-pets-1.0.0`)
— a fully-featured idle pet game in the VS Code sidebar. While modding that extension
the concept emerged: build something coding-themed where the game feeds off actual dev
activity.

---

## Core Concept

> An idle dev civilization where your pets evolve based on *how* you code,
> and then work to build your city.

### Feed Duality

| Source | Feed Type | How earned |
|---|---|---|
| LLM / autocomplete accepted | 🌱 Normal feed | Every 200 LLM chars = 1 normal feed |
| Manual typing | ⭐ Premium feed | Every 100 manual chars = 1 premium feed |

LLM feed is easy — fuels standard growth. Premium feed is scarce — unlocks rare
evolutions and special abilities. The tension is intentional.

### Detection Heuristic

`vscode.workspace.onDidChangeTextDocument` classifies edits by size:
- Insert **> 8 chars** in one event → LLM/autocomplete
- Insert **≤ 8 chars** → manual typing

Configurable via `code-city.llmInsertThreshold`.

---

## Pets

### Species & Evolution Paths

Each pet has two evolution paths branching at stage 1, determined by which feed
type dominates:

| Pet | LLM Path | Manual Path | Worker Role | Normal cost | Premium cost |
|---|---|---|---|---|---|
| 🔥 Ember | Ember → Inferno → Titan | Ember → Phoenix → **Seraph** | Builder | 60 | 30 |
| 🌱 Sprout | Sprout → Grove → Forest | Sprout → Sage → **Oracle** | Farmer | 50 | 25 |
| 💧 Droplet | Droplet → Stream → Torrent | Droplet → Tide → **Leviathan** | Miner | 40 | 20 |
| ⚡ Spark | Spark → Current → Grid | Spark → Thunder → **Storm** | Researcher | 70 | 35 |

Hatching costs **20 normal feed** (`HATCH_COST` in `game-data.ts`).

Evolution rules:
- **LLM path** — only `normalFedTotal` checked against threshold
- **Manual path** — only `premiumFedTotal` checked against threshold
- **Undecided** — returns early until one threshold is hit first
- **Stage 1 → 2** — additionally requires 5 rare materials (consumed on evolve)
- Library discount reduces thresholds up to −50%

### Special Abilities (Manual Path, Final Stage)

| Pet | Ability | Target | Mult | Duration |
|---|---|---|---|---|
| ✨ Seraph | Divine Craft — Premium feed gives 2× XP | `xp` | ×2 | 10 min |
| 🍀 Oracle | Foresight — Next evolution costs 50% less | `evolution` | ×0.5 | 5 min |
| 🐋 Leviathan | Deep Work — Typing streak timer doubled | `streak` | ×2 | 10 min |
| 🌪️ Storm | Surge — All buildings produce 3× | `production` | ×3 | 5 min |

Ability flow: evolve to stage 2 via manual path → `specialAbilityUnlocked = true` →
user clicks "⚡ Use Ability" → `useAbility(petId)` pushes an `ActiveAbility` entry
with `petId`, `target`, `multiplier`, `expiresAt` → ability consumed (one-time).
Oracle is also removed from `activeAbilities` after the first evolution it enables.

---

## Boost Triggers

| Trigger | Effect |
|---|---|
| **Git commit** | +10 City XP (VS Code git extension API) |
| **5+ minute typing streak** | Bonus premium feed (1 per 5 min) |
| **Daily first open** | Login bonus: 5 + streak_days normal, 2 + streak/3 premium |

---

## City

### Buildings

| Building | Emoji | Unlock | Cost | Produces / Effect |
|---|---|---|---|---|
| Farm | 🌾 | 0 XP (starts with one) | free | 2 normal feed / min |
| Workshop | 🔨 | 50 XP | 1,000 feed | 1 City XP / min |
| Library | 📚 | 150 XP | 5,000 feed | 0.5 City XP / min + −2% evolution cost/level (max −50%) |
| Mine | ⛏️ | 400 XP | 15,000 feed | rare materials / min |
| Tower | 🗼 | 1000 XP | 50,000 feed | +10% multiplier on all building output per level |

All buildings are multiplicatively boosted by:
- `getTowerMultiplier()` = `1 + totalTowerLevel × 0.1`
- Active Storm ability (×3 production)
- Active Seraph ability (×2 XP output for Workshop/Library)

### Worker Assignment

Pets assigned to a building boost its output:
- No worker: 1×
- Stage 1 pet: 1.5×
- Stage 2 pet: 2×

### Upgrade Gates

`CityManager.upgradeBuilding` enforces:
- Max level 50 (`MAX_BUILDING_LEVEL`)
- Feed cost = `Math.max(50, type.cost) × level × 2` (prevents free Farm upgrades)
- XP gate = `type.unlockXP × level` City XP required

### City Level Thresholds

XP gates: 0, 50, 200, 500, 1200, 3000

---

## Pasture Canvas & Sprites

### Layout

The sidebar is a full-screen canvas (`#pasture-canvas`) with everything else layered
on top:
- Floating resource bar (top, glassmorphism)
- `☰ Menu` pill button (bottom centre)
- Bottom-sheet drawer (slides up, max `min(80vh, 500px)`) with Pets / City / Stats / Dev tabs

### Sprites

Each species has one PNG at `media/sprites/pets/{speciesId}.png` (786×326), generated
from `messy_1.png` (CC0, OpenGameArt) via hue rotation:

| Species | Hue shift |
|---|---|
| ember | 0° (source colours) |
| sprout | +90° |
| droplet | +165° |
| spark | +220° |

Regenerate: `node scripts/generate-pet-sprites.js`

Building sprites: `media/sprites/buildings/{typeId}.png` (32×32 programmatic PNGs).
Regenerate: `node scripts/generate-sprites.js`

### Animation Engine (`media/pasture.js`)

Runs at 20 FPS via `requestAnimationFrame`. Stops automatically when no state has
been received yet; always-on once the first state arrives.

`PET_FRAMES` defines two atlases within the species PNG:

```
baby  — stages 0 & 1 (blob sprite)
  idle:   4 frames, x=0–260,   y=4,   w=65, h=95
  action: 4 frames, x=258–516, y=4,   w=65, h=95
  walk:   4 frames, x=550–786, y=4,   w=59, h=53  (faces LEFT in sheet)

final — stage 2 (humanoid sprite)
  idle:   4 frames, x=0–260,   y=115, w=65, h=121
  action: 6 frames (variable width/height), bottom-anchored fire burst
    intro frames 0–1, loop frames 2–5 (actionLoopStart = 2)
  walk:   7 frames, x=5–302,   y=255, w=42, h=57  (faces LEFT in sheet)
```

Walk facing: `walkFacesLeft: true` on both atlases — flip ctx when `facing === 1`
(moving right).

Scale by stage: 1× (baby), 1.5× (mid), 2× (final).

**⚠ Known issue**: idle and action frame coordinates are not verified against the
actual sprite sheet sub-regions. Animations play but may show wrong frames. Needs
visual review and coordinate fixes in a future pass.

### `PetSprite` state machine

States cycle: `idle → action → walk → idle …`
- Walk: picks random target within canvas bounds; flips facing on new walk
- Action: plays intro then loops; state timer ends it
- Frame timer fires every `FRAME_MS` (50ms); action respects `actionLoopStart`

Label (pet name) drawn 2px below the sprite bottom edge.

---

## Technical Architecture

```
d:\oo\code-city\
├── src/
│   ├── extension.ts              # Entry point — wires everything, git tracking
│   │                             # Construction order: saveManager → cityManager
│   │                             #   → petManager(save, city) → feedTracker(save, city, cb)
│   ├── game/
│   │   ├── game-data.ts          # Static data: species, buildings, SpecialAbility records
│   │   ├── save-manager.ts       # JSON save/load, 500ms debounced writes
│   │   │                         # defaultSave: normalFeed=50, premiumFeed=5
│   │   ├── feed-tracker.ts       # Text change listener, streak timer, daily bonus
│   │   │                         # Leviathan ability doubles getStreakIdleMs()
│   │   ├── pet-manager.ts        # Hatch, feed, evolve, useAbility, forceResetAbility
│   │   └── city-manager.ts       # Build, upgrade, tick
│   │                             # getTowerMultiplier, getTotalLibraryDiscount,
│   │                             # getActiveMultiplier, getUnlockedBuildings
│   └── webview/
│       └── webview-provider.ts   # Sidebar webview, message routing
│                                 # getSpriteUris() → { pets: {speciesId→uri},
│                                 #                     buildings: {typeId→uri} }
│                                 # getHtml() injects {{styleUri}}, {{uiUri}},
│                                 #   {{pastureUri}}, {{cspSource}}
│                                 # localResourceRoots covers all of media/
│                                 # Hot reload: fs.watch(media/, recursive) in dev mode
├── media/
│   ├── main.html                 # HTML skeleton + lean bootstrap (~180 lines)
│   │                             # Layout: full-screen pasture canvas, floating
│   │                             #   resource bar, ☰ Menu pill, bottom-sheet drawer
│   │                             # Loads style.css, ui.js, pasture.js externally
│   ├── style.css                 # All CSS: variables, layout, components
│   ├── ui.js                     # All render functions + postMessage wrappers
│   │                             # renderResources, renderPets, renderCity,
│   │                             # renderStats, renderDev
│   │                             # Hatch flow: openHatch…confirmHatch
│   ├── pasture.js                # Canvas animation engine (always-on, 20 FPS)
│   │                             # PET_FRAMES atlas, PetSprite state machine
│   │                             # startPasture/stopPasture/syncPastureSprites
│   ├── sprites/
│   │   ├── messy_1.png           # CC0 source sheet (OpenGameArt), 786×326
│   │   ├── pets/                 # {speciesId}.png — hue-rotated per species
│   │   └── buildings/            # {typeId}.png — 32×32 programmatic PNGs
│   └── icon.svg                  # Extension icon
├── scripts/
│   ├── generate-sprites.js       # Generates 32×32 building PNGs (pure Node.js)
│   └── generate-pet-sprites.js   # Generates per-species pet PNGs from messy_1.png
│                                  # Hue rotation: RGB → HSL → rotate → RGB
├── test/
│   ├── setup.js                  # ts-node + vscode mock
│   ├── vscode.mock.ts            # Minimal vscode API stub
│   └── game.test.ts              # 43 unit tests
├── package.json                  # VS Code extension manifest
└── tsconfig.json
```

### Save File

VS Code managed: `context.globalStorageUri.fsPath/save.json`

Windows: `C:\Users\<user>\AppData\Roaming\Code\User\globalStorage\jjccy.code-city\save.json`

### Save Schema (v1)

Default: `normalFeed: 50, premiumFeed: 5` — enough to hatch 2 pets immediately.

```json
{
  "version": 1,
  "resources": { "normalFeed": 50, "premiumFeed": 5, "cityXP": 0, "rareMaterials": 0 },
  "pets": [{
    "id": "abc123", "speciesId": "ember", "name": "Blaze",
    "stage": 0, "path": "undecided",
    "normalFedTotal": 0, "premiumFedTotal": 0,
    "assignedTo": null, "specialAbilityUnlocked": false
  }],
  "city": { "level": 1, "buildings": [{ "id": "farm-1", "typeId": "farm", "level": 1 }] },
  "stats": {
    "totalManualChars": 0, "totalLLMChars": 0, "totalCommits": 0,
    "streakDays": 0, "lastActiveDate": "", "longestTypingStreak": 0
  },
  "activeAbilities": [],
  "lastTickAt": 1712345678000
}
```

---

## Configuration

```json
"code-city.llmInsertThreshold":  8,
"code-city.charsPerNormalFeed":  200,
"code-city.charsPerPremiumFeed": 100
```

---

## Dev Mode

Enabled when running via F5 (`ExtensionMode.Development`) or
`"code-city.devMode": true` in settings.

- **Hot reload**: `fs.watch(media/, { recursive: true })` reloads the webview
  on any change — no manual Reload Window needed
- **Dev tab**: 4th tab in the drawer (hidden in production)
  - Resource editors (set/add normalFeed, premiumFeed, cityXP, rareMaterials)
  - Force Tick, Force Evolve (per pet), Reset Save
  - "↺ Ability" button calls `forceResetAbility(petId)` for testing

All dev messages are gated server-side (`if (!this.devMode) break`).

---

## Testing

```bash
npm test   # 43 unit tests (Mocha + ts-node)
```

Coverage:
- `SaveManager` — default save, load/flush cycle, reset
- `PetManager` — feed deduction, LLM/manual path evolution, stage-2 gate, max-stage guard
- `CityManager` — tick production, offline cap, upgrade level cap, XP gate, cost floor
- `FeedTracker` — daily bonus, streak increment/reset, LLM vs manual feed conversion

---

## Known Gaps / Future Work

- [ ] **Pasture animation: idle & action frames** — `PET_FRAMES` coordinates in
      `pasture.js` have not been visually verified against `messy_1.png`. Idle and
      action animations play but may be pulling from wrong sub-regions of the sheet.
      Needs side-by-side review of frame coords vs actual pixel positions.

- [ ] **Worker assign UI** — currently routes through VS Code QuickPick. Could be
      drag-and-drop in the webview.

- [ ] **Sound effects** — VS Code webview can play Audio.

- [ ] **More species** — only 4 pets. Easy to add more in `game-data.ts` +
      `generate-pet-sprites.js`.

- [ ] **Rare materials cosmetics** — currently only gates final evolution. Could
      unlock building skins or special workers.

- [ ] **Ability recharge** — abilities are one-time per evolution. Could recharge
      on a new commit milestone.

- [ ] **Publish to Marketplace** — `vsce package` then `vsce publish`.

---

## GitHub

Repo: https://github.com/jjccy/code-city  
Publisher: jjccy
