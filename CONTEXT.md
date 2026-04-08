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

Reaching the final stage via the manual path unlocks a one-time special ability:

| Pet | Ability |
|---|---|
| ✨ Seraph | Divine Craft — Premium feed gives 2× XP for 10 min |
| 🍀 Oracle | Foresight — Next evolution costs 50% less feed |
| 🐋 Leviathan | Deep Work — Typing streak timer doubled |
| 🌪️ Storm | Surge — All buildings produce 3× for 5 min |

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

| Building | Emoji | Unlock (City XP) | Cost | Produces |
|---|---|---|---|---|
| Farm | 🌾 | 0 (free, starts with one) | 0 | Normal feed / min |
| Workshop | 🔨 | 50 XP | 100 feed | City XP / min |
| Library | 📚 | 150 XP | 300 feed | City XP (slower) |
| Mine | ⛏️ | 400 XP | 600 feed | Rare materials |
| Tower | 🗼 | 1000 XP | 2000 feed | Boosts all workers |

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
│   ├── game/
│   │   ├── game-data.ts          # All static data (species, buildings, abilities)
│   │   ├── save-manager.ts       # JSON save/load with 500ms debounced writes
│   │   ├── feed-tracker.ts       # Text change listener, streak timer, daily bonus
│   │   ├── pet-manager.ts        # Hatch, feed, evolve pets
│   │   └── city-manager.ts       # Build, upgrade, tick (passive production)
│   └── webview/
│       └── webview-provider.ts   # Sidebar webview, message routing
├── media/
│   ├── main.html                 # Sidebar UI: Pets | City | Stats tabs
│   └── icon.svg                  # Extension icon
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

## Known Gaps / Future Work

- [ ] **Pet sprites** — currently emoji. Add pixel art PNG sprite sheets (32×32 / 48×48,
      4 cols × 12 rows format — same as pokemon-pets uses)
- [ ] **Special abilities** — `activeAbilities` array is tracked in save but the
      effect application is only partially wired in `city-manager.ts` (multiplier
      is read but abilities are never added). Need a `useAbility(petId)` command.
- [ ] **Rare materials** — produced by Mine but not consumed anywhere yet. Design
      a use case (e.g. unlock premium buildings or cosmetics)
- [ ] **Worker assign UI** — currently routes through VS Code QuickPick. Could be
      drag-and-drop in the webview
- [ ] **Sound effects** — vscode webview can play Audio
- [ ] **More species** — only 4 pets right now. Easy to add more in `game-data.ts`
- [ ] **Publish to Marketplace** — need to run `vsce package` then `vsce publish`
- [ ] **Test coverage** — no tests yet

---

## Session Notes

- The pokemon-pets extension (`anasfiguigui.pokemon-pets-1.0.0`) is fully obfuscated
  (`_0x...` variable names). Game data is embedded inline in `extension.js`, NOT in
  the separate `game-data.js` file (which is dead code). Any mods need to go directly
  into `extension.js`.
- Max pet limit was changed from 6 → 24 by modifying `k=0x6` → `k=0x18` in
  `extension.js` (there are two copies: one in `save-manager.js` which was easy,
  one in the obfuscated `extension.js` which required finding the variable).
- Gen 2 sprites were downloaded from PokeAPI
  (`raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/{id}.png`)
  and tiled into 4×12 sprite sheets using jimp.
  Script saved at `D:\tmp\pokemon-sprite-gen\gen2.js`.
