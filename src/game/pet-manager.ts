import * as vscode from 'vscode';
import { SaveManager, PetSave } from './save-manager';
import { CityManager } from './city-manager';
import { PET_SPECIES, SPECIAL_ABILITIES, HATCH_COST, PetStage } from './game-data';

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export class PetManager {
  constructor(
    private readonly saveManager: SaveManager,
    private readonly cityManager: CityManager,
  ) {}

  get pets(): PetSave[] { return this.saveManager.save.pets; }

  async addPet(): Promise<PetSave | undefined> {
    const species = await vscode.window.showQuickPick(
      PET_SPECIES.map(s => ({
        label: s.llmPath[0].emoji + ' ' + s.baseName,
        description: s.llmPath[0].description,
        id: s.id,
      })),
      { title: 'Choose a pet to hatch' }
    );
    if (!species) { return; }

    const name = await vscode.window.showInputBox({
      prompt: 'Name your pet',
      value: PET_SPECIES.find(s => s.id === species.id)!.baseName,
    });
    if (!name) { return; }

    const pet: PetSave = {
      id: randomId(),
      speciesId: species.id,
      name,
      stage: 0,
      path: 'undecided',
      normalFedTotal: 0,
      premiumFedTotal: 0,
      assignedTo: null,
      specialAbilityUnlocked: false,
    };

    this.saveManager.save.pets.push(pet);
    this.saveManager.scheduleSave();
    return pet;
  }

  addPetDirect(speciesId: string, name: string): PetSave | undefined {
    const species = PET_SPECIES.find(s => s.id === speciesId);
    if (!species) { return; }
    if (this.saveManager.save.resources.normalFeed < HATCH_COST) { return; }
    this.saveManager.save.resources.normalFeed -= HATCH_COST;
    const pet: PetSave = {
      id: randomId(), speciesId, name, stage: 0,
      path: 'undecided', normalFedTotal: 0, premiumFedTotal: 0,
      assignedTo: null, specialAbilityUnlocked: false,
    };
    this.saveManager.save.pets.push(pet);
    this.saveManager.scheduleSave();
    return pet;
  }

  feedPet(petId: string, feedType: 'normal' | 'premium', amount: number): boolean {
    const resources = this.saveManager.save.resources;
    const key = feedType === 'normal' ? 'normalFeed' : 'premiumFeed';

    if (resources[key] < amount) { return false; }

    const pet = this.pets.find(p => p.id === petId);
    if (!pet) { return false; }

    resources[key] -= amount;

    if (feedType === 'normal')  { pet.normalFedTotal  += amount; }
    if (feedType === 'premium') { pet.premiumFedTotal += amount; }

    this.tryEvolve(pet);
    this.saveManager.scheduleSave();
    return true;
  }

  private tryEvolve(pet: PetSave): void {
    if (pet.stage >= 2) { return; }

    const species = PET_SPECIES.find(s => s.id === pet.speciesId)!;

    // Apply Library discount + Oracle ability to evolution feed thresholds
    const libraryDiscount = this.cityManager.getTotalLibraryDiscount();
    const oracleMult      = this.cityManager.getActiveMultiplier('evolution');
    const discountFactor  = (1 - libraryDiscount) * oracleMult;

    // Determine evolution path using discounted stage-1 thresholds
    if (pet.path === 'undecided') {
      const discountedNormal  = Math.ceil(species.normalFeedCost  * discountFactor);
      const discountedPremium = Math.ceil(species.premiumFeedCost * discountFactor);
      if (pet.premiumFedTotal >= discountedPremium) {
        pet.path = 'manual';
      } else if (pet.normalFedTotal >= discountedNormal) {
        pet.path = 'llm';
      } else {
        return; // neither threshold reached yet
      }
    }

    const nextStage = (pet.stage + 1) as PetStage;
    const normalNeeded  = Math.ceil(species.normalFeedCost  * nextStage * discountFactor);
    const premiumNeeded = Math.ceil(species.premiumFeedCost * nextStage * discountFactor);

    // Only the path's dominant feed type drives evolution
    const canEvolve = pet.path === 'manual'
      ? pet.premiumFedTotal >= premiumNeeded
      : pet.normalFedTotal  >= normalNeeded;

    if (!canEvolve) { return; }

    // rareMaterials gate: final stage requires 5 rare materials
    if (nextStage === 2) {
      if (this.saveManager.save.resources.rareMaterials < 5) { return; }
      this.saveManager.save.resources.rareMaterials -= 5;
    }

    pet.stage = nextStage;

    // Consume any active Oracle ability after successful evolution
    const now = Date.now();
    this.saveManager.save.activeAbilities = this.saveManager.save.activeAbilities.filter(
      a => !(a.target === 'evolution' && a.expiresAt > now)
    );

    const path   = pet.path === 'manual' ? species.manualPath : species.llmPath;
    const form   = path[pet.stage];
    const isMax  = pet.stage === 2;

    vscode.window.showInformationMessage(
      `🎉 ${pet.name} evolved into ${form.emoji} ${form.name}!` +
      (isMax && pet.path === 'manual'
        ? ` Unlocked special ability: ${SPECIAL_ABILITIES[form.name.toLowerCase()]?.description ?? '?'}`
        : '')
    );

    if (isMax && pet.path === 'manual') {
      pet.specialAbilityUnlocked = true;
    }
  }

  /**
   * Activate the pet's special ability. Returns false if the pet doesn't have
   * an unlocked ability (wrong stage, wrong path, or already used).
   */
  useAbility(petId: string): boolean {
    const pet = this.saveManager.save.pets.find(p => p.id === petId);
    if (!pet || pet.stage < 2 || pet.path !== 'manual') { return false; }
    if (!pet.specialAbilityUnlocked) { return false; }

    const form    = this.getForm(pet);
    const ability = SPECIAL_ABILITIES[form.name.toLowerCase()];
    if (!ability) { return false; }

    const expiresAt = Date.now() + ability.durationMs;
    this.saveManager.save.activeAbilities.push({
      petId,
      target: ability.target,
      multiplier: ability.multiplier,
      expiresAt,
    });

    pet.specialAbilityUnlocked = false; // consumed
    this.saveManager.scheduleSave();
    return true;
  }

  /** Dev-only: re-unlock the ability for a stage-2 manual pet so it can be tested again. */
  forceResetAbility(petId: string): void {
    const pet = this.saveManager.save.pets.find(p => p.id === petId);
    if (pet && pet.stage === 2 && pet.path === 'manual') {
      pet.specialAbilityUnlocked = true;
      this.saveManager.scheduleSave();
    }
  }

  removePet(petId: string): void {
    const idx = this.saveManager.save.pets.findIndex(p => p.id === petId);
    if (idx !== -1) {
      this.saveManager.save.pets.splice(idx, 1);
      this.saveManager.scheduleSave();
    }
  }

  getForm(pet: PetSave) {
    const species = PET_SPECIES.find(s => s.id === pet.speciesId)!;
    const path = pet.path === 'manual' ? species.manualPath : species.llmPath;
    return path[pet.stage];
  }
}
