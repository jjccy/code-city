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

    // Active ability multiplier
    const activeMult = this.getActiveMultiplier('production');

    for (const building of save.city.buildings) {
      const type = BUILDING_TYPES.find(t => t.id === building.typeId);
      if (!type) { continue; }

      const workerBonus = this.getWorkerBonus(building.id);
      const production  = type.baseProduction * building.level * workerBonus * tickFactor * activeMult;

      switch (building.typeId) {
        case 'farm':      result.normalFeed    += production; break;
        case 'workshop':  result.cityXP         += production; break;
        case 'library':   result.cityXP         += production * 0.5; break;
        case 'mine':      result.rareMaterials  += production * 0.5; break;
        case 'tower':
          // Tower boosts everything else — handled via multiplier
          break;
      }
    }

    result.normalFeed   = Math.floor(result.normalFeed);
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

  upgradeBuilding(buildingId: string): boolean {
    const save     = this.saveManager.save;
    const building = save.city.buildings.find(b => b.id === buildingId);
    if (!building) { return false; }

    const type = BUILDING_TYPES.find(t => t.id === building.typeId)!;
    const cost = type.cost * building.level * 2;
    if (save.resources.normalFeed < cost) { return false; }

    save.resources.normalFeed -= cost;
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

  private getWorkerBonus(buildingId: string): number {
    const worker = this.saveManager.save.pets.find(p => p.assignedTo === buildingId);
    if (!worker) { return 1; }
    return 1 + worker.stage * 0.5; // stage 1 = 1.5×, stage 2 = 2×
  }

  private getActiveMultiplier(target: 'production' | 'xp' | 'streak' | 'all'): number {
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
