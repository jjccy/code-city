/**
 * Generates 32×32 building placeholder sprites for Code City.
 * Pure Node.js — no npm dependencies.
 *
 * Run: node scripts/generate-sprites.js
 */
'use strict';
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── PNG encoder ──────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) { c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); }
    t[i] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) { c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); }
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function pngChunk(type, data) {
  const tb = Buffer.from(type, 'ascii');
  const db = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const lb = Buffer.allocUnsafe(4); lb.writeUInt32BE(db.length);
  const cb = Buffer.allocUnsafe(4); cb.writeUInt32BE(crc32(Buffer.concat([tb, db])));
  return Buffer.concat([lb, tb, db, cb]);
}
function encodePNG(width, height, rgba) {
  const raw = Buffer.allocUnsafe(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // filter type None
    const rowStart = y * width * 4;
    for (let x = 0; x < width; x++) {
      const dst = y * (1 + width * 4) + 1 + x * 4;
      raw[dst]   = rgba[rowStart + x*4];
      raw[dst+1] = rgba[rowStart + x*4 + 1];
      raw[dst+2] = rgba[rowStart + x*4 + 2];
      raw[dst+3] = rgba[rowStart + x*4 + 3];
    }
  }
  const idat = zlib.deflateSync(raw, { level: 6 });
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(width,  0); ihdr.writeUInt32BE(height, 4);
  ihdr[8]=8; ihdr[9]=6; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Drawing context factory ──────────────────────────────────────────────────
// Returns drawing helpers bound to the given buffer and its width/height.
function makeCtx(rgba, W, H) {
  function px(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= W || y < 0 || y >= H) { return; }
    const i = (y * W + x) * 4;
    rgba[i]=r; rgba[i+1]=g; rgba[i+2]=b; rgba[i+3]=a;
  }
  function rect(x, y, w, h, r, g, b, a = 255) {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) { px(x+dx, y+dy, r, g, b, a); }
    }
  }
  function circle(cx, cy, rad, r, g, b, a = 255) {
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        if (dx*dx+dy*dy <= rad*rad) { px(cx+dx, cy+dy, r, g, b, a); }
      }
    }
  }
  function outline(x, y, w, h, r, g, b, a = 255) {
    for (let dx = 0; dx < w; dx++) { px(x+dx,y,r,g,b,a); px(x+dx,y+h-1,r,g,b,a); }
    for (let dy = 0; dy < h; dy++) { px(x,y+dy,r,g,b,a); px(x+w-1,y+dy,r,g,b,a); }
  }
  function dot(cx, cy, r, g, b) {
    px(cx,cy,r,g,b); px(cx+1,cy,r,g,b); px(cx,cy+1,r,g,b); px(cx+1,cy+1,r,g,b);
  }
  return { px, rect, circle, outline, dot };
}

