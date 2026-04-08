# Code City — Project Context & Chat History

This file captures the full design conversation, decisions made, and rationale behind
Code City. Use it to onboard future Claude sessions or pick up where we left off.

---

## Origin

The idea came from exploring the **pokemon-pets** VS Code extension
(`anasfiguigui.pokemon-pets-1.0.0`) — a fully-featured idle pet game embedded in the
VS Code sidebar. While modding that extension (unlocking gen 2+ Pokémon, raising the
6-pet cap to 24) the concept emerged: build something similar but **coding-themed**,
where the game feeds off your actual dev activity.

---

## Core Concept

> An idle dev civilization where your pets evolve based on *how* you code,
> and then work to build your city.

### The Key Insight: Feed Duality

| Source | Feed Type | How earned |
|---|---|---|
| LLM / autocomplete accepted (Copilot, Claude, etc.) | 🌱 **Normal feed** | Every 200 LLM chars = 1 normal feed |
| Manual typing (character by character) | ⭐ **Premium feed** | Every 100 manual chars = 1 premium feed |

**Why this matters:**
- LLM feed is "cheap" — easy to get, fuels standard growth
- Manual feed is "expensive" — harder to earn, unlocks special abilities and rare
  evolution paths
- This creates a natural tension: AI makes you faster but manual craft makes you
  *special*

### Detection Heuristic

`vscode.workspace.onDidChangeTextDocument` fires on every edit. We classify by size:
- Single event inserts **> 8 chars** → LLM/autocomplete (configurable via
  `code-city.llmInsertThreshold`)
- Single event inserts **≤ 8 chars** → manual typing

This isn't perfect (e.g. snippet expansion looks like LLM) but it's a good enough
proxy without needing Copilot/Claude API hooks.

---

## Pets

### Species & Evolution Paths

Each pet has **two evolution paths** that branch at stage 1, determined by whether
premium (manual) or normal (LLM) feed dominates:

| Pet | LLM Path | Manual Path | Worker Role |
|---|---|---|---|
| 🔥 Ember | Ember → Inferno → Titan | Ember → Phoenix → **Seraph** | Builder |
| 🌱 Sprout | Sprout → Grove → Forest | Sprout → Sage → **Oracle** | Farmer |
| 💧 Droplet | Droplet → Stream → Torrent | Droplet → Tide → **Leviathan** | Miner |
| ⚡ Spark | Spark → Current → Grid | Spark → Thunder → **Storm** | Researcher |

### Special Abilities (Manual Path Final Stage only)

Reaching the final stage via the manual path unlocks a one-time special ability. The player clicks **⚡ Use Ability** in the pet card to activate it.

| Pet | Ability | Target | Mult | Duration |
|---|---|---|---|---|
| ✨ Seraph | Divine Craft — Premium feed gives 2× XP | `xp` | ×2 | 10 min |
| 🍀 Oracle | Foresight — Next evolution costs 50% less feed | `evolution` | ×0.5 | 5 min |
| 🐋 Leviathan | Deep Work — Typing streak timer doubled | `streak` | ×2 | 10 min |
| 🌪️ Storm | Surge — All buildings produce 3× | `production` | ×3 | 5 min |

Ability flow:
1. Pet evolves to stage 2 via manual path → `specialAbilityUnlocked = true`
2. User clicks "⚡ Use Ability" → `useAbility(petId)` in `PetManager`
3. An `ActiveAbility` entry is pushed to `save.activeAbilities` with `petId`, `target`, `multiplier`, `expiresAt`
4. `specialAbilityUnlocked` is set to `false` (consumed — one-time use)
5. Oracle ability is also consumed (removed from `activeAbilities`) after the first evolution it enables
6. **Dev panel**: "↺ Ability" button calls `forceResetAbility(petId)` to re-enable for testing

---

## Boost Triggers

Originally considered "test passes" as a boost trigger, but dropped it because not
everyone has tests set up. Replaced with universally achievable triggers:

| Trigger | Effect |
|---|---|
| **Git commit** | +10 City XP (detected via VS Code git extension API) |
| **5+ minute typing streak** | Bonus premium feed (1 per 5 minutes of streak) |
| **Daily first open** | Login bonus: 5 + streak_days normal feed, 2 + streak/3 premium feed |

---

## City

### Buildings

