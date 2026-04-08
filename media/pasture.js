// ── Pasture Engine ─────────────────────────────────────────────────────────
// Sprite animation for the 🌿 Pasture tab.
// Reads global `state` set by the main.html message handler.

const FRAME_MS = 1000 / 20; // 20 FPS = 50ms per frame

// Frame coordinates within each per-species PNG (source: messy_1.png, 786×326).
// Baby  = stage 0 (blob);  Mid = stage 1 (same frames, 1.5× scale);  Final = stage 2 (humanoid).
const PET_FRAMES = {
  baby: {
    idle: [                              // blob idle — top-left section y=4 h=95
      { sx:   0, sy:  4, sw: 65, sh: 95 },
      { sx:  65, sy:  4, sw: 65, sh: 95 },
      { sx: 130, sy:  4, sw: 65, sh: 95 },
      { sx: 195, sy:  4, sw: 65, sh: 95 },
    ],
    action: [                            // blob action — same row, x=258
      { sx: 258, sy:  4, sw: 65, sh: 95 },
      { sx: 323, sy:  4, sw: 65, sh: 95 },
      { sx: 387, sy:  4, sw: 65, sh: 95 },
      { sx: 451, sy:  4, sw: 65, sh: 95 },
    ],
    walk: [                              // baby walk — right section y=4, faces LEFT
      { sx: 550, sy:  4, sw: 59, sh: 53 },
      { sx: 609, sy:  4, sw: 59, sh: 53 },
      { sx: 668, sy:  4, sw: 59, sh: 53 },
      { sx: 727, sy:  4, sw: 59, sh: 53 },
    ],
    walkFacesLeft: true,                 // flip horizontally when moving right
  },
  final: {
    idle: [                              // humanoid idle — y=115 h=121
      { sx:   0, sy: 115, sw: 65, sh: 121 },
      { sx:  65, sy: 115, sw: 65, sh: 121 },
      { sx: 130, sy: 115, sw: 65, sh: 121 },
      { sx: 195, sy: 115, sw: 65, sh: 121 },
    ],
    action: [                            // fire burst — variable height, bottom-anchored
      { sx: 393, sy: 175, sw: 55, sh:  61 },   // intro 0
      { sx: 468, sy: 144, sw: 54, sh:  92 },   // intro 1
      { sx: 550, sy: 153, sw: 38, sh:  83 },   // loop start →
      { sx: 588, sy: 166, sw: 66, sh:  70 },
      { sx: 654, sy: 152, sw: 66, sh:  84 },
      { sx: 720, sy: 151, sw: 51, sh:  85 },
    ],
    actionLoopStart: 2,                  // play frames 0-1 as intro, then loop 2-5
    walk: [                              // humanoid walk — y=255 h=57, faces LEFT
      { sx:   5, sy: 255, sw: 42, sh: 57 },
      { sx:  47, sy: 255, sw: 42, sh: 57 },
      { sx:  87, sy: 255, sw: 42, sh: 57 },
      { sx: 130, sy: 255, sw: 42, sh: 57 },
      { sx: 175, sy: 255, sw: 42, sh: 57 },
      { sx: 217, sy: 255, sw: 42, sh: 57 },
      { sx: 260, sy: 255, sw: 42, sh: 57 },
    ],
    walkFacesLeft: true,                // flip horizontally when moving right
  },
};

// ── Sprite loader ───────────────────────────────────────────────────────────

const spriteCache = {};
function loadSprite(key, url) {
  if (spriteCache[key]) { return spriteCache[key]; }
  const img = new Image();
  img.src = url;
  img.onerror = () => { img._failed = true; };
  spriteCache[key] = img;
  return img;
}

// ── PetSprite ───────────────────────────────────────────────────────────────

class PetSprite {
  constructor(pet, W, H) {
    this.pet    = pet;
    this.x      = 32 + Math.random() * (W - 64);
    this.y      = 32 + Math.random() * (H - 64);
    this.facing = 1; // 1 = right, -1 = left
    this.frame  = 0;
    this.frameTimer  = 0;
    this.state       = 'idle';
    this.stateTimer  = 1500 + Math.random() * 1500;
    this.targetX = this.x;
    this.targetY = this.y;
    this.speed   = 40 + Math.random() * 25;
  }

  _anim() { return this.pet.stage >= 2 ? PET_FRAMES.final : PET_FRAMES.baby; }

  _nextState(W, H) {
    const seq = { walk: 'idle', idle: 'action', action: 'walk' };
    const dur = { walk: [2000, 4000], idle: [1200, 3000], action: [600, 1400] };
    this.state = seq[this.state];
    const [lo, hi] = dur[this.state];
    this.stateTimer = lo + Math.random() * (hi - lo);
    this.frame = 0;
    if (this.state === 'walk') {
      const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 90;
      this.targetX = Math.max(16, Math.min((W || 300) - 16, this.x + Math.cos(a) * d));
      this.targetY = Math.max(16, Math.min((H || 400) - 16, this.y + Math.sin(a) * d));
      this.facing  = this.targetX > this.x ? 1 : -1;
    }
  }

