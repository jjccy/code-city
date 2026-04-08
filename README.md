# Code City

> An idle dev civilization that lives in your VS Code sidebar —
> feed pets with your typing, build a city as you code.

![Version](https://img.shields.io/badge/version-0.1.8-blue)
![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.85.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## About the Project

Code City turns your coding habits into a tiny idle civilization. Two
kinds of activity feed your pets:

| What you do | Feed earned | Effect |
|---|---|---|
| Accept LLM / autocomplete suggestions | 🌱 Normal feed | Standard pet growth |
| Type manually (character by character) | ⭐ Premium feed | Rare evolutions & special abilities |

The tension is intentional — AI makes you faster, but manual craft
makes your pets *special*.

---

## Features

**Live pasture canvas** — your pets roam freely in an animated canvas that
fills the sidebar. Sprites are pixel-art PNGs (CC0) with walk, idle, and
action animations. Size scales with evolution stage.

**Four pet species, each with two evolution paths:**

| Species | LLM Path | Manual Path |
|---|---|---|
| 🔥 Ember | Ember → Inferno → Titan | Ember → Phoenix → Seraph |
| 🌱 Sprout | Sprout → Grove → Forest | Sprout → Sage → Oracle |
| 💧 Droplet | Droplet → Stream → Torrent | Droplet → Tide → Leviathan |
| ⚡ Spark | Spark → Current → Grid | Spark → Thunder → Storm |

Reaching the **final stage via the manual path** unlocks a one-time special ability:

| Pet | Ability | Effect |
|---|---|---|
| ✨ Seraph | Divine Craft | All XP production ×2 for 10 min |
| 🍀 Oracle | Foresight | Next evolution costs 50% less feed |
| 🐋 Leviathan | Deep Work | Typing streak timer ×2 for 10 min |
| 🌪️ Storm | Surge | All building output ×3 for 5 min |

**City buildings — earn City XP to unlock and upgrade:**

| Building | Unlock | Effect |
|---|---|---|
| 🌾 Farm | Free | Produces normal feed passively |
| 🔨 Workshop | 50 XP | Produces City XP passively |
| 📚 Library | 150 XP | Produces City XP + reduces evolution cost (2% per level, cap 50%) |
| ⛏️ Mine | 400 XP | Produces rare materials required for final evolution |
| 🗼 Tower | 1000 XP | +10% to all building output per level |

Assign pets to buildings as workers to boost their production up to 2×.

**Bonus triggers:**
- 🏅 **Git commit** — +10 City XP per commit
- ⚡ **5-minute typing streak** — bonus premium feed
- ☀️ **Daily login** — feed bonus that scales with your streak days

---

## Where to Find It

Open the **Explorer** panel and look for **Code City**.

If it is not visible:
- `Ctrl+Shift+P` (Windows / Linux)
- `Cmd+Shift+P` (macOS)

Then run: **Focus on Code City View**

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `code-city.llmInsertThreshold` | `8` | Characters inserted in one event above this are treated as LLM feed |
| `code-city.charsPerNormalFeed` | `200` | LLM characters needed to earn 1 normal feed |
| `code-city.charsPerPremiumFeed` | `100` | Manual characters needed to earn 1 premium feed |
| `code-city.devMode` | `false` | Show the 🔧 Dev tab (auto-enabled when running via F5) |

---

## Resource Consumption

Code City is designed to be lightweight and won't slow down your editor.

| Resource | Details |
|---|---|
| CPU | Pasture canvas runs at 20 FPS via rAF; production ticks on a 10s interval |
| Memory | Minimal — no persistent connections, no file watchers beyond the active session |
| Disk I/O | Saves are debounced — only written when data changes, not on every tick |
| Network | None — fully offline, no telemetry |

---

## Development

**Prerequisites**

- [Node.js](https://nodejs.org/) v18 or later
- [VS Code](https://code.visualstudio.com/) v1.85 or later
- TypeScript (installed via `npm install`)

### Setup

```bash
git clone https://github.com/jjccy/code-city.git
cd code-city
npm install
npm run watch   # recompiles on save
```

Press **F5** in VS Code to launch the Extension Development Host.
Hot reload is active in dev mode — saving any file in `media/` refreshes
the webview instantly without reloading the window.

```bash
npm test   # 43 unit tests via Mocha
```

---

## About the Project

A personal side project built for fun — a coding-themed spin on the
idle pet genre. Not affiliated with any company. No data leaves your
machine.

---

## License

MIT © [jjccy](https://github.com/jjccy/code-city)
