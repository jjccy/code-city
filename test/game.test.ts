import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

import { SaveManager } from '../src/game/save-manager';
import { PetManager } from '../src/game/pet-manager';
import { CityManager } from '../src/game/city-manager';
import { FeedTracker } from '../src/game/feed-tracker';
import { PET_SPECIES } from '../src/game/game-data';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-city-test-'));
  return dir;
}

function makeManagers() {
  const dir = makeTmpDir();
  const save = new SaveManager(dir);
  save.load();
  const pets = new PetManager(save);
  const city = new CityManager(save);
  return { save, pets, city, dir };
}

/** Synthesise a minimal TextDocumentChangeEvent */
function makeChangeEvent(insertText: string) {
  return {
    document: { uri: { scheme: 'file' } },
    contentChanges: [{ text: insertText, rangeLength: 0 }],
  } as any;
}

// ── SaveManager ───────────────────────────────────────────────────────────────

describe('SaveManager', () => {
  it('creates a default save on first load', () => {
    const dir = makeTmpDir();
    const sm = new SaveManager(dir);
    sm.load();
    assert.strictEqual(sm.save.version, 1);
    assert.strictEqual(sm.save.resources.normalFeed, 5);
    assert.ok(Array.isArray(sm.save.pets));
  });

  it('persists and reloads data', () => {
    const dir = makeTmpDir();
    const sm = new SaveManager(dir);
    sm.load();
    sm.save.resources.cityXP = 999;
    sm.flush();

    const sm2 = new SaveManager(dir);
    sm2.load();
    assert.strictEqual(sm2.save.resources.cityXP, 999);
  });

  it('reset() restores defaults', () => {
    const { save } = makeManagers();
    save.save.resources.normalFeed = 9999;
    save.reset();
    assert.strictEqual(save.save.resources.normalFeed, 5);
  });
});

// ── PetManager ────────────────────────────────────────────────────────────────

describe('PetManager — feeding', () => {
  it('feedPet deducts resources and increments fedTotal', () => {
    const { save, pets } = makeManagers();
    save.save.resources.normalFeed = 10;

    // Manually inject a pet
    save.save.pets.push({
      id: 'p1', speciesId: 'droplet', name: 'Test', stage: 0,
      path: 'undecided', normalFedTotal: 0, premiumFedTotal: 0,
      assignedTo: null, specialAbilityUnlocked: false,
    });

    assert.ok(pets.feedPet('p1', 'normal', 1));
    assert.strictEqual(save.save.resources.normalFeed, 9);
    assert.strictEqual(save.save.pets[0].normalFedTotal, 1);
  });

  it('feedPet returns false when resources are insufficient', () => {
    const { save, pets } = makeManagers();
    save.save.resources.normalFeed = 0;
    save.save.pets.push({
      id: 'p1', speciesId: 'ember', name: 'Test', stage: 0,
      path: 'undecided', normalFedTotal: 0, premiumFedTotal: 0,
      assignedTo: null, specialAbilityUnlocked: false,
    });

    assert.strictEqual(pets.feedPet('p1', 'normal', 1), false);
  });
});

describe('PetManager — evolution', () => {
  const droplet = PET_SPECIES.find(s => s.id === 'droplet')!; // normalFeedCost:20, premiumFeedCost:10

  it('undecided pet stays undecided below both thresholds', () => {
    const { save, pets } = makeManagers();
    save.save.resources.normalFeed = 100;
    save.save.pets.push({
      id: 'p1', speciesId: 'droplet', name: 'Drop', stage: 0,
      path: 'undecided', normalFedTotal: 5, premiumFedTotal: 0,
      assignedTo: null, specialAbilityUnlocked: false,
    });
    pets.feedPet('p1', 'normal', 1);
    assert.strictEqual(save.save.pets[0].stage, 0);
    assert.strictEqual(save.save.pets[0].path, 'undecided');
  });

  it('takes LLM path and evolves when normalFed hits threshold', () => {
    const { save, pets } = makeManagers();
    // Give enough normal feed; premiumFed stays 0
    save.save.resources.normalFeed = 100;
    save.save.pets.push({
      id: 'p1', speciesId: 'droplet', name: 'Drop', stage: 0,
      path: 'undecided',
      normalFedTotal: droplet.normalFeedCost - 1, // one short
      premiumFedTotal: 0,
      assignedTo: null, specialAbilityUnlocked: false,
    });
    // This feed pushes normalFedTotal to threshold
    pets.feedPet('p1', 'normal', 1);
    assert.strictEqual(save.save.pets[0].path, 'llm');
    assert.strictEqual(save.save.pets[0].stage, 1);
  });

  it('takes manual path and evolves when premiumFed hits threshold', () => {
    const { save, pets } = makeManagers();
    save.save.resources.premiumFeed = 100;
    save.save.pets.push({
      id: 'p1', speciesId: 'droplet', name: 'Drop', stage: 0,
      path: 'undecided',
      normalFedTotal: 0,
      premiumFedTotal: droplet.premiumFeedCost - 1,
      assignedTo: null, specialAbilityUnlocked: false,
    });
    pets.feedPet('p1', 'premium', 1);
    assert.strictEqual(save.save.pets[0].path, 'manual');
    assert.strictEqual(save.save.pets[0].stage, 1);
  });

  it('LLM-path stage-1 pet does NOT require premium feed to reach stage 2', () => {
    const { save, pets } = makeManagers();
    save.save.resources.normalFeed = 100;
    // Already on LLM path, stage 1; premiumFedTotal stays 0
    save.save.pets.push({
      id: 'p1', speciesId: 'droplet', name: 'Drop', stage: 1,
      path: 'llm',
      normalFedTotal: droplet.normalFeedCost * 2 - 1,
      premiumFedTotal: 0,
      assignedTo: null, specialAbilityUnlocked: false,
    });
    pets.feedPet('p1', 'normal', 1);
    assert.strictEqual(save.save.pets[0].stage, 2);
  });

  it('does not exceed stage 2', () => {
    const { save, pets } = makeManagers();
    save.save.resources.normalFeed = 999;
    save.save.pets.push({
      id: 'p1', speciesId: 'droplet', name: 'Drop', stage: 2,
      path: 'llm',
      normalFedTotal: 9999, premiumFedTotal: 0,
      assignedTo: null, specialAbilityUnlocked: false,
    });
    pets.feedPet('p1', 'normal', 1);
    assert.strictEqual(save.save.pets[0].stage, 2);
  });
});

