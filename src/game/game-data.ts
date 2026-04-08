// ─── Types ────────────────────────────────────────────────────────────────────

export type FeedType = 'normal' | 'premium';
export type PetStage = 0 | 1 | 2;  // baby | evolved | final

export interface PetSpeciesForm {
  name: string;
  emoji: string;
  description: string;
}

export interface PetSpecies {
  id: string;
  baseName: string;
  /** Form reached by heavy LLM feeding */
  llmPath: PetSpeciesForm[];
  /** Form reached by heavy manual typing */
  manualPath: PetSpeciesForm[];
  /** Worker role when assigned to a building */
  workerRole: string;
  /** Candy costs to evolve to next stage */
  normalFeedCost: number;
  premiumFeedCost: number;
}

export interface BuildingType {
  id: string;
  name: string;
  emoji: string;
  description: string;
  /** Resource produced per tick */
  baseProduction: number;
  /** City XP required to unlock */
  unlockXP: number;
  /** Gold cost to build */
  cost: number;
}

// ─── Pet Species ──────────────────────────────────────────────────────────────

export const PET_SPECIES: PetSpecies[] = [
  {
    id: 'ember',
    baseName: 'Ember',
    llmPath: [
      { name: 'Ember',    emoji: '🔥', description: 'A tiny flame, curious and warm.' },
      { name: 'Inferno',  emoji: '🌋', description: 'Blazing with AI energy. Fast builder.' },
      { name: 'Titan',    emoji: '☄️',  description: 'An unstoppable force of automation.' },
    ],
    manualPath: [
      { name: 'Ember',    emoji: '🔥', description: 'A tiny flame, curious and warm.' },
      { name: 'Phoenix',  emoji: '🦅', description: 'Reborn through pure craftsmanship.' },
      { name: 'Seraph',   emoji: '✨', description: 'A legendary spirit of creation.' },
    ],
    workerRole: 'Builder',
    normalFeedCost: 30,
    premiumFeedCost: 15,
  },
  {
    id: 'sprout',
    baseName: 'Sprout',
    llmPath: [
      { name: 'Sprout',   emoji: '🌱', description: 'A tiny seedling, full of potential.' },
      { name: 'Grove',    emoji: '🌳', description: 'A steady provider of resources.' },
      { name: 'Forest',   emoji: '🌲', description: 'An abundant ecosystem at work.' },
    ],
    manualPath: [
      { name: 'Sprout',   emoji: '🌱', description: 'A tiny seedling, full of potential.' },
      { name: 'Sage',     emoji: '🌿', description: 'Wise from hand-crafted knowledge.' },
      { name: 'Oracle',   emoji: '🍀', description: 'Sees paths others cannot.' },
    ],
    workerRole: 'Farmer',
    normalFeedCost: 25,
    premiumFeedCost: 12,
  },
  {
    id: 'droplet',
    baseName: 'Droplet',
    llmPath: [
      { name: 'Droplet',  emoji: '💧', description: 'Pure and adaptable.' },
      { name: 'Stream',   emoji: '🌊', description: 'Flows efficiently through any task.' },
      { name: 'Torrent',  emoji: '🌀', description: 'Overwhelming productive force.' },
    ],
    manualPath: [
      { name: 'Droplet',  emoji: '💧', description: 'Pure and adaptable.' },
      { name: 'Tide',     emoji: '🐚', description: 'Patient, methodical, unstoppable.' },
      { name: 'Leviathan',emoji: '🐋', description: 'Master of the deep unknown.' },
    ],
    workerRole: 'Miner',
    normalFeedCost: 20,
    premiumFeedCost: 10,
  },
  {
    id: 'spark',
    baseName: 'Spark',
    llmPath: [
      { name: 'Spark',    emoji: '⚡', description: 'Quick and electric.' },
      { name: 'Current',  emoji: '🔌', description: 'Powers everything around it.' },
      { name: 'Grid',     emoji: '🛰️',  description: 'A networked intelligence.' },
    ],
    manualPath: [
      { name: 'Spark',    emoji: '⚡', description: 'Quick and electric.' },
      { name: 'Thunder',  emoji: '🌩️', description: 'Strikes with precision and power.' },
      { name: 'Storm',    emoji: '🌪️',  description: 'Unstoppable creative energy.' },
    ],
    workerRole: 'Researcher',
    normalFeedCost: 35,
    premiumFeedCost: 18,
  },
];

// ─── Buildings ────────────────────────────────────────────────────────────────

export const BUILDING_TYPES: BuildingType[] = [
  {
    id: 'farm',
    name: 'Farm',
    emoji: '🌾',
    description: 'Passively generates normal feed over time.',
    baseProduction: 2,
    unlockXP: 0,
    cost: 0,
  },
  {
    id: 'workshop',
    name: 'Workshop',
    emoji: '🔨',
    description: 'Workers here produce bonus city XP.',
    baseProduction: 1,
    unlockXP: 50,
    cost: 100,
  },
  {
    id: 'library',
    name: 'Library',
    emoji: '📚',
    description: 'Researchers unlock new evolutions faster.',
    baseProduction: 1,
    unlockXP: 150,
    cost: 300,
  },
  {
    id: 'mine',
    name: 'Mine',
    emoji: '⛏️',
    description: 'Produces rare materials needed for final evolutions.',
    baseProduction: 1,
    unlockXP: 400,
    cost: 600,
  },
  {
    id: 'tower',
    name: 'Tower',
    emoji: '🗼',
    description: 'Prestige structure. Boosts all workers in the city.',
    baseProduction: 0,
    unlockXP: 1000,
    cost: 2000,
  },
];

// ─── Special Abilities ────────────────────────────────────────────────────────
// Unlocked when a pet reaches final stage via the manual path

export interface SpecialAbility {
  description: string;
  /** Which game metric this ability multiplies */
  target: 'xp' | 'production' | 'streak' | 'evolution';
  /** The multiplier applied (sub-1 means cheaper/shorter) */
  multiplier: number;
  /** How long the effect lasts in milliseconds */
  durationMs: number;
}

export const SPECIAL_ABILITIES: Record<string, SpecialAbility> = {
  seraph:    { description: '✨ Divine Craft — Premium feed gives 2× XP for 10 min',    target: 'xp',        multiplier: 2,   durationMs: 10 * 60_000 },
  oracle:    { description: '🍀 Foresight — Next evolution costs 50% less feed',         target: 'evolution', multiplier: 0.5, durationMs:  5 * 60_000 },
  leviathan: { description: '🐋 Deep Work — Typing streak timer doubled for 10 min',     target: 'streak',    multiplier: 2,   durationMs: 10 * 60_000 },
  storm:     { description: '🌪️ Surge — All buildings produce 3× for 5 min',             target: 'production',multiplier: 3,   durationMs:  5 * 60_000 },
};
