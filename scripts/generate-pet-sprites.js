/**
 * Generates per-pet sprite PNGs by hue-rotating messy_1.png.
 * Output: media/sprites/pets/{ember,sprout,droplet,spark}.png
 *
 * Run: node scripts/generate-pet-sprites.js
 */
'use strict';
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── PNG codec ────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const tb = Buffer.from(type, 'ascii');
  const db = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const lb = Buffer.allocUnsafe(4); lb.writeUInt32BE(db.length);
  const cb = Buffer.allocUnsafe(4); cb.writeUInt32BE(crc32(Buffer.concat([tb, db])));
  return Buffer.concat([lb, tb, db, cb]);
}
function encodePNG(W, H, rgba) {
  const raw = Buffer.allocUnsafe(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0;
    for (let x = 0; x < W; x++) {
      const d = y * (1 + W * 4) + 1 + x * 4, s = (y * W + x) * 4;
      raw[d] = rgba[s]; raw[d+1] = rgba[s+1]; raw[d+2] = rgba[s+2]; raw[d+3] = rgba[s+3];
    }
  }
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(W,0); ihdr.writeUInt32BE(H,4);
  ihdr[8]=8; ihdr[9]=6; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, {level:6})),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function decodePNG(buf) {
  const W = buf.readUInt32BE(16), H = buf.readUInt32BE(20);
  let pos = 8; const idats = [];
  while (pos < buf.length - 4) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii',pos+4,pos+8);
    if (type === 'IDAT') idats.push(buf.slice(pos+8, pos+8+len));
    if (type === 'IEND') break;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idats));
  const bpp = 4, rs = W * bpp;
  const px = new Uint8Array(H * rs);
  for (let y = 0; y < H; y++) {
    const f = raw[y*(rs+1)], src = raw.slice(y*(rs+1)+1, y*(rs+1)+1+rs);
    const dst = px.subarray(y*rs, y*rs+rs);
    const prv = y > 0 ? px.subarray((y-1)*rs, y*rs) : new Uint8Array(rs);
    for (let x = 0; x < rs; x++) {
      const a=x>=bpp?dst[x-bpp]:0, b=prv[x], c=x>=bpp?prv[x-bpp]:0;
      dst[x] = f===0?src[x]:f===1?(src[x]+a)&255:f===2?(src[x]+b)&255:
        f===3?(src[x]+Math.floor((a+b)/2))&255:(()=>{
          const pa=Math.abs(b-c),pb=Math.abs(a-c),pc=Math.abs(a+b-2*c);
          return(src[x]+(pa<=pb&&pa<=pc?a:pb<=pc?b:c))&255;
        })();
    }
  }
  return { W, H, px };
}

// ── Colour transform ─────────────────────────────────────────────────────────
function rotateHue(r, g, b, deg) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max-min;
  let h=0, s=0, l=(max+min)/2;
  if (d > 0) {
    s = l > 0.5 ? d/(2-max-min) : d/(max+min);
    if      (max===r) h = ((g-b)/d + (g<b?6:0));
    else if (max===g) h = (b-r)/d + 2;
    else              h = (r-g)/d + 4;
    h /= 6;
  }
  h = ((h + deg/360) % 1 + 1) % 1;
  if (s === 0) { const v = Math.round(l*255); return [v,v,v]; }
  const q = l < 0.5 ? l*(1+s) : l+s-l*s, p = 2*l-q;
  function h2r(t) {
    t = ((t%1)+1)%1;
    if (t<1/6) return p+(q-p)*6*t;
    if (t<1/2) return q;
    if (t<2/3) return p+(q-p)*(2/3-t)*6;
    return p;
  }
  return [Math.round(h2r(h+1/3)*255), Math.round(h2r(h)*255), Math.round(h2r(h-1/3)*255)];
}

// ── Species hue rotations ────────────────────────────────────────────────────
const SPECIES = [
  { id: 'ember',   deg:   0 },   // original fire (orange-yellow)
  { id: 'sprout',  deg:  90 },   // plant (green)
  { id: 'droplet', deg: 165 },   // water (blue)
  { id: 'spark',   deg: 220 },   // electric (purple-magenta/lightning)
];

// ── Main ─────────────────────────────────────────────────────────────────────
const src = path.join(__dirname, '..', 'media', 'sprites', 'messy_1.png');
const out = path.join(__dirname, '..', 'media', 'sprites', 'pets');
fs.mkdirSync(out, { recursive: true });

const { W, H, px } = decodePNG(fs.readFileSync(src));
console.log(`Source: ${W}×${H}`);

for (const { id, deg } of SPECIES) {
  const tinted = new Uint8Array(px.length);
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i+3];
    if (a === 0) { tinted[i+3] = 0; continue; }
    const [nr, ng, nb] = rotateHue(px[i], px[i+1], px[i+2], deg);
    tinted[i] = nr; tinted[i+1] = ng; tinted[i+2] = nb; tinted[i+3] = a;
  }
  const png  = encodePNG(W, H, tinted);
  const file = path.join(out, `${id}.png`);
  fs.writeFileSync(file, png);
  console.log(`✓  pets/${id}.png  (${png.length} B, hue +${deg}°)`);
}
