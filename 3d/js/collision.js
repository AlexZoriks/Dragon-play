/* Простые 2D-коллизии в плоскости XZ: круг героя против кругов и повёрнутых прямоугольников.
   Для деревни этого достаточно и это дёшево на телефоне; физический движок понадобится позже,
   когда появятся прыжки, лестницы и рельеф. */

export class Colliders {
  constructor(bounds) {
    this.items = [];
    this.bounds = bounds;            // половина размера мира
  }

  addCircle(x, z, r, tag = null) { this.items.push({ kind: 'circle', x, z, r, tag }); }

  /** Прямоугольник с центром (x,z), полуразмерами hw/hd и поворотом rot (радианы вокруг Y) */
  addBox(x, z, hw, hd, rot, tag = null) {
    this.items.push({ kind: 'box', x, z, hw, hd, cos: Math.cos(rot), sin: Math.sin(rot), tag });
  }

  /** Выталкивает круг (pos.x, pos.z, r) из всех препятствий; skip — объект, который не учитывать */
  resolve(pos, r, skip = null) {
    for (let pass = 0; pass < 2; pass++) {
      for (const c of this.items) {
        if (c.tag === skip) continue;
        if (c.kind === 'circle') pushCircle(pos, r, c);
        else pushBox(pos, r, c);
      }
    }
    const b = this.bounds - r;
    pos.x = Math.max(-b, Math.min(b, pos.x));
    pos.z = Math.max(-b, Math.min(b, pos.z));
  }

  /** Есть ли препятствие в точке (для проверки точек патруля) */
  blocked(x, z, r) {
    const p = { x, z };
    this.resolve(p, r);
    return Math.hypot(p.x - x, p.z - z) > 1e-3;
  }
}

function pushCircle(pos, r, c) {
  const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), min = r + c.r;
  if (d >= min || d === 0) return;
  pos.x = c.x + (dx / d) * min;
  pos.z = c.z + (dz / d) * min;
}

function pushBox(pos, r, c) {
  // в локальные координаты прямоугольника
  const dx = pos.x - c.x, dz = pos.z - c.z;
  const lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
  const cx = Math.max(-c.hw, Math.min(c.hw, lx)), cz = Math.max(-c.hd, Math.min(c.hd, lz));
  let ox = lx - cx, oz = lz - cz, d = Math.hypot(ox, oz);
  if (d >= r) return;
  if (d < 1e-6) {                      // центр внутри: выталкиваем к ближайшей стороне
    const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
    if (px < pz) { ox = Math.sign(lx) || 1; oz = 0; d = 1; }
    else { ox = 0; oz = Math.sign(lz) || 1; d = 1; }
    const nx = (ox ? Math.sign(ox) * (c.hw + r) : lx), nz = (oz ? Math.sign(oz) * (c.hd + r) : lz);
    setLocal(pos, c, nx, nz);
    return;
  }
  setLocal(pos, c, cx + (ox / d) * r, cz + (oz / d) * r);
}

function setLocal(pos, c, lx, lz) {
  pos.x = c.x + lx * c.cos + lz * c.sin;
  pos.z = c.z - lx * c.sin + lz * c.cos;
}