// ── CityManager ───────────────────────────────────────────────────────────────

describe('CityManager — tick', () => {
  it('farm produces normalFeed each tick', () => {
    const { save, city } = makeManagers();
    const before = save.save.resources.normalFeed;
    // Force elapsed time (set lastTickAt 60s ago)
    save.save.lastTickAt = Date.now() - 60_000;
    const result = city.tick();
    assert.ok(result.normalFeed >= 0, 'normalFeed should be non-negative');
    assert.ok(save.save.resources.normalFeed >= before);
  });

  it('caps offline gain at 10 minutes', () => {
    const { save, city } = makeManagers();
    // 2 hours offline — should behave the same as 10 minutes
    save.save.lastTickAt = Date.now() - 7_200_000;
    const result10 = city.tick();

    const { save: save2, city: city2 } = makeManagers();
    save2.save.lastTickAt = Date.now() - 600_000;
    const result600 = city2.tick();

    assert.strictEqual(result10.normalFeed, result600.normalFeed);
  });
});

describe('CityManager — upgradeBuilding', () => {
  it('rejects upgrade at max level (50)', () => {
    const { save, city } = makeManagers();
    save.save.city.buildings[0].level = 50;
    assert.strictEqual(city.upgradeBuilding('farm-1'), false);
  });

  it('charges at least 50 feed for free buildings (Farm, cost=0)', () => {
    const { save, city } = makeManagers();
    save.save.resources.normalFeed = 25; // below floor cost of 50*1*2=100
    assert.strictEqual(city.upgradeBuilding('farm-1'), false);
  });

  it('rejects when cityXP is below required gate', () => {
    const { save, city } = makeManagers();
    // Add a workshop with unlockXP=50
    save.save.city.buildings.push({ id: 'ws-1', typeId: 'workshop', level: 1 });
    save.save.resources.normalFeed = 9999;
    save.save.resources.cityXP = 0; // below gate of 50*1=50
    assert.strictEqual(city.upgradeBuilding('ws-1'), false);
  });

  it('upgrades successfully when conditions are met', () => {
    const { save, city } = makeManagers();
    save.save.resources.normalFeed = 9999;
    save.save.resources.cityXP = 9999;
    assert.ok(city.upgradeBuilding('farm-1'));
    assert.strictEqual(save.save.city.buildings[0].level, 2);
  });
});

// ── FeedTracker ───────────────────────────────────────────────────────────────

describe('FeedTracker — daily bonus', () => {
  it('grants bonus on first open (no lastActiveDate)', () => {
    const { save } = makeManagers();
    save.save.stats.lastActiveDate = '';
    const tracker = new FeedTracker(save, () => {});
    const got = tracker.checkDailyBonus();
    assert.ok(got);
    assert.ok(save.save.resources.normalFeed > 5); // started with 5, got bonus
    tracker.dispose();
  });

  it('does not grant bonus twice on the same day', () => {
    const { save } = makeManagers();
    const today = new Date().toISOString().slice(0, 10);
    save.save.stats.lastActiveDate = today;
    const tracker = new FeedTracker(save, () => {});
    assert.strictEqual(tracker.checkDailyBonus(), false);
    tracker.dispose();
  });

  it('increments streak on consecutive days', () => {
    const { save } = makeManagers();
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    save.save.stats.lastActiveDate = yesterday;
    save.save.stats.streakDays = 3;
    const tracker = new FeedTracker(save, () => {});
    tracker.checkDailyBonus();
    assert.strictEqual(save.save.stats.streakDays, 4);
    tracker.dispose();
  });

  it('resets streak on missed day', () => {
    const { save } = makeManagers();
    save.save.stats.lastActiveDate = '2020-01-01'; // long ago
    save.save.stats.streakDays = 10;
    const tracker = new FeedTracker(save, () => {});
    tracker.checkDailyBonus();
    assert.strictEqual(save.save.stats.streakDays, 1);
    tracker.dispose();
  });
});

describe('FeedTracker — feed conversion', () => {
  it('large insert → normalFeed (LLM)', () => {
    const { save } = makeManagers();
    save.save.resources.normalFeed = 0;
    const tracker = new FeedTracker(save, () => {});

    // Default charsPerNormalFeed = 200; insert 200 chars in one event (>8 = LLM)
    const bigText = 'x'.repeat(200);
    tracker.onTextChange(makeChangeEvent(bigText));

    assert.strictEqual(save.save.resources.normalFeed, 1);
    tracker.dispose();
  });

  it('small inserts → premiumFeed (manual)', () => {
    const { save } = makeManagers();
    save.save.resources.premiumFeed = 0;
    const tracker = new FeedTracker(save, () => {});

    // Default charsPerPremiumFeed = 100; 8 chars each time (≤8 threshold = manual)
    for (let i = 0; i < 13; i++) {
      tracker.onTextChange(makeChangeEvent('x'.repeat(8)));
    }

    assert.strictEqual(save.save.resources.premiumFeed, 1); // 13*8=104 ≥ 100
    tracker.dispose();
  });
});
