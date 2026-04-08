import * as vscode from 'vscode';
import { SaveManager } from './save-manager';

/**
 * Watches text document changes and classifies them as manual typing
 * or LLM/autocomplete input.
 *
 * Heuristic:
 *   - Single change event inserting > llmThreshold chars  → LLM feed
 *   - Otherwise (char-by-char or small completions)       → manual feed
 *
 * Accumulated chars are converted to feed items based on config thresholds.
 */
export class FeedTracker {
  private pendingManual = 0;
  private pendingLLM = 0;

  /** Typing streak tracking */
  private streakStart: number | null = null;
  private streakTimer: NodeJS.Timeout | undefined;
  private static STREAK_IDLE_MS = 10_000; // 10 s of no typing ends streak

  constructor(
    private readonly saveManager: SaveManager,
    private readonly onFeedReady: () => void,
  ) {}

  onTextChange(event: vscode.TextDocumentChangeEvent): void {
    // Ignore output/debug channels etc.
    if (event.document.uri.scheme !== 'file') { return; }

    const cfg = vscode.workspace.getConfiguration('code-city');
    const threshold: number = cfg.get('llmInsertThreshold') ?? 8;

    for (const change of event.contentChanges) {
      const len = change.text.length;
      if (len === 0) { continue; } // pure deletion

      if (len > threshold) {
        this.pendingLLM += len;
      } else {
        this.pendingManual += len;
        this.touchStreak();
      }
    }

    this.convertPendingToFeed();
  }

  private convertPendingToFeed(): void {
    const cfg = vscode.workspace.getConfiguration('code-city');
    const perNormal: number  = cfg.get('charsPerNormalFeed') ?? 200;
    const perPremium: number = cfg.get('charsPerPremiumFeed') ?? 100;

    const normalEarned   = Math.floor(this.pendingLLM / perNormal);
    const premiumEarned  = Math.floor(this.pendingManual / perPremium);

    if (normalEarned > 0) {
      this.pendingLLM -= normalEarned * perNormal;
      this.saveManager.save.resources.normalFeed += normalEarned;
      this.saveManager.save.stats.totalLLMChars  += normalEarned * perNormal;
    }

    if (premiumEarned > 0) {
      this.pendingManual -= premiumEarned * perPremium;
      this.saveManager.save.resources.premiumFeed += premiumEarned;
      this.saveManager.save.stats.totalManualChars += premiumEarned * perPremium;
    }

    if (normalEarned > 0 || premiumEarned > 0) {
      this.saveManager.scheduleSave();
      this.onFeedReady();
    }
  }

  // ─── Typing Streak ─────────────────────────────────────────────────────────

  private touchStreak(): void {
    if (!this.streakStart) {
      this.streakStart = Date.now();
    }

    if (this.streakTimer) {
      clearTimeout(this.streakTimer);
    }

    this.streakTimer = setTimeout(() => {
      this.endStreak();
    }, FeedTracker.STREAK_IDLE_MS);
  }

  private endStreak(): void {
    if (!this.streakStart) { return; }

    const durationSec = Math.floor((Date.now() - this.streakStart) / 1000);
    this.streakStart = null;
    this.streakTimer = undefined;

    const stats = this.saveManager.save.stats;
    if (durationSec > stats.longestTypingStreak) {
      stats.longestTypingStreak = durationSec;
    }

    // 5+ minute streak = grant a boost (1 bonus premium feed per minute)
    const bonusMinutes = Math.floor(durationSec / 60);
    if (bonusMinutes >= 5) {
      const bonus = Math.floor(bonusMinutes / 5);
      this.saveManager.save.resources.premiumFeed += bonus;
      this.saveManager.scheduleSave();
      this.onFeedReady();
      vscode.window.showInformationMessage(
        `⚡ Typing streak! ${durationSec}s — earned ${bonus} bonus premium feed!`
      );
    }
  }

  // ─── Daily Login ───────────────────────────────────────────────────────────

  checkDailyBonus(): boolean {
    const today = new Date().toISOString().slice(0, 10);
    const stats  = this.saveManager.save.stats;

    if (stats.lastActiveDate === today) { return false; }

    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    if (stats.lastActiveDate === yesterday) {
      stats.streakDays++;
    } else {
      stats.streakDays = 1;
    }

    stats.lastActiveDate = today;

    // Daily bonus scales with streak
    const normalBonus  = 5 + stats.streakDays;
    const premiumBonus = 2 + Math.floor(stats.streakDays / 3);

    this.saveManager.save.resources.normalFeed  += normalBonus;
    this.saveManager.save.resources.premiumFeed += premiumBonus;
    this.saveManager.scheduleSave();

    return true;
  }

  dispose(): void {
    if (this.streakTimer) { clearTimeout(this.streakTimer); }
    this.endStreak();
  }
}