// ── Building sprites (32×32) ──────────────────────────────────────────────────
function drawBuilding(id) {
  const BW = 32, BH = 32;
  const rgba = new Uint8Array(BW * BH * 4);
  const { px, rect, circle, outline, dot } = makeCtx(rgba, BW, BH);

  if (id === 'farm') {
    rect(0, 22, 32, 10, 100, 160, 60);         // ground
    rect(6, 10, 20, 13, 180, 100, 60);         // barn body
    for (let i = 0; i < 8; i++) {              // roof triangle
      const w = (i+1)*2+2, x = 16-(i+1);
      rect(Math.max(0,x), 10-i, Math.min(w,32-Math.max(0,x)), 1, 200,50,50);
    }
    rect(13, 16,  6,  7, 120, 70, 40);         // door
    rect( 7, 12,  5,  4, 200,220,240);         // window
    rect(2, 22, 13, 1, 160,130,90);            // fence rail left
    rect(17,22, 13, 1, 160,130,90);            // fence rail right
    for (let i of [2,7,12,17,22,27]) { rect(i, 22, 2, 5, 160,130,90); } // posts
  }

  if (id === 'workshop') {
    rect(0, 24, 32, 8, 100, 90, 80);           // ground
    rect(4, 9, 24, 16, 140,130,120);           // building body
    for (let r = 0; r < 3; r++) {              // stone bricks
      for (let c = 0; c < 3; c++) { outline(4+c*8, 9+r*5, 8, 5, 100,90,80); }
    }
    rect(4, 5, 24, 4, 90,80,70);              // roof
    rect(20, 1, 4, 8, 110,100,90);            // chimney
    px(21, 0, 200,200,200); px(22, 0, 200,200,200, 120); // smoke
    rect(12, 17, 8, 8, 60,50,40);             // door
    rect( 6, 11, 5, 4, 150,200,220);          // window L
    rect(21, 11, 5, 4, 150,200,220);          // window R
    rect( 8, 19, 6, 2, 60,60,70);             // anvil top
    rect( 7, 21, 8, 1, 60,60,70);             // anvil base
  }

  if (id === 'library') {
    rect(0, 25, 32, 7, 90,80,110);            // ground
    rect(3, 8, 26, 17, 100,80,150);           // body
    for (let c of [4, 13, 22]) { rect(c, 8, 3, 17, 220,210,230); } // columns
    for (let i = 0; i < 6; i++) {             // pediment
      rect(3+i, 8-i, 26-i*2, 1, 120,100,170);
    }
    rect(4, 25, 24, 2, 200,190,210);          // steps top
    rect(6, 23, 20, 2, 210,200,220);          // steps base
    rect(12, 15, 8, 10, 80,60,110);           // door
    rect( 6, 11, 3, 8, 220,100,100);          // book red
    rect( 9, 11, 3, 8, 100,180,100);          // book green
    rect(17, 11, 3, 8, 100,100,220);          // book blue
    rect(20, 11, 3, 8, 220,180,100);          // book yellow
  }

  if (id === 'mine') {
    rect(0,  0, 32, 32, 80,60,40);            // earth
    rect(0,  0, 32, 22, 60,50,45);            // dark rock face
    // arch
    for (let i = 0; i <= 7; i++) {
      const ang = (i/7)*Math.PI;
      const ax = Math.round(16+Math.cos(ang)*10), ay = Math.round(14-Math.sin(ang)*7);
      rect(ax-1, ay-1, 3, 3, 140,120,90);
    }
    rect(7, 8, 18, 14, 20,15,10);             // tunnel entrance
    rect(7, 8,  3, 14, 160,120,60);           // support L
    rect(22,8,  3, 14, 160,120,60);           // support R
    rect(7, 9, 18,  3, 140,100,50);           // lintel
    // ore spots
    dot( 3,  3, 200,160,50);                  // gold
    dot(26,  5, 150,100,200);                 // purple ore
    dot( 5, 16, 100,200,150);                 // emerald
    // rail
    rect(10, 23, 14, 1, 150,140,120);
    rect(10, 25, 14, 1, 150,140,120);
    // cart
    rect(12, 20, 8, 5, 160,130,80);
    rect(13, 21, 6, 3, 50,40,30);
    dot(13, 25, 100,90,80); dot(18, 25, 100,90,80); // wheels
  }

  if (id === 'tower') {
    rect(0, 0, 32, 32, 50,60,100, 60);        // sky
    rect(9, 5, 14, 22, 130,140,160);          // body
    for (let r = 0; r < 4; r++) {             // stone blocks
      for (let c = 0; c < 2; c++) { outline(9+c*7, 5+r*5, 7, 5, 100,110,130); }
    }
    // battlements
    rect( 9, 2, 3, 4, 120,130,150);
    rect(15, 2, 2, 4, 120,130,150);
    rect(20, 2, 3, 4, 120,130,150);
    rect( 9, 5, 14, 1, 100,110,130);
    // arrow slits
    rect(14,11, 4,1, 40,45,55); rect(15,10, 2,3, 40,45,55);
    rect(14,17, 4,1, 40,45,55); rect(15,16, 2,3, 40,45,55);
    // gate
    rect(12,20, 8,7, 50,55,65);
    for (let i = 0; i <= 3; i++) {
      const ang=(i/3)*Math.PI;
      rect(Math.round(16+Math.cos(ang)*4)-1, Math.round(20-Math.sin(ang)*3), 2,1, 130,140,160);
    }
    // flag
    rect(23, 0, 1, 7, 180,160,120);
    rect(24, 1, 4, 3, 200,80,80);
    // base
    rect(7,25,18,2, 120,130,150);
    rect(5,27,22,5, 110,120,140);
  }

  return rgba;
}

// ── Main ─────────────────────────────────────────────────────────────────────
const bldDir = path.join(__dirname, '..', 'media', 'sprites', 'buildings');
fs.mkdirSync(bldDir, { recursive: true });

for (const id of ['farm','workshop','library','mine','tower']) {
  const rgba = drawBuilding(id);
  const png  = encodePNG(32, 32, rgba);
  fs.writeFileSync(path.join(bldDir, `${id}.png`), png);
  console.log(`✓  buildings/${id}.png  (${png.length} B)`);
}

console.log('\nDone! Replace with real CC0 art: https://kenney.nl/assets (Tiny Town pack, CC0)');