| Building | Emoji | Unlock (City XP) | Cost | Produces / Effect |
|---|---|---|---|---|
| Farm | 🌾 | 0 (free, starts with one) | 0 | 2 normal feed / min |
| Workshop | 🔨 | 50 XP | 100 feed | 1 City XP / min |
| Library | 📚 | 150 XP | 300 feed | 0.5 City XP / min + −2% evolution cost per level (max −50%) |
| Mine | ⛏️ | 400 XP | 600 feed | Rare materials / min (5 needed to reach final evolution stage) |
| Tower | 🗼 | 1000 XP | 2000 feed | +10% multiplier on ALL building output per level |

All buildings are multiplicatively boosted by:
- Tower total-level bonus (`getTowerMultiplier = 1 + totalTowerLevel × 0.1`)
- Active Storm ability (+3× production)
- Active Seraph ability (+2× XP output for workshop/library)

### Worker Assignment

Pets can be assigned to buildings as workers:
- Unassigned building: 1× production
- Stage 1 pet assigned: 1.5× production
- Stage 2 pet assigned: 2× production

### City Level Thresholds

Level gates at City XP: 0, 50, 200, 500, 1200, 3000

---

## Technical Architecture

```
D:\oo\code-city\
├── src/
│   ├── extension.ts              # Entry point, wires everything, git tracking
│   │                             # Construction order: saveManager → cityManager
│   │                             #   → petManager(save, city) → feedTracker(save, city, cb)
│   ├── game/
│   │   ├── game-data.ts          # Static data: species, buildings, SpecialAbility records
│   │   ├── save-manager.ts       # JSON save/load with 500ms debounced writes
│   │   ├── feed-tracker.ts       # Text change listener, streak timer, daily bonus
│   │   │                         # Leviathan ability doubles getStreakIdleMs()
│   │   ├── pet-manager.ts        # Hatch, feed, evolve, useAbility, forceResetAbility
│   │   └── city-manager.ts       # Build, upgrade, tick; getTowerMultiplier,
│   │                             #   getTotalLibraryDiscount, getActiveMultiplier
│   └── webview/
│       └── webview-provider.ts   # Sidebar webview, message routing
├── media/
│   ├── main.html                 # Sidebar UI: Pets | City | Stats | Dev tabs
│   └── icon.svg                  # Extension icon
├── test/
│   ├── setup.js                  # ts-node + vscode mock
│   ├── vscode.mock.ts            # Minimal vscode stub
│   └── game.test.ts              # 41 unit tests
├── package.json                  # VS Code extension manifest
└── tsconfig.json
```

### Save File Location

VS Code managed: `context.globalStorageUri.fsPath/save.json`

On Windows this is typically:
`C:\Users\<user>\AppData\Roaming\Code\User\globalStorage\jjccy.code-city\save.json`

### Save Schema (v1)

```json
{
  "version": 1,
  "resources": {
    "normalFeed": 0,
    "premiumFeed": 0,
    "cityXP": 0,
    "rareMaterials": 0
  },
  "pets": [
    {
      "id": "abc123",
      "speciesId": "ember",
      "name": "Blaze",
      "stage": 0,
      "path": "undecided",
      "normalFedTotal": 0,
      "premiumFedTotal": 0,
      "assignedTo": null,
      "specialAbilityUnlocked": false
    }
  ],
  "city": {
    "level": 1,
    "buildings": [{ "id": "farm-1", "typeId": "farm", "level": 1 }]
  },
  "stats": {
    "totalManualChars": 0,
    "totalLLMChars": 0,
    "totalCommits": 0,
    "streakDays": 0,
    "lastActiveDate": "",
    "longestTypingStreak": 0
  },
  "activeAbilities": [],
  "lastTickAt": 1712345678000
}
```

---

## Configuration (settings.json)

```json
"code-city.llmInsertThreshold": 8,
"code-city.charsPerNormalFeed": 200,
"code-city.charsPerPremiumFeed": 100
```

---

## How to Run / Develop

```bash
# Open project in VS Code
code D:\oo\code-city

# Compile TypeScript
npm run compile

# Or watch mode
npm run watch

# Press F5 to launch Extension Development Host
# Code City appears in the Explorer sidebar
```

---

## GitHub

Repo: https://github.com/jjccy/code-city
Publisher: jjccy

---

## Building Upgrade Restrictions (added)

`CityManager.upgradeBuilding` now enforces three gates:

| Gate | Formula |
|---|---|
| Level cap | Max level 50 (`CityManager.MAX_BUILDING_LEVEL`) |
| Feed cost floor | `Math.max(50, type.cost) × level × 2` — prevents free Farm upgrades |
| XP gate | Must have `type.unlockXP × level` City XP |

