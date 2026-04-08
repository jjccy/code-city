import * as fs from 'fs';
import * as path from 'path';

// ─── Save Schema ──────────────────────────────────────────────────────────────

export interface PetSave {
  id: string;
  speciesId: string;
  name: string;
  stage: 0 | 1 | 2;
  /** Which evolution path: determined once stage > 0 */
  path: 'llm' | 'manual' | 'undecided';
  normalFedTotal: number;
  premiumFedTotal: number;
  /** Building id this pet is assigned to, or null */
  assignedTo: string | null;
  specialAbilityUnlocked: boolean;
}

export interface BuildingSave {
  id: string;       // unique instance id
  typeId: string;   // references BUILDING_TYPES
  level: number;
}

export interface ActiveAbility {
  /** Pet whose ability triggered this effect */
  petId: string;
  expiresAt: number; // Date.now() ms
  multiplier: number;
  target: 'xp' | 'production' | 'streak' | 'evolution' | 'all';
}

export interface GameSave {
  version: number;
  resources: {
    normalFeed: number;
    premiumFeed: number;
    cityXP: number;
    rareMaterials: number;
  };
  pets: PetSave[];
  city: {
    level: number;
    buildings: BuildingSave[];
  };
  stats: {
    totalManualChars: number;
    totalLLMChars: number;
    totalCommits: number;
    streakDays: number;
    lastActiveDate: string;
    longestTypingStreak: number; // seconds
  };
  activeAbilities: ActiveAbility[];
  lastTickAt: number;
}

function defaultSave(): GameSave {
  return {
    version: 1,
    resources: { normalFeed: 50, premiumFeed: 5, cityXP: 0, rareMaterials: 0 },
    pets: [],
    city: { level: 1, buildings: [{ id: 'farm-1', typeId: 'farm', level: 1 }] },
    stats: {
      totalManualChars: 0,
      totalLLMChars: 0,
      totalCommits: 0,
      streakDays: 0,
      lastActiveDate: '',
      longestTypingStreak: 0,
    },
    activeAbilities: [],
    lastTickAt: Date.now(),
  };
}

// ─── SaveManager ──────────────────────────────────────────────────────────────

export class SaveManager {
  private savePath: string;
  private _save: GameSave;
  private saveTimer: NodeJS.Timeout | undefined;
  private static DEBOUNCE_MS = 500;

  constructor(storageFolder: string) {
    if (!fs.existsSync(storageFolder)) {
      fs.mkdirSync(storageFolder, { recursive: true });
    }
    this.savePath = path.join(storageFolder, 'save.json');
    this._save = defaultSave();
  }

  get save(): GameSave { return this._save; }

  load(): void {
    if (!fs.existsSync(this.savePath)) {
      this._save = defaultSave();
      this.flush();
      return;
    }
    try {
      this._save = JSON.parse(fs.readFileSync(this.savePath, 'utf8'));
    } catch {
      this._save = defaultSave();
    }
  }

  scheduleSave(): void {
    if (this.saveTimer) { return; }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      fs.promises
        .writeFile(this.savePath, JSON.stringify(this._save, null, 2))
        .catch(e => console.error('Code City: save failed', e));
    }, SaveManager.DEBOUNCE_MS);
  }

  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
    }
    fs.writeFileSync(this.savePath, JSON.stringify(this._save, null, 2));
  }

  /** Dev-only: wipe save back to defaults. */
  reset(): void {
    this._save = defaultSave();
    this.flush();
  }
}
