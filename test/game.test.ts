import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

import { SaveManager } from '../src/game/save-manager';
import { PetManager } from '../src/game/pet-manager';
import { CityManager } from '../src/game/city-manager';
import { FeedTracker } from '../src/game/feed-tracker';
import { PET_SPECIES, HATCH_COST } from '../src/game/game-data';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'code-city-test-'));
}

function makeManagers() {
  const dir  = makeTmpDir();
  const save = new SaveManager(dir);
  save.load();
  const city = new CityManager(save);
  const pets = new PetManager(save, city);
  return { save, pets, city, dir };
}

function makeFeedTracker(save: SaveManager, city: CityManager, cb = () => {}) {
  return new FeedTracker(save, city, cb);
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

describe('PetManager — hatch cost', () => {
  it('addPetDirect deducts hatch cost from normalFeed', () => {
    const { save, pets } = makeManagers();
    save.save.resources.normalFeed = 50;
    pets.addPetDirect('ember', 'Blaze');
    assert.strictEqual(save.save.resources.normalFeed, 50 - HATCH_COST);
    assert.strictEqual(save.save.pets.length, 1);
  });

  it('addPetDirect returns undefined when normalFeed < hatch cost', () => {
    const { save, pets } = makeManagers();
    save.save.resources.normalFeed = HATCH_COST - 1;
    const result = pets.addPetDirect('ember', 'Blaze');
    assert.strictEqual(result, undefined);
    assert.strictEqual(save.save.pets.length, 0);
  });
});

describe('PetManager — evolution', () => {
  const droplet = PET_SPECIES.find(s => s.id === 'droplet')!; // normalFeedCost:40, premiumFeedCost:20

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
    save.save.resources.normalFeed = 100;
    save.save.pets.push({
      id: 'p1', speciesId: 'droplet', name: 'Drop', stage: 0,
      path: 'undecided',
      normalFedTotal: droplet.normalFeedCost - 1,
      premiumFedTotal: 0,
      assignedTo: null, specialAbilityUnlocked: false,
    });
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

  it('LLM-path stage-1→2 evolution requires 5 rareMaterials', () => {
    const { save, pets } = makeManagers();
    save.save.resources.normalFeed = 100;
    save.save.resources.rareMaterials = 0; // not enough
    save.save.pets.push({
      id: 'p1', speciesId: 'droplet', name: 'Drop', stage: 1,
      path: 'llm',
      normalFedTotal: droplet.normalFeedCost * 2 - 1,
      premiumFedTotal: 0,
      assignedTo: null, specialAbilityUnlocked: false,
    });
    pets.feedPet('p1', 'normal', 1);
    assert.strictEqual(save.save.pets[0].stage, 1, 'should not evolve without rareMaterials');
  });

  it('LLM-path stage-1→2 evolves when rareMaterials >= 5', () => {
    const { save, pets } = makeManagers();
    save.save.resources.normalFeed = 100;
    save.save.resources.rareMaterials = 5;
    save.save.pets.push({
      id: 'p1', speciesId: 'droplet', name: 'Drop', stage: 1,
      path: 'llm',
      normalFedTotal: droplet.normalFeedCost * 2 - 1,
      premiumFedTotal: 0,
      assignedTo: null, specialAbilityUnlocked: false,
    });
    pets.feedPet('p1', 'normal', 1);
    assert.strictEqual(save.save.pets[0].stage, 2);
    assert.strictEqual(save.save.resources.rareMaterials, 0, 'should consume 5 rareMaterials');
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

  it('library discount reduces effective evolution threshold', () => {
    const { save, city, pets } = makeManagers();
    // Add a library at level 10 → 20% discount → threshold * 0.80
    save.save.city.buildings.push({ id: 'lib-1', typeId: 'library', level: 10 });
    save.save.resources.premiumFeed = 100;

    // droplet premiumFeedCost: 20. Stage 0→1 threshold = 20. With 20% discount: ceil(20 * 0.8) = 16
    save.save.pets.push({
      id: 'p1', speciesId: 'droplet', name: 'Drop', stage: 0,
      path: 'undecided',
      normalFedTotal: 0,
      premiumFedTotal: 15, // normally 20 needed, discounted to 16
      assignedTo: null, specialAbilityUnlocked: false,
    });
    // One more premium feed → 16 total, should hit discounted threshold
    pets.feedPet('p1', 'premium', 1);
    assert.strictEqual(save.save.pets[0].stage, 1, 'should evolve at discounted threshold');
  });

  it('Oracle ability (evolution multiplier 0.5) further reduces threshold', () => {
    const { save, pets } = makeManagers();
    // Add an active Oracle ability (evolution mult 0.5)
    save.save.activeAbilities.push({
      petId: 'oracle-pet',
      target: 'evolution',
      multiplier: 0.5,
      expiresAt: Date.now() + 300_000,
    });
    save.save.resources.premiumFeed = 100;

    // droplet premiumFeedCost: 20. With Oracle 0.5: ceil(20 * 0.5) = 10
    save.save.pets.push({
      id: 'p1', speciesId: 'droplet', name: 'Drop', stage: 0,
      path: 'undecided',
      normalFedTotal: 0,
      premiumFedTotal: 9, // normally needs 20, with oracle needs 10
      assignedTo: null, specialAbilityUnlocked: false,
    });
    pets.feedPet('p1', 'premium', 1);
    assert.strictEqual(save.save.pets[0].stage, 1, 'Oracle should allow evolution at 10 feed');
    // Oracle ability should be consumed
    assert.strictEqual(save.save.activeAbilities.length, 0, 'Oracle ability should be consumed on evolution');
  });
});

describe('PetManager — useAbility', () => {
  it('useAbility fails for non-stage-2 pets', () => {
    const { save, pets } = makeManagers();
    save.save.pets.push({
      id: 'p1', speciesId: 'ember', name: 'Blaze', stage: 1,
      path: 'manual', normalFedTotal: 0, premiumFedTotal: 0,
      assignedTo: null, specialAbilityUnlocked: true,
    });
    assert.strictEqual(pets.useAbility('p1'), false);
  });

  it('useAbility fails for LLM-path pets', () => {
    const { save, pets } = makeManagers();
    save.save.pets.push({
      id: 'p1', speciesId: 'ember', name: 'Titan', stage: 2,
      path: 'llm', normalFedTotal: 0, premiumFedTotal: 0,
      assignedTo: null, specialAbilityUnlocked: true,
    });
    assert.strictEqual(pets.useAbility('p1'), false);
  });

  it('useAbility fails when specialAbilityUnlocked is false', () => {
    const { save, pets } = makeManagers();
    save.save.pets.push({
      id: 'p1', speciesId: 'ember', name: 'Seraph', stage: 2,
      path: 'manual', normalFedTotal: 0, premiumFedTotal: 0,
      assignedTo: null, specialAbilityUnlocked: false,
    });
    assert.strictEqual(pets.useAbility('p1'), false);
  });

  it('useAbility adds to activeAbilities and clears flag', () => {
    const { save, pets } = makeManagers();
    save.save.pets.push({
      id: 'p1', speciesId: 'ember', name: 'Seraph', stage: 2,
      path: 'manual', normalFedTotal: 0, premiumFedTotal: 0,
      assignedTo: null, specialAbilityUnlocked: true,
    });
    const ok = pets.useAbility('p1');
    assert.ok(ok);
    assert.strictEqual(save.save.pets[0].specialAbilityUnlocked, false);
    assert.strictEqual(save.save.activeAbilities.length, 1);
    const ab = save.save.activeAbilities[0];
    assert.strictEqual(ab.petId, 'p1');
    assert.strictEqual(ab.target, 'xp'); // Seraph → xp
    assert.strictEqual(ab.multiplier, 2);
    assert.ok(ab.expiresAt > Date.now());
  });

  it('forceResetAbility re-enables the ability flag', () => {
    const { save, pets } = makeManagers();
    save.save.pets.push({
      id: 'p1', speciesId: 'spark', name: 'Storm', stage: 2,
      path: 'manual', normalFedTotal: 0, premiumFedTotal: 0,
      assignedTo: null, specialAbilityUnlocked: false,
    });
    pets.forceResetAbility('p1');
    assert.ok(save.save.pets[0].specialAbilityUnlocked);
  });
});

// ── CityManager ───────────────────────────────────────────────────────────────

describe('CityManager — tick', () => {
  it('farm produces normalFeed each tick', () => {
    const { save, city } = makeManagers();
    const before = save.save.resources.normalFeed;
    save.save.lastTickAt = Date.now() - 60_000;
    const result = city.tick();
    assert.ok(result.normalFeed >= 0, 'normalFeed should be non-negative');
    assert.ok(save.save.resources.normalFeed >= before);
  });

  it('caps offline gain at 10 minutes', () => {
    const { save, city } = makeManagers();
    save.save.lastTickAt = Date.now() - 7_200_000;
    const result10 = city.tick();

    const { save: save2, city: city2 } = makeManagers();
    save2.save.lastTickAt = Date.now() - 600_000;
    const result600 = city2.tick();

    assert.strictEqual(result10.normalFeed, result600.normalFeed);
  });

  it('mine produces rareMaterials each tick', () => {
    const { save, city } = makeManagers();
    save.save.city.buildings.push({ id: 'mine-1', typeId: 'mine', level: 1 });
    save.save.lastTickAt = Date.now() - 60_000;
    const result = city.tick();
    assert.ok(result.rareMaterials > 0, 'mine should produce rareMaterials');
  });

  it('tower multiplier scales farm output', () => {
    const { save, city } = makeManagers();
    save.save.lastTickAt = Date.now() - 60_000;
    const baseFarm = city.tick();

    const { save: save2, city: city2 } = makeManagers();
    save2.save.city.buildings.push({ id: 'tower-1', typeId: 'tower', level: 5 }); // +50%
    save2.save.lastTickAt = Date.now() - 60_000;
    const withTower = city2.tick();

    assert.ok(withTower.normalFeed > baseFarm.normalFeed, 'tower should increase farm output');
  });

  it('active xp multiplier scales workshop output', () => {
    const { save, city } = makeManagers();
    save.save.city.buildings.push({ id: 'ws-1', typeId: 'workshop', level: 1 });
    save.save.lastTickAt = Date.now() - 60_000;
    const base = city.tick();

    const { save: save2, city: city2 } = makeManagers();
    save2.save.city.buildings.push({ id: 'ws-1', typeId: 'workshop', level: 1 });
    save2.save.activeAbilities.push({
      petId: 'p1', target: 'xp', multiplier: 2, expiresAt: Date.now() + 300_000,
    });
    save2.save.lastTickAt = Date.now() - 60_000;
    const withXP = city2.tick();

    assert.ok(withXP.cityXP > base.cityXP, 'xp multiplier should increase workshop output');
  });
});

describe('CityManager — getTowerMultiplier', () => {
  it('returns 1.0 with no towers', () => {
    const { city } = makeManagers();
    assert.strictEqual(city.getTowerMultiplier(), 1);
  });

  it('returns 1 + 0.1 * totalLevel', () => {
    const { save, city } = makeManagers();
    save.save.city.buildings.push({ id: 'tower-1', typeId: 'tower', level: 3 });
    // total level = 3 → 1 + 0.3 = 1.3
    assert.strictEqual(city.getTowerMultiplier(), 1.3);
  });

  it('stacks multiple towers', () => {
    const { save, city } = makeManagers();
    save.save.city.buildings.push({ id: 'tower-1', typeId: 'tower', level: 2 });
    save.save.city.buildings.push({ id: 'tower-2', typeId: 'tower', level: 3 });
    // total level = 5 → 1 + 0.5 = 1.5
    assert.strictEqual(city.getTowerMultiplier(), 1.5);
  });
});

describe('CityManager — getTotalLibraryDiscount', () => {
  it('returns 0 with no libraries', () => {
    const { city } = makeManagers();
    assert.strictEqual(city.getTotalLibraryDiscount(), 0);
  });

  it('returns 2% per library level', () => {
    const { save, city } = makeManagers();
    save.save.city.buildings.push({ id: 'lib-1', typeId: 'library', level: 5 });
    // 5 levels → 10%
    const disc = city.getTotalLibraryDiscount();
    assert.ok(Math.abs(disc - 0.10) < 0.001, `expected ~0.10, got ${disc}`);
  });

  it('caps at 50%', () => {
    const { save, city } = makeManagers();
    save.save.city.buildings.push({ id: 'lib-1', typeId: 'library', level: 50 }); // 100% without cap
    assert.strictEqual(city.getTotalLibraryDiscount(), 0.5);
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
    const { save, city } = makeManagers();
    save.save.stats.lastActiveDate = '';
    const tracker = makeFeedTracker(save, city);
    const got = tracker.checkDailyBonus();
    assert.ok(got);
    assert.ok(save.save.resources.normalFeed > 5);
    tracker.dispose();
  });

  it('does not grant bonus twice on the same day', () => {
    const { save, city } = makeManagers();
    const today = new Date().toISOString().slice(0, 10);
    save.save.stats.lastActiveDate = today;
    const tracker = makeFeedTracker(save, city);
    assert.strictEqual(tracker.checkDailyBonus(), false);
    tracker.dispose();
  });

  it('increments streak on consecutive days', () => {
    const { save, city } = makeManagers();
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    save.save.stats.lastActiveDate = yesterday;
    save.save.stats.streakDays = 3;
    const tracker = makeFeedTracker(save, city);
    tracker.checkDailyBonus();
    assert.strictEqual(save.save.stats.streakDays, 4);
    tracker.dispose();
  });

  it('resets streak on missed day', () => {
    const { save, city } = makeManagers();
    save.save.stats.lastActiveDate = '2020-01-01';
    save.save.stats.streakDays = 10;
    const tracker = makeFeedTracker(save, city);
    tracker.checkDailyBonus();
    assert.strictEqual(save.save.stats.streakDays, 1);
    tracker.dispose();
  });
});

describe('FeedTracker — feed conversion', () => {
  it('large insert → normalFeed (LLM)', () => {
    const { save, city } = makeManagers();
    save.save.resources.normalFeed = 0;
    const tracker = makeFeedTracker(save, city);

    const bigText = 'x'.repeat(200);
    tracker.onTextChange(makeChangeEvent(bigText));

    assert.strictEqual(save.save.resources.normalFeed, 1);
    tracker.dispose();
  });

  it('small inserts → premiumFeed (manual)', () => {
    const { save, city } = makeManagers();
    save.save.resources.premiumFeed = 0;
    const tracker = makeFeedTracker(save, city);

    for (let i = 0; i < 13; i++) {
      tracker.onTextChange(makeChangeEvent('x'.repeat(8)));
    }

    assert.strictEqual(save.save.resources.premiumFeed, 1);
    tracker.dispose();
  });
});

describe('FeedTracker — getStreakIdleMs', () => {
  it('returns base idle ms with no active abilities', () => {
    const { save, city } = makeManagers();
    const tracker = makeFeedTracker(save, city);
    assert.strictEqual(tracker.getStreakIdleMs(), 10_000);
    tracker.dispose();
  });

  it('doubles idle time when Leviathan streak ability is active', () => {
    const { save, city } = makeManagers();
    save.save.activeAbilities.push({
      petId: 'lev-pet',
      target: 'streak',
      multiplier: 2,
      expiresAt: Date.now() + 300_000,
    });
    const tracker = makeFeedTracker(save, city);
    assert.strictEqual(tracker.getStreakIdleMs(), 20_000);
    tracker.dispose();
  });
});
