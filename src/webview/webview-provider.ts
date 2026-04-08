import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SaveManager } from '../game/save-manager';
import { PetManager } from '../game/pet-manager';
import { CityManager } from '../game/city-manager';
import { PET_SPECIES, BUILDING_TYPES } from '../game/game-data';

export class WebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'code-city.gameView';
  private view?: vscode.WebviewView;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly saveManager: SaveManager,
    private readonly petManager: PetManager,
    private readonly cityManager: CityManager,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async msg => {
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
          this.cityManager.upgradeBuilding(msg.buildingId);
          this.pushState();
          break;
        case 'addPet':
          await this.petManager.addPet();
          this.pushState();
          break;
        case 'showAssign': {
          const buildings = this.saveManager.save.city.buildings;
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
        unlockedBuildings: this.cityManager.getUnlockedBuildings(),
        buildingTypes: BUILDING_TYPES,
        speciesList: PET_SPECIES,
      },
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const mediaPath = path.join(this.context.extensionPath, 'media');
    const htmlPath  = path.join(mediaPath, 'main.html');
    let html = fs.readFileSync(htmlPath, 'utf8');

    // Replace asset paths with webview URIs
    const mediaUri = webview.asWebviewUri(vscode.Uri.file(mediaPath)).toString();
    html = html.replace(/\{\{mediaUri\}\}/g, mediaUri);
    return html;
  }
}
