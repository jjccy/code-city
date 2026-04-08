import * as vscode from 'vscode';
import { SaveManager, PetSave } from './save-manager';
import { PET_SPECIES, SPECIAL_ABILITIES, PetStage } from './game-data';

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export class PetManager {
  constructor(private readonly saveManager: SaveManager) {}

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

    // Determine / confirm evolution path
    if (pet.path === 'undecided' && pet.stage === 0) {
      if (pet.premiumFedTotal >= species.premiumFeedCost) {
        pet.path = 'manual';
      } else if (pet.normalFedTotal >= species.normalFeedCost) {
        pet.path = 'llm';
      }
    }

    const nextStage = (pet.stage + 1) as PetStage;
    const normalNeeded  = species.normalFeedCost  * nextStage;
    const premiumNeeded = species.premiumFeedCost * nextStage;

    const canEvolve =
      pet.normalFedTotal  >= normalNeeded &&
      pet.premiumFedTotal >= premiumNeeded;

    if (!canEvolve) { return; }

    pet.stage = nextStage;

    const path   = pet.path === 'manual' ? species.manualPath : species.llmPath;
    const form   = path[pet.stage];
    const isMax  = pet.stage === 2;

    vscode.window.showInformationMessage(
      `🎉 ${pet.name} evolved into ${form.emoji} ${form.name}!` +
      (isMax && pet.path === 'manual'
        ? ` Unlocked special ability: ${SPECIAL_ABILITIES[form.name.toLowerCase()] ?? '?'}`
        : '')
    );

    if (isMax && pet.path === 'manual') {
      pet.specialAbilityUnlocked = true;
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