  update(dt, W, H) {
    this.frameTimer += dt;
    const anim   = this._anim();
    const frames = anim[this.state];
    if (this.frameTimer >= FRAME_MS) {
      this.frameTimer -= FRAME_MS;
      this.frame++;
      const loopStart = (this.state === 'action' && anim.actionLoopStart != null)
        ? anim.actionLoopStart : 0;
      if (this.frame >= frames.length) { this.frame = loopStart; }
    }
    this.stateTimer -= dt;
    if (this.stateTimer <= 0) { this._nextState(W, H); }
    if (this.state === 'walk') {
      const dx = this.targetX - this.x, dy = this.targetY - this.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 2) { this._nextState(W, H); }
      else { const step = this.speed * dt / 1000; this.x += dx / len * step; this.y += dy / len * step; }
    }
  }

  draw(ctx, spriteUris) {
    const anim   = this._anim();
    const frames = anim[this.state];
    const f      = frames[this.frame % frames.length];
    const sc     = this.pet.stage === 0 ? 1 : this.pet.stage === 1 ? 1.5 : 2;
    const dw     = Math.round(f.sw * sc);
    const dh     = Math.round(f.sh * sc);
    const dx     = Math.round(this.x - dw / 2);
    // action = bottom-anchored (fire grows upward); others = center-anchored
    const dy = this.state === 'action'
      ? Math.round(this.y - dh)
      : Math.round(this.y - dh / 2);

    // Flip: baby walk faces left → flip right; final walk faces right → flip left
    const shouldFlip = this.state === 'walk'
      ? (anim.walkFacesLeft ? this.facing === 1 : this.facing === -1)
      : false;

    const img = spriteUris && spriteUris.pets
      ? loadSprite(this.pet.speciesId, spriteUris.pets[this.pet.speciesId])
      : null;

    ctx.save();
    if (shouldFlip) { ctx.translate(Math.round(this.x) * 2, 0); ctx.scale(-1, 1); }

    if (img && img.complete && !img._failed) {
      ctx.drawImage(img, f.sx, f.sy, f.sw, f.sh, dx, dy, dw, dh);
    } else {
      ctx.font         = `${Math.round(22 * sc)}px serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.pet.form.emoji, Math.round(this.x), Math.round(this.y));
    }
    ctx.restore();

    const labelY = this.state === 'action'
      ? Math.round(this.y + 2)
      : Math.round(this.y + dh / 2 + 2);
    ctx.font         = '9px sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle    = 'rgba(255,255,255,0.65)';
    ctx.fillText(this.pet.name, Math.round(this.x), labelY);
  }
}

// ── Loop ────────────────────────────────────────────────────────────────────

let pastureSprites  = [];
let pastureRafId    = null;
let pastureLastTime = 0;
let pastureActive   = false;

function startPasture() {
  if (pastureRafId) { return; }
  pastureLastTime = performance.now();
  pastureRafId = requestAnimationFrame(pastureLoop);
}

function stopPasture() {
  if (pastureRafId) { cancelAnimationFrame(pastureRafId); pastureRafId = null; }
}

function pastureLoop(now) {
  if (!pastureActive) { pastureRafId = null; return; }
  pastureRafId = requestAnimationFrame(pastureLoop);
  const dt = Math.min(now - pastureLastTime, 100); // cap at 100ms after tab unfocus
  pastureLastTime = now;

  const canvas = document.getElementById('pasture-canvas');
  if (!canvas) { return; }
  const ctx = canvas.getContext('2d');
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#2d4a22');
  grad.addColorStop(1, '#1a2e14');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth   = 1;
  for (let x = 0; x <= W; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  const uris = state && state.spriteUris ? state.spriteUris : null;
  for (const s of pastureSprites) { s.update(dt, W, H); s.draw(ctx, uris); }
}

// ── Sync ────────────────────────────────────────────────────────────────────

function syncPastureSprites() {
  if (!state) { return; }
  const canvas = document.getElementById('pasture-canvas');
  const W = canvas ? canvas.clientWidth  || 300 : 300;
  const H = canvas ? canvas.clientHeight || 400 : 400;
  const curIds   = new Set(state.pets.map(p => p.id));
  pastureSprites = pastureSprites.filter(s => curIds.has(s.pet.id));
  const existIds = new Set(pastureSprites.map(s => s.pet.id));
  for (const s of pastureSprites) {
    const u = state.pets.find(p => p.id === s.pet.id);
    if (u) { s.pet = u; }
  }
  for (const pet of state.pets) {
    if (!existIds.has(pet.id)) { pastureSprites.push(new PetSprite(pet, W, H)); }
  }
  const el = document.getElementById('pasture-empty');
  if (el) { el.style.display = pastureSprites.length === 0 ? '' : 'none'; }
}
