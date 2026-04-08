import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SaveManager } from '../game/save-manager';
import { PetManager } from '../game/pet-manager';
import { CityManager } from '../game/city-manager';
import { PET_SPECIES, BUILDING_TYPES, SPECIAL_ABILITIES } from '../game/game-data';

export class WebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'code-city.gameView';
  private view?: vscode.WebviewView;
  private readonly devMode: boolean;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly saveManager: SaveManager,
    private readonly petManager: PetManager,
    private readonly cityManager: CityManager,
  ) {
    this.devMode = context.extensionMode === vscode.ExtensionMode.Development
      || vscode.workspace.getConfiguration('code-city').get<boolean>('devMode', false);
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'media'))],
    };
    webviewView.webview.html = this.getHtml(webviewView.webview);

    // ── Hot reload (dev mode only) ─────────────────────────────────────────
    if (this.devMode) {
      const mediaPath = path.join(this.context.extensionPath, 'media');
      let debounce: ReturnType<typeof setTimeout> | undefined;
      const watcher = fs.watch(mediaPath, { recursive: true }, () => {
        if (debounce) { clearTimeout(debounce); }
        debounce = setTimeout(() => {
          debounce = undefined;
          if (this.view) { this.view.webview.html = this.getHtml(this.view.webview); }
        }, 150);
      });
      this.context.subscriptions.push({ dispose: () => watcher.close() });
    }

    // ── Message handling ───────────────────────────────────────────────────
    webviewView.webview.onDidReceiveMessage(async msg => {
      const save = this.saveManager.save;

      switch (msg.type) {
        case 'feedPet':
          this.petManager.feedPet(msg.petId, msg.feedType, 1);
          this.pushState();
          break;
        case 'assignWorker':
          this.cityManager.assignWorker(msg.petId, msg.buildingId);
          this.pushState();
          break;
        case 'buildBuilding':
          if (!this.cityManager.buildBuilding(msg.typeId)) {
            vscode.window.showWarningMessage('Not enough resources to build that.');
          }
          this.pushState();
          break;
        case 'upgradeBuilding':
          if (!this.cityManager.upgradeBuilding(msg.buildingId)) {
            vscode.window.showWarningMessage('Cannot upgrade: insufficient feed, XP, or building is at max level (50).');
          }
          this.pushState();
          break;
        case 'addPetDirect':
          this.petManager.addPetDirect(msg.speciesId, msg.name);
          this.pushState();
          break;
        case 'addPet':
          await this.petManager.addPet();
          this.pushState();
          break;
        case 'showAssign': {
          const buildings = save.city.buildings;
          const items = buildings.map(b => {
            const type = BUILDING_TYPES.find(t => t.id === b.typeId)!;
            return { label: `${type.emoji} ${type.name} (Lv ${b.level})`, id: b.id };
          });
          const pick = await vscode.window.showQuickPick(items, { title: 'Assign pet to building' });
          if (pick) {
            this.cityManager.assignWorker(msg.petId, pick.id);
            this.pushState();
          }
          break;
        }
        case 'useAbility':
          if (!this.petManager.useAbility(msg.petId)) {
            vscode.window.showWarningMessage('Ability not available.');
          }
          this.pushState();
          break;

        // ── Dev messages (ignored in production) ──────────────────────────
        case 'dev:set':
          if (!this.devMode) { break; }
          (save.resources as any)[msg.key] = Number(msg.value);
          this.saveManager.scheduleSave();
          this.pushState();
          break;
        case 'dev:add':
          if (!this.devMode) { break; }
          (save.resources as any)[msg.key] = ((save.resources as any)[msg.key] ?? 0) + Number(msg.amount);
          this.saveManager.scheduleSave();
          this.pushState();
          break;
        case 'dev:tick':
          if (!this.devMode) { break; }
          this.cityManager.tick();
          this.pushState();
          break;
        case 'dev:forceEvolve':
          if (!this.devMode) { break; }
          {
            const pet = save.pets.find(p => p.id === msg.petId);
            if (pet && pet.stage < 2) {
              if (pet.path === 'undecided') { pet.path = 'manual'; } // manual to expose abilities
              pet.stage = (pet.stage + 1) as 0 | 1 | 2;
              if (pet.stage === 2 && pet.path === 'manual') {
                pet.specialAbilityUnlocked = true;
              }
              this.saveManager.scheduleSave();
            }
          }
          this.pushState();
          break;
        case 'dev:resetAbility':
          if (!this.devMode) { break; }
          this.petManager.forceResetAbility(msg.petId);
          this.pushState();
          break;
        case 'dev:reset':
          if (!this.devMode) { break; }
          this.saveManager.reset();
          this.pushState();
          break;

        case 'ready':
          this.pushState();
          break;
      }
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) { this.pushState(); }
    });
  }

  pushState(): void {
    if (!this.view?.visible) { return; }
    const save = this.saveManager.save;

    const pets = save.pets.map(pet => ({
      ...pet,
      form: this.petManager.getForm(pet),
    }));

    this.view.webview.postMessage({
      type: 'state',
      data: {
        resources: save.resources,
        pets,
        city: save.city,
        stats: save.stats,
        activeAbilities: save.activeAbilities,
        towerMultiplier: this.cityManager.getTowerMultiplier(),
        libraryDiscount: this.cityManager.getTotalLibraryDiscount(),
        unlockedBuildings: this.cityManager.getUnlockedBuildings(),
        buildingTypes: BUILDING_TYPES,
        speciesList: PET_SPECIES,
        specialAbilities: SPECIAL_ABILITIES,
        devMode: this.devMode,
        spriteUris: this.getSpriteUris(this.view.webview),
      },
    });
  }

  private getSpriteUris(webview: vscode.Webview): { pets: Record<string, string>; buildings: Record<string, string> } {
    const sp = (rel: string) =>
      webview.asWebviewUri(vscode.Uri.file(path.join(this.context.extensionPath, 'media', 'sprites', rel))).toString();
    const pets: Record<string, string> = {};
    for (const id of ['ember', 'sprout', 'droplet', 'spark']) {
      pets[id] = sp(`pets/${id}.png`);
    }
    const buildings: Record<string, string> = {};
    for (const id of ['farm', 'workshop', 'library', 'mine', 'tower']) {
      buildings[id] = sp(`buildings/${id}.png`);
    }
    return { pets, buildings };
  }

  private getHtml(webview: vscode.Webview): string {
    const mediaPath = path.join(this.context.extensionPath, 'media');
    const htmlPath  = path.join(mediaPath, 'main.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
    const mediaUri = webview.asWebviewUri(vscode.Uri.file(mediaPath)).toString();
    const jsUri = (name: string) =>
      webview.asWebviewUri(vscode.Uri.file(path.join(mediaPath, name))).toString();
    html = html.replace(/\{\{mediaUri\}\}/g, mediaUri);
    html = html.replace(/\{\{cspSource\}\}/g, webview.cspSource);
    html = html.replace(/\{\{styleUri\}\}/g, jsUri('style.css'));
    html = html.replace(/\{\{uiUri\}\}/g, jsUri('ui.js'));
    html = html.replace(/\{\{pastureUri\}\}/g, jsUri('pasture.js'));
    return html;
  }
}
