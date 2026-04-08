import * as vscode from 'vscode';
import { SaveManager } from './game/save-manager';
import { FeedTracker } from './game/feed-tracker';
import { PetManager } from './game/pet-manager';
import { CityManager } from './game/city-manager';
import { WebviewProvider } from './webview/webview-provider';

export function activate(context: vscode.ExtensionContext): void {
  // ── Core services ──────────────────────────────────────────────────────────
  const saveManager  = new SaveManager(context.globalStorageUri.fsPath);
  saveManager.load();

  const cityManager = new CityManager(saveManager);
  const petManager  = new PetManager(saveManager, cityManager);
  const provider    = new WebviewProvider(context, saveManager, petManager, cityManager);

  // ── Webview sidebar ────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(WebviewProvider.viewType, provider)
  );

  // ── Feed tracker ───────────────────────────────────────────────────────────
  const feedTracker = new FeedTracker(saveManager, cityManager, () => provider.pushState());
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(e => feedTracker.onTextChange(e))
  );

  // ── Daily login bonus ──────────────────────────────────────────────────────
  const gotBonus = feedTracker.checkDailyBonus();
  if (gotBonus) {
    const s = saveManager.save;
    vscode.window.showInformationMessage(
      `☀️ Welcome back! Day ${s.stats.streakDays} streak — ` +
      `bonus feed added to Code City!`
    );
  }

  // ── Git commit tracking ────────────────────────────────────────────────────
  setupGitTracking(context, saveManager, provider);

  // ── City tick (every 60 s) ─────────────────────────────────────────────────
  const tickInterval = setInterval(() => {
    const result = cityManager.tick();
    if (result.normalFeed > 0 || result.cityXP > 0) {
      provider.pushState();
    }
  }, 60_000);
  context.subscriptions.push({ dispose: () => clearInterval(tickInterval) });

  // ── Commands ───────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('code-city.addPet', async () => {
      await petManager.addPet();
      provider.pushState();
    }),
    vscode.commands.registerCommand('code-city.collectResources', () => {
      cityManager.tick();
      provider.pushState();
      vscode.window.showInformationMessage('Code City: resources collected!');
    }),
  );

  context.subscriptions.push({ dispose: () => { feedTracker.dispose(); saveManager.flush(); } });
}

function setupGitTracking(
  context: vscode.ExtensionContext,
  saveManager: SaveManager,
  provider: WebviewProvider,
): void {
  const gitExt = vscode.extensions.getExtension('vscode.git');
  if (!gitExt) { return; }

  const tryAttach = () => {
    const api = gitExt.exports?.getAPI?.(1);
    if (!api) { return; }

    const attach = (repo: any) => {
      let lastHead = repo.state?.HEAD?.commit ?? '';
      context.subscriptions.push(
        repo.state.onDidChange(() => {
          const newHead = repo.state?.HEAD?.commit ?? '';
          if (newHead && newHead !== lastHead) {
            lastHead = newHead;
            saveManager.save.stats.totalCommits++;
            saveManager.save.resources.cityXP += 10;
            saveManager.scheduleSave();
            provider.pushState();
            vscode.window.showInformationMessage(
              '🏅 Commit detected! +10 City XP earned.'
            );
          }
        })
      );
    };

    api.repositories.forEach(attach);
    api.onDidOpenRepository(attach);
  };

  if (gitExt.isActive) {
    tryAttach();
  } else {
    gitExt.activate().then(tryAttach);
  }
}

export function deactivate(): void {}