---

## Evolution Fix (added)

`PetManager.tryEvolve` was requiring **both** feed types to evolve, which was wrong.
Now: once a path is locked in (LLM or manual), only that path's feed drives evolution.

- LLM path → only `normalFedTotal` checked against threshold
- Manual path → only `premiumFedTotal` checked against threshold
- Undecided → returns early until one threshold is hit

---

## Building Effects (implemented)

### Tower — `getTowerMultiplier()`
All non-tower buildings are multiplied by `1 + totalTowerLevel × 0.1`.
A level-3 Tower gives +30% to Farm, Workshop, Library, and Mine output.

### Library — `getTotalLibraryDiscount()`
Returns `min(0.5, totalLibraryLevel × 0.02)`. Applied as a discount factor to
evolution feed thresholds in `PetManager.tryEvolve()` — including path
determination for undecided pets.

### Mine — rareMaterials gate
Produces rareMaterials per tick. **5 rareMaterials are required** (and consumed)
for any pet to evolve from stage 1 to stage 2. If the player has < 5, the
evolution is blocked even if the feed threshold is met.

**UI hint:** Stage-1 pet cards show "💎 Final evolution needs 5 rare mats (have X.X)"
in red when the player can't afford it, green when they can. This makes the gate
visible so players aren't confused when feeding does nothing.

### Special Abilities — `useAbility(petId)`
`PetManager.useAbility(petId)` pushes an `ActiveAbility` entry to `save.activeAbilities`
with `petId`, `target`, `multiplier`, and `expiresAt`. It clears
`specialAbilityUnlocked` (one-time use). `CityManager.getActiveMultiplier(target)`
reads these entries (filtered by expiry) to compute combined multipliers.

Oracle's `'evolution'` target ability is consumed (removed from `activeAbilities`)
immediately after the next successful evolution — not just at expiry.

---

## Dev Mode Features (added)

When the extension runs in `ExtensionMode.Development` (F5 launch):

### Hot reload
`WebviewProvider` creates a `FileSystemWatcher` on `media/**`. Any change to `main.html`
(or other media files) instantly reloads the webview — no manual "Reload Window" needed
for UI changes.

### Dev tab
A 4th "🔧 Dev" tab appears in the webview sidebar (hidden in production). It provides:
- **Resource editors** — set/add normalFeed, premiumFeed, cityXP, rareMaterials directly
- **Force Tick** — trigger a city production tick immediately  
- **Force Evolve** — advance any pet to the next stage instantly
- **Reset Save** — wipe save back to defaults

Dev messages are gated server-side (`if (!this.devMode) break`) so they're inert even
if somehow sent in production.

---

## Testing (added)

```
test/
  setup.js          # Registers ts-node + intercepts 'vscode' → mock
  vscode.mock.ts    # Minimal vscode API stub
  game.test.ts      # Unit tests for SaveManager, PetManager, CityManager, FeedTracker
tsconfig.test.json  # Extends main tsconfig; rootDir="./" to include test/
.mocharc.json       # Mocha config: require setup.js, spec test/**/*.test.ts
```

Run tests:
```bash
npm install   # first time: installs mocha, ts-node, @types/mocha
npm test
```

Coverage areas:
- `SaveManager` — default save, load/flush cycle, reset
- `PetManager` — feed deduction, LLM path evolution, manual path evolution,
  stage-2 single-path gate, max-stage guard
- `CityManager` — tick production, offline cap, upgrade level cap, XP gate, cost floor
- `FeedTracker` — daily bonus, streak increment/reset, LLM vs manual feed conversion

---

## Known Gaps / Future Work

- [ ] **Pet sprites** — currently emoji. Add pixel art PNG sprite sheets (32×32 / 48×48,
      4 cols × 12 rows format — same as pokemon-pets uses)
- [ ] **Worker assign UI** — currently routes through VS Code QuickPick. Could be
      drag-and-drop in the webview
- [ ] **Sound effects** — vscode webview can play Audio
- [ ] **More species** — only 4 pets right now. Easy to add more in `game-data.ts`
- [ ] **Rare materials cosmetics/unlocks** — currently only gating final evolution. Could
      also unlock premium building skins or special workers.
- [ ] **Ability recharge** — abilities are one-time per evolution. Could add a recharge
      mechanic (e.g., reaching a new commit milestone re-unlocks it)
- [ ] **Publish to Marketplace** — need to run `vsce package` then `vsce publish`
