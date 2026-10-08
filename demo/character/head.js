// Head (deformed sphere), ears, and the painted face texture.
// Everything is in the head bone's local space: origin at the top of the neck,
// face looking toward +Z.
import { SphereGeometry, CanvasTexture, NoColorSpace, LinearFilter, LinearMipmapLinearFilter, Vector3 } from 'three';
import { smoothstep } from './geometry.js';
import { toRGB, toHex, rgbToHsv, hsvToRgb, toneShift } from 'anime-style';

export const HEAD = {
  center: new Vector3(0, 0.088, 0.004),
  radius: 0.095,
  scale: new Vector3(0.95, 1.0, 0.98),
  // face texture covers this rectangle of the head's local XY plane
  faceRect: [-0.09, -0.07, 0.18, 0.18],
};

export function headGeometry(s = 1, o = {}) {
  const g = new SphereGeometry(HEAD.radius * s, 64, 48);
  const pos = g.attributes.position;
  const d = new Vector3();
  const jaw = o.jaw ?? 1;
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    let x = d.x * HEAD.radius * HEAD.scale.x;
    let y = d.y * HEAD.radius * HEAD.scale.y;
    let z = d.z * HEAD.radius * HEAD.scale.z;
    const t = smoothstep(-0.12, -1.0, d.y); // lower part (cheeks stay wide down to here)
    const f = smoothstep(-0.45, 0.55, d.z); // front part
    // narrow jaw toward a small chin
    x *= 1 - 0.6 * jaw * Math.pow(t, 0.8) * (0.4 + 0.6 * f);
    // chin: pull the lower front down and slightly forward
    y -= 0.026 * jaw * Math.pow(t, 1.6) * f;
    z += 0.006 * t * f;
    // tuck the back of the jaw toward the neck
    z -= 0.03 * t * (1 - f);
    y += 0.012 * t * (1 - f);
    // flatter face plane
    const fp = smoothstep(0.35, 0.95, d.z) * (1 - smoothstep(0.55, 0.95, Math.abs(d.y)));
    z -= 0.006 * fp;
    pos.setXYZ(i, (x + HEAD.center.x) * s, y * s + HEAD.center.y * s, (z + HEAD.center.z) * s);
  }
  g.computeVertexNormals();
  g.deleteAttribute('uv');
  g.setAttribute('outlineNormal', g.attributes.normal);
  return g;
}

export function earGeometry(side, s = 1) {
  const g = new SphereGeometry(1, 16, 12);
  g.scale(0.011 * s, 0.026 * s, 0.018 * s);
  g.rotateZ(side * 0.12);
  g.rotateY(side * -0.35);
  g.translate(side * 0.079 * s, 0.07 * s, -0.004 * s);
  g.deleteAttribute('uv');
  g.setAttribute('outlineNormal', g.attributes.normal);
  return g;
}

// ------------------------------------------------------------- face paint

const FACE_DEFAULTS = {
  eyeColor: '#5b7be0',
  lashColor: '#3a2430',
  browColor: null, // null = derived from hair
  hairColor: '#f39a6b',
  skinColor: '#fdeee8',
  mouthColor: '#c45a62',
  eyeSize: 1,
  eyeSpacing: 0.034,
  eyeHeight: 0.05,
  eyeTilt: 0.05, // + = outer corner up
  mouthY: 0.006,
  blush: 0.35,
  expression: 'neutral', // 'neutral' | 'smile' | 'open' | 'pout'
  blink: 0, // 0 open .. 1 closed
  lookX: 0, // -1..1 iris offset
  lookY: 0,
};

function shade(hex, { s = 0, v = 1, h = 0 } = {}) {
  const hsv = rgbToHsv(toRGB(hex));
  return toHex(hsvToRgb({ h: hsv.h + h, s: Math.min(1, Math.max(0, hsv.s + s)), v: Math.min(1, hsv.v * v) }));
}

/**
 * Paint the face into a canvas. Units below are metres in head space,
 * converted to canvas pixels with px()/py().
 */
