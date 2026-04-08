import { SaveManager, BuildingSave } from './save-manager';
import { BUILDING_TYPES } from './game-data';

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export class CityManager {
  constructor(private readonly saveManager: SaveManager) {}

  get buildings(): BuildingSave[] { return this.saveManager.save.city.buildings; }

  /** Run a production tick. Called on a timer (e.g. every 60s). */
  tick(): { normalFeed: number; rareMaterials: number; cityXP: number } {
    const result = { normalFeed: 0, rareMaterials: 0, cityXP: 0 };
    const save   = this.saveManager.save;
    const now    = Date.now();

    // Elapsed since last tick (capped at 10 minutes to avoid huge offline gains)
    const elapsedSec = Math.min((now - save.lastTickAt) / 1000, 600);
    const tickFactor = elapsedSec / 60; // normalised to per-minute
    save.lastTickAt  = now;

    const towerMult  = this.getTowerMultiplier();
    const activeMult = this.getActiveMultiplier('production');
    const xpMult     = this.getActiveMultiplier('xp');

    for (const building of save.city.buildings) {
      const type = BUILDING_TYPES.find(t => t.id === building.typeId);
      if (!type) { continue; }

      const workerBonus = this.getWorkerBonus(building.id);
      const production  = type.baseProduction * building.level * workerBonus * tickFactor;

      switch (building.typeId) {
        case 'farm':
          result.normalFeed   += production * towerMult * activeMult;
          break;
        case 'workshop':
          result.cityXP        += production * towerMult * activeMult * xpMult;
          break;
        case 'library':
          result.cityXP        += production * 0.5 * towerMult * activeMult * xpMult;
          break;
        case 'mine':
          result.rareMaterials += production * towerMult * activeMult;
          break;
        case 'tower':
          // Tower boosts all other buildings via getTowerMultiplier() — no direct output
          break;
      }
    }

    result.normalFeed    = Math.floor(result.normalFeed);
    result.rareMaterials = Math.floor(result.rareMaterials * 10) / 10;
    result.cityXP        = Math.floor(result.cityXP);

    save.resources.normalFeed    += result.normalFeed;
    save.resources.rareMaterials += result.rareMaterials;
    save.resources.cityXP        += result.cityXP;

    this.checkLevelUp();
    this.saveManager.scheduleSave();
    return result;
  }

  buildBuilding(typeId: string): boolean {
    const save = this.saveManager.save;
    const type = BUILDING_TYPES.find(t => t.id === typeId);
    if (!type) { return false; }
    if (save.resources.cityXP < type.unlockXP) { return false; }
    if (save.resources.normalFeed < type.cost)  { return false; }

    save.resources.normalFeed -= type.cost;
    save.city.buildings.push({ id: `${typeId}-${randomId()}`, typeId, level: 1 });
    this.saveManager.scheduleSave();
    return true;
  }

  static readonly MAX_BUILDING_LEVEL = 50;

  upgradeBuilding(buildingId: string): boolean {
    const save     = this.saveManager.save;
    const building = save.city.buildings.find(b => b.id === buildingId);
    if (!building) { return false; }
    if (building.level >= CityManager.MAX_BUILDING_LEVEL) { return false; }

    const type       = BUILDING_TYPES.find(t => t.id === building.typeId)!;
    const baseCost   = Math.max(50, type.cost);           // floor for free buildings (e.g. Farm)
    const feedCost   = baseCost * building.level * 2;
    const xpRequired = type.unlockXP * building.level;    // XP gate scales per level

    if (save.resources.cityXP    < xpRequired) { return false; }
    if (save.resources.normalFeed < feedCost)  { return false; }

    save.resources.normalFeed -= feedCost;
    building.level++;
    this.saveManager.scheduleSave();
    return true;
  }

  assignWorker(petId: string, buildingId: string): void {
    const save = this.saveManager.save;
    // Unassign from previous building
    for (const pet of save.pets) {
      if (pet.assignedTo === buildingId) { pet.assignedTo = null; }
    }
    const pet = save.pets.find(p => p.id === petId);
    if (pet) { pet.assignedTo = buildingId; }
    this.saveManager.scheduleSave();
  }

  /** Total production multiplier from all Tower buildings (10% per level). */
  getTowerMultiplier(): number {
    const totalLevel = this.saveManager.save.city.buildings
      .filter(b => b.typeId === 'tower')
      .reduce((sum, b) => sum + b.level, 0);
    return 1 + totalLevel * 0.1;
  }

  /** Evolution feed discount from all Library buildings (2% per level, cap 50%). */
  getTotalLibraryDiscount(): number {
    const totalLevel = this.saveManager.save.city.buildings
      .filter(b => b.typeId === 'library')
      .reduce((sum, b) => sum + b.level, 0);
    return Math.min(0.5, totalLevel * 0.02);
  }

  private getWorkerBonus(buildingId: string): number {
    const worker = this.saveManager.save.pets.find(p => p.assignedTo === buildingId);
    if (!worker) { return 1; }
    return 1 + worker.stage * 0.5; // stage 1 = 1.5×, stage 2 = 2×
  }

  /** Returns the combined multiplier for all active abilities targeting the given metric. */
  getActiveMultiplier(target: 'production' | 'xp' | 'streak' | 'evolution'): number {
    const now = Date.now();
    const abilities = this.saveManager.save.activeAbilities.filter(
      a => a.expiresAt > now && (a.target === target || a.target === 'all')
    );
    return abilities.reduce((acc, a) => acc * a.multiplier, 1);
  }

  private checkLevelUp(): void {
    const city = this.saveManager.save.city;
    const thresholds = [0, 50, 200, 500, 1200, 3000];
    const xp = this.saveManager.save.resources.cityXP;
    const newLevel = thresholds.filter(t => xp >= t).length;
    city.level = Math.max(city.level, newLevel);
  }

  getUnlockedBuildings(): typeof BUILDING_TYPES {
    const xp = this.saveManager.save.resources.cityXP;
    return BUILDING_TYPES.filter(t => xp >= t.unlockXP);
  }
}