export function paintFace(canvas, opts = {}, s = 1) {
  const o = { ...FACE_DEFAULTS, ...opts };
  const S = canvas.width;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  const [rx0, ry0, rw, rh] = HEAD.faceRect;
  const px = (x) => ((x - rx0 * s) / (rw * s)) * S;
  const py = (y) => (1 - (y - ry0 * s) / (rh * s)) * S;
  const k = S / (rw * s); // px per metre

  const lash = o.lashColor;
  const iris = o.eyeColor;
  const irisDark = shade(iris, { s: 0.15, v: 0.55 });
  const irisDeep = shade(iris, { s: 0.25, v: 0.32 });
  const irisLight = shade(iris, { s: -0.05, v: 1.25 });
  const brow = o.browColor || shade(o.hairColor, { s: 0.2, v: 0.62 });
  const skinLine = toHex(toneShift(o.skinColor, { saturation: 0.5, value: 0.78, hueTarget: 350, hueShift: 0.1 }));

  const eh = 0.02 * o.eyeSize * s * k; // eye half height in px
  const blink = Math.min(1, Math.max(0, o.blink));

  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(px(side * o.eyeSpacing * s), py(o.eyeHeight * s));
    ctx.scale(side * eh, eh); // local units: +x outward, +y down, 1 = eye half height
    ctx.rotate(-o.eyeTilt * 1.0);
    if (blink < 0.6) {
      const open = 1 - blink / 0.6;
      // ---- eye white region
      const upper = () => {
        ctx.moveTo(-0.82, -0.12);
        ctx.bezierCurveTo(-0.55, -1.0 * open - 0.05, 0.45, -1.05 * open - 0.05, 0.98, -0.5 * open);
      };
      ctx.beginPath();
      upper();
      ctx.bezierCurveTo(0.98, 0.2, 0.62, 1.0 * open, 0.05, 1.0 * open);
      ctx.bezierCurveTo(-0.45, 1.0 * open, -0.82, 0.55 * open, -0.82, -0.12);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.save();
      ctx.clip();
      // ---- iris
      const ix = 0.06 + o.lookX * 0.25 * side;
      const iy = 0.12 + o.lookY * 0.25;
      ellipse(ctx, ix, iy, 0.64, 0.9, iris);
      // dark upper band (shadow of the lid)
      ctx.save();
      ctx.beginPath();
      ctx.rect(-2, -2, 4, 2 + iy - 0.15);
      ctx.clip();
      ellipse(ctx, ix, iy, 0.64, 0.9, irisDark);
      ctx.restore();
      // pupil
      ellipse(ctx, ix, iy + 0.02, 0.27, 0.45, irisDeep);
      // light lower crescent
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(ix, iy, 0.64, 0.9, 0, 0, Math.PI * 2);
      ctx.clip();
      ellipse(ctx, ix, iy + 0.78, 0.5, 0.42, irisLight);
      ctx.restore();
      // iris rim
      ctx.lineWidth = 0.05;
      ctx.strokeStyle = irisDeep;
      ctx.beginPath();
      ctx.ellipse(ix, iy, 0.64, 0.9, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore(); // unclip

      // ---- upper lash: thick crescent, heavier toward the outer corner
      ctx.beginPath();
      ctx.moveTo(-0.9, -0.1);
      ctx.bezierCurveTo(-0.55, -1.0 * open - 0.08, 0.45, -1.07 * open - 0.08, 1.02, -0.52 * open);
      ctx.lineTo(1.22, -0.62 * open - 0.12); // flick
      ctx.bezierCurveTo(1.0, -0.82 * open - 0.18, 0.5, -1.36 * open - 0.12, -0.5, -1.22 * open - 0.05);
      ctx.bezierCurveTo(-0.75, -1.1 * open, -0.92, -0.45, -0.9, -0.1);
      ctx.closePath();
      ctx.fillStyle = lash;
      ctx.fill();
      // ---- lower lash hint (outer corner)
      ctx.lineCap = 'round';
      ctx.strokeStyle = shade(lash, { v: 1.6, s: -0.1 });
      ctx.lineWidth = 0.07;
      ctx.beginPath();
      ctx.moveTo(0.9, 0.18 * open);
      ctx.quadraticCurveTo(0.75, 0.85 * open, 0.25, 1.02 * open);
      ctx.stroke();
      // ---- crease line
      ctx.strokeStyle = skinLine;
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.moveTo(-0.35, -1.42 * open - 0.05);
      ctx.quadraticCurveTo(0.45, -1.62 * open - 0.05, 0.95, -1.05 * open - 0.1);
      ctx.stroke();
    } else {
      // closed eye: soft downward arc
      ctx.lineCap = 'round';
      ctx.strokeStyle = lash;
      ctx.lineWidth = 0.17;
      ctx.beginPath();
      ctx.moveTo(-0.85, 0.05);
      ctx.quadraticCurveTo(0.1, 0.62, 1.05, -0.05);
      ctx.stroke();
      ctx.lineWidth = 0.08;
      ctx.beginPath();
      ctx.moveTo(1.0, 0.0);
      ctx.lineTo(1.22, -0.18);
      ctx.stroke();
    }
    ctx.restore();

    // highlights (not mirrored: they come from the same light)
    if (blink < 0.6) {
      const open = 1 - blink / 0.6;
      const ex = px(side * o.eyeSpacing * s) + side * 0.06 * eh + o.lookX * 0.25 * eh;
      const ey = py(o.eyeHeight * s) + (0.12 + o.lookY * 0.25) * eh;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(ex + 0.22 * eh, ey - 0.32 * eh * open, 0.17 * eh, 0.22 * eh * open, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(ex - 0.25 * eh, ey + 0.42 * eh * open, 0.07 * eh, 0.07 * eh * open, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // brows
    ctx.save();
    ctx.translate(px(side * (o.eyeSpacing + 0.002) * s), py((o.eyeHeight + 0.035) * s));
    ctx.scale(side * eh, eh);
    ctx.strokeStyle = brow;
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.1;
    ctx.beginPath();
    ctx.moveTo(-0.75, 0.12);
    ctx.quadraticCurveTo(0.0, -0.22, 0.85, 0.08);
    ctx.stroke();
    ctx.restore();

    // blush
    if (o.blush > 0) {
      ctx.save();
      ctx.globalAlpha = 0.45 * o.blush;
      ctx.fillStyle = '#ff8a8a';
      ctx.beginPath();
      ctx.ellipse(px(side * 0.047 * s), py((o.eyeHeight - 0.034) * s), 0.015 * s * k, 0.0065 * s * k, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // nose: tiny tick
  ctx.strokeStyle = skinLine;
  ctx.lineCap = 'round';
  ctx.lineWidth = 0.0016 * s * k;
  ctx.beginPath();
  ctx.moveTo(px(0.001 * s), py((o.eyeHeight - 0.03) * s));
  ctx.lineTo(px(-0.002 * s), py((o.eyeHeight - 0.034) * s));
  ctx.stroke();

  // mouth
  const my = py(o.mouthY * s);
  const mx = px(0);
  const mw = 0.0075 * s * k;
  ctx.strokeStyle = o.mouthColor;
  ctx.fillStyle = o.mouthColor;
  ctx.lineWidth = 0.0017 * s * k;
  ctx.beginPath();
  if (o.expression === 'open') {
    ctx.moveTo(mx - mw, my);
    ctx.quadraticCurveTo(mx, my - mw * 0.3, mx + mw, my);
    ctx.quadraticCurveTo(mx + mw * 0.6, my + mw * 1.4, mx, my + mw * 1.4);
    ctx.quadraticCurveTo(mx - mw * 0.6, my + mw * 1.4, mx - mw, my);
    ctx.fillStyle = shade(o.mouthColor, { v: 0.75, s: 0.1 });
    ctx.fill();
    ctx.fillStyle = '#ff9b9b';
    ellipse(ctx, mx, my + mw * 1.05, mw * 0.5, mw * 0.3, '#ff9b9b');
  } else if (o.expression === 'smile') {
    ctx.moveTo(mx - mw, my - mw * 0.2);
    ctx.quadraticCurveTo(mx, my + mw * 0.7, mx + mw, my - mw * 0.2);
    ctx.stroke();
  } else if (o.expression === 'pout') {
    ctx.moveTo(mx - mw * 0.6, my + mw * 0.2);
    ctx.quadraticCurveTo(mx, my - mw * 0.3, mx + mw * 0.6, my + mw * 0.2);
    ctx.stroke();
  } else {
    ctx.moveTo(mx - mw * 0.7, my);
    ctx.quadraticCurveTo(mx, my + mw * 0.25, mx + mw * 0.7, my);
    ctx.stroke();
  }
  return canvas;
}

function ellipse(ctx, x, y, rx, ry, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function createFaceTexture(opts, s = 1, size = 1024) {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(size, size);
  canvas.width = canvas.height = size;
  paintFace(canvas, opts, s);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = NoColorSpace; // painted in sRGB, used as-is by the cel shader
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.anisotropy = 4;
  tex.userData.repaint = (next) => {
    paintFace(canvas, { ...opts, ...next }, s);
    tex.needsUpdate = true;
  };
  return tex;
}
