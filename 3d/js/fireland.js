/* Огненные земли — первая локация 3D-мира, 200 × 200 м (план: зоны A–K, см. «План Огненных земель»).
   Всё, кроме моделей Meshy, строится кодом:
   - рельеф: пологие холмы, горы по краю карты, вулкан с жерлом на северо-востоке и тропа-подъём к нему;
   - две лавовые реки: главная с запада на восток и лавопад с вулкана; переход на север — по двум перешейкам;
   - земля — смесь 4 фото-материалов Poly Haven по правилам (пепел, гравий троп, скала на склонах,
     потрескавшаяся земля у лавы) с рельефом поверхности и тлеющими трещинами у берегов;
   - лава — свой шейдер; пепел и искры вокруг героя; огненное небо (HDRI) для отражений.
   Герой не может взойти на слишком крутой склон (см. main.js) — так вулкан проходим только по тропе. */
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { Colliders } from './collision.js';
import { loadGltf, sharpen } from './assets.js';

const SIZE = 200, HALF = SIZE / 2, SEG = 200;              // сетка рельефа — 1 м
export const FIRE_START = { x: 0, z: 72, face: 180 };       // Пепельная поляна, лицом на север

/* Лавовые реки: ломаные (x, z) от истока к устью, полуширина w. Лавопад стекает с вулкана. */
const LAVA = [
  { w: 4, pts: [[-106, 14], [-70, 6], [-45, 12], [-20, 2], [5, 10], [25, 4], [45, 14], [70, 6], [106, 12]] },
  { w: 2.6, pts: [[54, -64], [51, -50], [47, -36], [38, -22], [30, -8], [25, 4]], fall: true },   // из-под кромки жерла
];
const LAVA_Y = -0.3;                                         // уровень главной реки
const BRIDGES = [[-45, 12], [45, 14]];                       // Западный и Восточный перешейки
/* Тропы по плану (усыпаны гравием) */
const PATHS = [
  [[0, 98], [0, 72], [-30, 60], [-58, 48], [-50, 30], [-45, 12], [-52, -8], [-62, -30]],
  [[-62, -30], [-40, -38], [-12, -32]],
  [[0, 72], [30, 68], [55, 64]],
  [[55, 64], [50, 40], [45, 14], [52, -4], [62, -20], [64, -34]],
];
/* Вулкан: плоское дно жерла (арена босса), кромка кратера, склоны; подъём — расщелина по тропе лавопадов */
const V = { x: 68, z: -72, floorR: 11, floorY: 14, rimR: 15, rimY: 21, fall: 12 };
const RAMP = [[64, -34, 3], [66, -48, 7.5], [68, -61, 14]];      // точки подъёма: x, z, высота тропы
export const LAIR = { x: 68, z: -74, face: 0 };             // логово демона на дне жерла, лицом к входу

/* Модели из Meshy: что и сколько расставить. Отсутствующие файлы пропускаются. */
const FIRE_PROPS = [
  { model: 'rock_big', count: 18, scale: [0.9, 1.9], col: 1.6, base: 3.2 },
  { model: 'rock_mid', count: 34, scale: [0.6, 1.3], col: 0.75, base: 2.0 },          // средние скалы — чтобы большие не повторялись
];
/* Центры зон — там не ставим случайные скалы (место под постройки и бой) */
const ZONES = [[0, 72, 14], [55, 64, 15], [-58, 48, 12], [-62, -30, 16], [-12, -32, 16], [62, -20, 12], [68, -72, 26]];

function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 4; i++) { s += a * vnoise(x * f, z * f); f *= 2; a *= 0.5; } return s; }
const { smoothstep, lerp, clamp } = THREE.MathUtils;

function segDist(x, z, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const t = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1), 0, 1);
  return [Math.hypot(x - ax - vx * t, z - az - vz * t), t];
}
function distToPolyline(x, z, pts) {
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++) best = Math.min(best, segDist(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])[0]);
  return best;
}

/* --- рельеф без русел: холмы, горы по краю, вулкан, подъём --- */
function volcanoH(x, z) {
  const r = Math.hypot(x - V.x, z - V.z);
  if (r < V.floorR) return V.floorY + fbm(x * 0.3, z * 0.3) * 0.3;
  if (r < V.rimR) return lerp(V.floorY, V.rimY, smoothstep(r, V.floorR, V.rimR));
  return V.rimY * Math.exp(-(r - V.rimR) / V.fall) * (0.85 + 0.3 * fbm(x * 0.08, z * 0.08));     // у кромки круто, ниже — пологие
}
function rampH(x, z) {                          // расщелина-подъём: высота тропы и насколько точка на ней
  let best = 1e9, y = 0;
  for (let i = 0; i < RAMP.length - 1; i++) {
    const [ax, az, ay0] = RAMP[i], [bx, bz, by] = RAMP[i + 1];
    const [d, t] = segDist(x, z, ax, az, bx, bz);
    if (d < best) { best = d; y = lerp(ay0, by, t); }
  }
  return [y, 1 - smoothstep(best, 2.2, 4.5)];
}
function baseHeight(x, z) {
  let h = fbm(x * 0.03 + 3, z * 0.03 + 7) * 3 - 1.2 + fbm(x * 0.15, z * 0.15) * 0.25;   // мелкий рельеф дают карты нормалей
  const e = Math.max(Math.abs(x), Math.abs(z)) / HALF;
  h += Math.max(0, e - 0.84) ** 2 * 900 * (0.6 + 0.7 * fbm(x * 0.05, z * 0.05));      // горы по краю карты
  h = Math.max(h, volcanoH(x, z));
  const [ry, rw] = rampH(x, z);
  if (rw > 0) h = lerp(h, ry, rw);
  return h;
}

/* --- русла: плотные точки через 2 м с высотой поверхности лавы (лавопад стекает вниз) --- */
/* Сглаживание ломаной (срез углов Чайкина): изгибы русла плавные, лента лавы на поворотах не складывается */
function chaikin(pts, iter = 3) {
  let p = pts;
  for (let k = 0; k < iter; k++) {
    const q = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, az] = p[i], [bx, bz] = p[i + 1];
      q.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
    }
    q.push(p[p.length - 1]); p = q;
  }
  return p;
}
const RIVERS = LAVA.map((r) => {
  const dense = [], pts = chaikin(r.pts);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 2));
    for (let k = 0; k < n; k++) dense.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n, LAVA_Y]);
  }
  dense.push([...pts[pts.length - 1], LAVA_Y]);
  if (r.fall) {
    for (const p of dense) p[2] = baseHeight(p[0], p[1]) - 0.9;
    for (let i = 1; i < dense.length; i++) dense[i][2] = Math.min(dense[i][2], dense[i - 1][2]);    // лава течёт только вниз
    for (let pass = 0; pass < 3; pass++) for (let i = 1; i < dense.length - 1; i++) dense[i][2] = (dense[i - 1][2] + dense[i][2] + dense[i + 1][2]) / 3;
    for (let i = dense.length - 1; i >= 0; i--) dense[i][2] = Math.max(dense[i][2], LAVA_Y + 0.06);
    const main = chaikin(LAVA[0].pts);
    while (dense.length > 2 && distToPolyline(dense[dense.length - 2][0], dense[dense.length - 2][1], main) < LAVA[0].w - 1) dense.pop();
  }
  return { w: r.w, dense };
});

/** Расстояние до берега (меньше 0 — в лаве) и высота поверхности ближайшей реки */
function lavaInfo(x, z) {
  let d = 1e9, y = LAVA_Y;
  for (const r of RIVERS) {
    const p = r.dense;
    for (let i = 0; i < p.length - 1; i++) {
      const [dd, t] = segDist(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]);
      if (dd - r.w < d) { d = dd - r.w; y = lerp(p[i][2], p[i + 1][2], t); }
    }
  }
  d += (fbm(x * 0.22 + 11, z * 0.22 - 4) - 0.5) * 1.6;                       // неровный берег
  if (!BRIDGE) for (const [bx, bz] of BRIDGES) d = lerp(d, Math.max(d, 1.8), 1 - smoothstep(Math.hypot(x - bx, z - bz), 2.5, 5));   // без модели моста — земляной перешеек
  return [d, y];
}
export const lavaDist = (x, z) => lavaInfo(x, z)[0];

/** Высота земли в точке: русла врезаны, берега всегда выше лавы */
function groundHeight(x, z) {
  let h = baseHeight(x, z);
  const [ld, ly] = lavaInfo(x, z);
  if (ld < 3.6) h = Math.max(h, ly + 0.45);                        // берег всегда выше лавы (и на склоне вулкана)
  if (ld < 1.8) h = lerp(ly - 0.7, h, smoothstep(ld, -0.4, 1.8));
  return h;
}

/* --- мосты-модели: настил снимается с самой модели (высота верхних вершин вдоль моста),
   у концов — пологие подъезды из земли, чтобы не было ступеньки. По бокам над лавой — перила-препятствия. --- */
let BRIDGE = null;                 // { L, W, items: [{ x, z, ux, uz, vx, vz, rot, prof, step, endH }] }
const bridgeLocal = (b, x, z) => { const dx = x - b.x, dz = z - b.z; return [dx * b.ux + dz * b.uz, dx * b.vx + dz * b.vz]; };
function deckAt(x, z) {
  let best = -Infinity;
  if (!BRIDGE) return best;
  for (const b of BRIDGE.items) {
    const [u, v] = bridgeLocal(b, x, z);
    if (Math.abs(v) > BRIDGE.W / 2 - 0.35 || Math.abs(u) > BRIDGE.L / 2) continue;
    const f = (u + BRIDGE.L / 2) / b.step, i = clamp(Math.floor(f), 0, b.prof.length - 2), t = clamp(f - i, 0, 1);
    best = Math.max(best, lerp(b.prof[i], b.prof[i + 1], t));
  }
  return best;
}
function rampAt(x, z, ground) {
  let best = -Infinity;
  if (!BRIDGE) return best;
  const L2 = BRIDGE.L / 2, RUN = 5;                                 // насыпь 5 м — уклон не круче 1:2
  for (const b of BRIDGE.items) {
    const [u, v] = bridgeLocal(b, x, z), au = Math.abs(u);
    if (Math.abs(v) > BRIDGE.W / 2 + 0.6 || au < L2 - 0.25 || au > L2 + RUN) continue;
    const end = u > 0 ? b.endH[1] : b.endH[0];
    best = Math.max(best, lerp(end, ground, clamp((au - L2) / RUN, 0, 1)));
  }
  return best;
}
/** Земля для сетки рельефа: с подъездами к мостам, без настила */
function terrainHeight(x, z) { const g = groundHeight(x, z); return Math.max(g, rampAt(x, z, g)); }
/** Высота, на которой стоит персонаж: земля, подъезд или настил моста */
export function heightAt(x, z) { return Math.max(terrainHeight(x, z), deckAt(x, z)); }

/** Ставит мосты поперёк главной реки и снимает профиль настила. Вызывается до постройки рельефа. */
function prepareBridges(gltf) {
  const L = 16, root = gltf.scene, box = new THREE.Box3().setFromObject(root);
  const k = L / (box.max.x - box.min.x), W = (box.max.z - box.min.z) * k;
  const verts = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); verts.push([v.x, v.y, v.z]); }
  });
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2, Y0 = -0.45;   // опоры чуть утоплены в берег
  const step = 0.5, n = Math.round(L / step) + 1, prof0 = new Float32Array(n).fill(-Infinity);
  for (const [x, y, z] of verts) {                                 // верх настила — по средней полосе (без перил)
    if (Math.abs((z - cz) * k) > W * 0.22) continue;
    const i = Math.round(((x - cx) * k + L / 2) / step);
    if (i >= 0 && i < n) prof0[i] = Math.max(prof0[i], (y - box.min.y) * k + Y0);
  }
  for (let i = 0; i < n; i++) if (!isFinite(prof0[i])) prof0[i] = isFinite(prof0[i - 1]) ? prof0[i - 1] : Y0;
  const prof = prof0.map((_, i) => { let s = 0, c = 0; for (let j = i - 2; j <= i + 2; j++) if (j >= 0 && j < n) { s += prof0[j]; c++; } return s / c; });   // сглаживание
  const items = BRIDGES.map(([bx, bz]) => {
    const p = RIVERS[0].dense; let bi = 0, bd = 1e9;
    p.forEach(([x, z], i) => { const d = Math.hypot(x - bx, z - bz); if (d < bd) { bd = d; bi = i; } });
    const a = p[Math.max(0, bi - 2)], c = p[Math.min(p.length - 1, bi + 2)];
    const tx = c[0] - a[0], tz = c[1] - a[1], tl = Math.hypot(tx, tz);
    const ux = -tz / tl, uz = tx / tl;                              // ось моста — поперёк реки
    return { x: p[bi][0], z: p[bi][1], ux, uz, vx: -uz, vz: ux,   // центр — на оси (сглаженного) русла
             rot: Math.atan2(-uz, ux), prof, step, endH: [prof[0], prof[n - 1]] };
  });
  BRIDGE = { L, W, k, box, Y0, items };
}

function addBridges(scene, gltf, colliders) {
  const { L, W, k, box, Y0, items } = BRIDGE;
  for (const b of items) {
    const o = gltf.scene.clone(true);
    o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    sharpen(o);
    const g = new THREE.Group();
    o.scale.setScalar(k);
    o.position.set(-(box.min.x + box.max.x) / 2 * k, -box.min.y * k + Y0, -(box.min.z + box.max.z) / 2 * k);
    g.add(o); g.position.set(b.x, 0, b.z); g.rotation.y = b.rot;
    scene.add(g);
    // перила и каменные торцы по всей длине: на мост заходят только прямо, сбоку — стена
    for (const s of [-1, 1]) colliders.addBox(b.x + b.vx * s * (W / 2 - 0.1), b.z + b.vz * s * (W / 2 - 0.1), L / 2 + 0.4, 0.25, b.rot);
  }
}

/* ------------------------------------------------------------------------------------------ */
export async function buildFireland(scene, renderer, { quality = 'medium' } = {}) {
  const colliders = new Colliders(87);                       // граница — перед скальными стенами (и в разрывах у лавы)
  scene.background = new THREE.Color(0x1a0d0a);
  scene.fog = new THREE.FogExp2(0x1c0c08, 0.012);

  // свет: огненное небо (HDRI Poly Haven) — отражения на металле и коже; низкое багровое солнце; отсвет лавы снизу
  const pmrem = new THREE.PMREMGenerator(renderer);
  try {
    const hdr = await new HDRLoader().loadAsync('assets/textures/sky/fire_sky_1k.hdr');
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose();
  } catch (e) { /* без неба тоже работает */ }
  scene.environmentIntensity = 0.35;
  const hemi = new THREE.HemisphereLight(0x5e5a5c, 0xb0441a, 0.9);
  const sun = new THREE.DirectionalLight(0xff9a6a, 3.0);
  sun.position.set(-20, 18, -10); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = sc.bottom = -22; sc.right = sc.top = 22; sc.near = 1; sc.far = 90;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  scene.add(hemi, sun, sun.target);

  let bridgeGltf = null;
  try { bridgeGltf = await loadGltf('assets/models/fire/bridge.glb'); prepareBridges(bridgeGltf); } catch (e) { BRIDGE = null; }
  const tex = await loadGroundTextures(renderer, quality === 'high' ? '' : '_1k');
  scene.add(makeGround(tex));
  const lava = makeLava(); scene.add(lava.mesh);
  const ash = makeAsh(); scene.add(ash.points);
  scene.add(makePebbles());
  scene.add(await makeScorch());

  // лава непроходима: кружки вдоль русел; у моста — проход шириной с настил, по бокам перила
  for (const r of RIVERS) {
    const rad = r.w * 0.85;
    r.dense.forEach(([x, z]) => {
      if (BRIDGE ? BRIDGE.items.some((b) => { const [u, v] = bridgeLocal(b, x, z); return Math.abs(u) < BRIDGE.L / 2 && Math.abs(v) < BRIDGE.W / 2 + rad - 0.25; })
        : BRIDGES.some(([bx, bz]) => Math.hypot(x - bx, z - bz) < 4.2)) return;
      colliders.addCircle(x, z, rad);
    });
  }
  if (BRIDGE) addBridges(scene, bridgeGltf, colliders);
  scene.add(await makeRoads(renderer));
  await addProps(scene, colliders);
  const occluders = await addCliffs(scene, colliders);

  const update = (dt, t, hero) => { lava.update(t); ash.update(dt); if (hero) ash.follow(hero.position.x, hero.position.y, hero.position.z); };
  return {
    colliders, occluders, doors: [], lights: { hemi, sun }, dummies: [], update, heightAt,
    size: SIZE, start: FIRE_START, bossSpawn: LAIR, maxSlope: 1.15,
  };
}

/* --- текстуры земли: 4 материала Poly Haven (цвет + рельеф). На телефоне — 1K: с высоты камеры
   1K на 3 м плитки уже мельче пикселя экрана; 2K — только в режиме «высокое». --- */
async function loadGroundTextures(renderer, suffix) {
  const L = new THREE.TextureLoader(), aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const load = async (name, srgb) => {
    const t = await L.loadAsync(`assets/textures/ground/${name}${suffix}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const names = ['ash', 'gravel', 'rock', 'cracked'];
  const out = {};
  await Promise.all(names.flatMap((n) => [load(`${n}_col`, true).then((t) => { out[`${n}C`] = t; }), load(`${n}_nor`, false).then((t) => { out[`${n}N`] = t; })]));
  return out;
}

/* --- земля: веса материалов считаются по рельефу в каждой вершине:
   скала — крутые склоны, горы, жерло; гравий — тропы и редкие осыпи; потрескавшаяся земля — у лавы;
   пепел — всё остальное. Плюс крупные пятна светлее/темнее, чтобы плитка не повторялась. --- */
function makeGround(tex) {
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, n = pos.count;
  for (let i = 0; i < n; i++) pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const nor = geo.attributes.normal, splat = new Float32Array(n * 3), extra = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), z = pos.getZ(i), ny = nor.getY(i), [ld] = lavaInfo(x, z);
    const vr = Math.hypot(x - V.x, z - V.z), edge = Math.max(Math.abs(x), Math.abs(z)) / HALF;
    const brk = fbm(x * 0.35 + 5, z * 0.35 - 2);                                  // рваный край пятен
    const path = Math.min(...PATHS.map((p) => distToPolyline(x, z, p)));
    let gravel = (1 - smoothstep(path, 1.0, 2.6 + brk * 1.2)) + smoothstep(fbm(x * 0.06, z * 0.06 + 9), 0.66, 0.74) * 0.8;
    let rock = (1 - smoothstep(ny, 0.7, 0.86)) + smoothstep(edge, 0.86, 0.93);                     // склоны и горы по краю
    rock += (1 - smoothstep(vr, V.rimR + 4, V.rimR + 14)) * 0.7 + smoothstep(fbm(x * 0.05 - 3, z * 0.05), 0.7, 0.78) * 0.6;
    const cracked = (1 - smoothstep(ld, 0.6, 4.5 + brk * 2)) + (vr < V.floorR + 0.5 ? 0.8 : 0);
    gravel = clamp(gravel * (0.7 + brk * 0.6), 0, 1); rock = clamp(rock, 0, 1);
    const c = clamp(cracked, 0, 1) * (1 - rock * 0.6), g = gravel * (1 - rock) * (1 - c), r = rock;
    splat[i * 3] = g; splat[i * 3 + 1] = r; splat[i * 3 + 2] = c;
    extra[i * 2] = 0.82 + 0.36 * fbm(x * 0.02 + 40, z * 0.02 - 13);               // крупные пятна
    extra[i * 2 + 1] = clamp(1 - (ld - 0.2) / 2.6, 0, 1) + (vr < V.floorR ? 0.35 : 0);   // тление у лавы и в жерле
  }
  geo.setAttribute('splat', new THREE.BufferAttribute(splat, 3));
  geo.setAttribute('extra', new THREE.BufferAttribute(extra, 2));

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    mat.userData.shader = sh;
    for (const k of ['ashC', 'ashN', 'gravelC', 'gravelN', 'rockC', 'rockN', 'crackedC', 'crackedN']) sh.uniforms[`t_${k}`] = { value: tex[k] };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 splat; attribute vec2 extra; varying vec3 vSplat; varying vec2 vExtra; varying vec3 vWP; varying vec3 vNW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vNW = normalize(mat3(modelMatrix) * objectNormal); vSplat = splat; vExtra = extra;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D t_ashC, t_ashN, t_gravelC, t_gravelN, t_rockC, t_rockN, t_crackedC, t_crackedN;
varying vec3 vSplat; varying vec2 vExtra; varying vec3 vWP; varying vec3 vNW;
vec3 nrm(sampler2D s, vec2 uv) { return texture2D(s, uv).xyz * 2.0 - 1.0; }
vec2 rot37(vec2 p) { return mat2(0.8, -0.6, 0.6, 0.8) * p; }      // второй слой под углом — плитка не складывается в ряды`)
      .replace('#include <map_fragment>', `
vec2 uvP = vec2(vWP.x, -vWP.z);                      // плоская проекция сверху (u — восток, v — север)
float wG = vSplat.x, wR = vSplat.y, wC = vSplat.z, wA = max(0.0, 1.0 - wG - wR - wC);
// пепел: два масштаба одной текстуры — повтор плитки не виден; иголки приглушены до золы
vec3 cA = mix(texture2D(t_ashC, uvP / 3.2).rgb, texture2D(t_ashC, rot37(uvP) / 7.3 + 0.31).rgb, 0.5);
cA = mix(cA, vec3(dot(cA, vec3(0.3, 0.59, 0.11))), 0.6) * vec3(0.52, 0.49, 0.47);   // зола: серее и темнее, иголки почти не видны
vec3 cG = mix(texture2D(t_gravelC, uvP / 3.0).rgb, texture2D(t_gravelC, rot37(uvP) / 4.4 + 0.5).rgb, 0.5);
cG = mix(cG, vec3(dot(cG, vec3(0.333))), 0.35) * vec3(0.46, 0.42, 0.4);   // светлый гравий — под тёмный базальт
vec3 cCraw = texture2D(t_crackedC, uvP / 4.0).rgb, cC = cCraw * vec3(0.62, 0.42, 0.36);
// скала: три проекции (без растяжки на крутых склонах)
vec3 bw = pow(abs(normalize(vNW)), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
vec3 cR = (texture2D(t_rockC, vWP.zy / 6.0).rgb * bw.x + texture2D(t_rockC, vWP.xz / 6.0).rgb * bw.y + texture2D(t_rockC, vWP.xy / 6.0).rgb * bw.z) * 1.35;
// стык материалов по рельефу текстуры: камешки гравия «торчат» из пепла, а не просвечивают
float hG = dot(cG, vec3(0.6)), hA = dot(cA, vec3(0.6));
wG = clamp(wG + (hG - hA) * wG * (1.0 - wG) * 3.0, 0.0, 1.0);
wA = max(0.0, 1.0 - wG - wR - wC);
vec3 groundCol = (cA * wA + cG * wG + cR * wR + cC * wC) * vExtra.x;
diffuseColor.rgb *= groundCol;`)
      .replace('#include <normal_fragment_maps>', `
vec3 tn = nrm(t_ashN, uvP / 3.2) * wA + nrm(t_gravelN, uvP / 3.0) * wG + nrm(t_crackedN, uvP / 4.0) * wC
        + (nrm(t_rockN, vWP.zy / 6.0) * bw.x + nrm(t_rockN, vWP.xz / 6.0) * bw.y + nrm(t_rockN, vWP.xy / 6.0) * bw.z) * wR;
vec3 Ng = normalize(vNW), Tg = normalize(vec3(1.0, 0.0, 0.0) - Ng * Ng.x), Bg = cross(Ng, Tg);
vec3 nW = normalize(Tg * tn.x + Bg * tn.y + Ng * max(tn.z, 0.25));
normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
// тлеющие трещины у лавы и в жерле: светятся тёмные щели потрескавшейся земли
float crackLine = 1.0 - smoothstep(0.16, 0.3, dot(cCraw, vec3(0.333)));
totalEmissiveRadiance += vec3(1.0, 0.28, 0.06) * vExtra.y * vExtra.y * (0.05 + 0.9 * crackLine * wC);`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/* --- мелкие камни: 2200 штук одним вызовом отрисовки, каждый со своим поворотом, размером и оттенком --- */
function makePebbles() {
  const base = new THREE.IcosahedronGeometry(0.5, 0);
  const p = base.attributes.position;
  for (let i = 0; i < p.count; i++) {                       // неровный камень, а не мяч
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 0.75 + hash(x * 9.1, z * 7.3 + y) * 0.5;
    p.setXYZ(i, x * k, y * k * 0.6, z * k);
  }
  base.computeVertexNormals();
  const N = 2200, mesh = new THREE.InstancedMesh(base, new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true }), N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), c = new THREE.Color();
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let k = 0;
  for (let tries = 0; k < N && tries < N * 6; tries++) {
    const x = (rnd() - 0.5) * (SIZE - 12), z = (rnd() - 0.5) * (SIZE - 12);
    const [ld] = lavaInfo(x, z);
    if (ld < 0.8 || Math.hypot(x - V.x, z - V.z) < V.rimR + 3) continue;
    if (fbm(x * 0.08, z * 0.08) < 0.42 && rnd() < 0.7) continue;          // кучками, а не ровным слоем
    const sz = 0.08 + rnd() ** 3 * 0.6;
    e.set(rnd() * 6, rnd() * 6, rnd() * 6); q.setFromEuler(e); s.set(sz, sz, sz);
    m.compose(new THREE.Vector3(x, heightAt(x, z) + sz * 0.12, z), q, s);
    mesh.setMatrixAt(k, m);
    const v = 0.025 + rnd() * 0.045; c.setRGB(v * 1.15, v, v * 0.9);             // базальт и обсидиан (линейный цвет)
    if (ld < 3 && rnd() < 0.3) c.setRGB(0.35, 0.06, 0.02);                      // раскалённые у берега
    mesh.setColorAt(k, c);
    k++;
  }
  mesh.count = k;
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

/* --- пятна копоти на земле (спрайты Kenney): плоские сетки, повторяющие рельеф, одним мешем --- */
async function makeScorch() {
  let map;
  try { map = await new THREE.TextureLoader().loadAsync('assets/textures/fx/scorch.png'); } catch (e) { return new THREE.Group(); }
  map.colorSpace = THREE.SRGBColorSpace;
  const positions = [], uvs = [], idx = [];
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const S = 4;                                                         // каждое пятно — сетка 4×4, ложится по рельефу
  for (let n = 0; n < 70; n++) {
    const x = (rnd() - 0.5) * (SIZE - 20), z = (rnd() - 0.5) * (SIZE - 20), [ld] = lavaInfo(x, z);
    if (ld < 1 || Math.hypot(x - V.x, z - V.z) < V.rimR + 6) continue;
    const size = 2.5 + rnd() * 4, rot = rnd() * 6.28, cs = Math.cos(rot), sn = Math.sin(rot), tile = Math.floor(rnd() * 3);
    const b = positions.length / 3;
    for (let j = 0; j <= S; j++) for (let i = 0; i <= S; i++) {
      const u = i / S - 0.5, v = j / S - 0.5, px = x + (u * cs - v * sn) * size, pz = z + (u * sn + v * cs) * size;
      positions.push(px, heightAt(px, pz) + 0.03, pz);
      uvs.push((tile + i / S) / 3, j / S);
    }
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const a = b + j * (S + 1) + i; idx.push(a, a + S + 1, a + 1, a + 1, a + S + 1, a + S + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x050302, alphaMap: map, transparent: true, depthWrite: false, roughness: 1,
    polygonOffset: true, polygonOffsetFactor: -2, opacity: 0.85 });
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true; mesh.userData.noAO = true;
  return mesh;
}

/* --- лава: свой шейдер, без текстур (весит 0 КБ, не «мылится» и не растягивается).
   Лава — лента вдоль каждого русла с координатами (s — вдоль течения в метрах, a — поперёк),
   поэтому течение всегда идёт по руслу, даже на поворотах; лавопад спускается по склону вулкана.
   Картинка: плиты остывшей чёрной корки (ячейки Вороного) плывут по течению, между ними светятся
   раскалённые трещины; к середине русла плиты тают и открывают жидкую жёлто-оранжевую лаву.
   Значения ярче 1 подхватывает bloom — получается свечение без источников света. --- */
function makeLava() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { t: { value: 0 } },
    fog: false,
    vertexShader: `
      attribute float edge; varying vec2 vUv; varying float vEdge;
      void main(){ vUv = uv; vEdge = edge; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float t; varying vec2 vUv; varying float vEdge;
      vec2 h2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
      float n2(vec2 p){
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h2(i).x, h2(i + vec2(1.0, 0.0)).x, f.x), mix(h2(i + vec2(0.0, 1.0)).x, h2(i + vec2(1.0)).x, f.x), f.y);
      }
      float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * n2(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
      // x — расстояние до центра ячейки, y — до её границы (F2 − F1): у границы — трещина
      vec2 vor(vec2 p){
        vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 g = vec2(float(x), float(y)), o = h2(i + g);
          o = 0.5 + 0.35 * sin(t * 0.4 + 6.2831 * o);              // плиты медленно «дышат»
          vec2 r = g + o - f; float d = dot(r, r);
          if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
        }
        return vec2(sqrt(d1), sqrt(d2) - sqrt(d1));
      }
      void main(){
        float m = clamp((vEdge + 0.4) / 2.2, 0.0, 1.0);             // 0 у берега … 1 в середине
        vec2 p = vec2(vUv.x - t * 0.35, vUv.y);                       // одна скорость поперёк русла — иначе узор растягивается в полосы
        vec2 warp = vec2(fbm(p * 0.35 + vec2(0.0, t * 0.05)), fbm(p * 0.35 + 5.2)) - 0.5;
        vec2 q = p * 0.7 + warp * 1.4;
        vec2 v = vor(q);
        float nz = fbm(q * 1.3 + 3.0);
        float crack = 1.0 - smoothstep(0.0, mix(0.03, 0.2, m) * (0.6 + 0.8 * nz), v.y);
        float molten = smoothstep(0.8, 1.05, m + (nz - 0.5) * 0.6) * 0.85;
        float heat = clamp(max(crack, molten) * (0.75 + 0.5 * nz), 0.0, 1.2);
        vec3 crust = vec3(0.045, 0.032, 0.03) * (0.6 + 0.9 * fbm(q * 5.0))
                   + vec3(0.1, 0.012, 0.0) * (1.0 - smoothstep(0.0, 0.35, v.y));   // подсвет снизу у края плиты
        vec3 hot = mix(vec3(0.55, 0.04, 0.0), vec3(1.3, 0.3, 0.02), smoothstep(0.2, 0.7, heat));
        hot = mix(hot, vec3(1.9, 1.05, 0.3), smoothstep(0.8, 1.15, heat));
        float pulse = 0.9 + 0.1 * sin(t * 1.5 + vUv.x * 0.4);
        gl_FragColor = vec4(mix(crust, hot * pulse, smoothstep(0.05, 0.4, heat)), 1.0);
      }`,
  });
  const group = new THREE.Group();
  for (const r of RIVERS) {
    const m = new THREE.Mesh(riverRibbon(r), mat);
    m.userData.noAO = true;
    m.renderOrder = 1;                       // после земли: скрытая под берегом часть не считается
    group.add(m);
  }
  return { mesh: group, update: (t) => { mat.uniforms.t.value = t; } };
}

/* Лента вдоль русла через каждые 2 м: шире самого русла (края уходят под берег), высота — поверхность лавы */
function riverRibbon({ w, dense }) {
  const half = w + 1.6, ACROSS = 6, pos = [], uv = [], edge = [], idx = [];
  let s = 0;
  for (let i = 0; i < dense.length; i++) {
    const [x, z, y] = dense[i];
    const a0 = dense[Math.max(0, i - 1)], a1 = dense[Math.min(dense.length - 1, i + 1)];
    const tan = new THREE.Vector2(a1[0] - a0[0], a1[1] - a0[1]).normalize();
    if (i > 0) s += Math.hypot(x - dense[i - 1][0], z - dense[i - 1][1]);
    for (let j = 0; j <= ACROSS; j++) {
      const a = -half + (2 * half * j) / ACROSS;
      pos.push(x - tan.y * a, y, z + tan.x * a);
      uv.push(s, a); edge.push(w - Math.abs(a));
    }
  }
  for (let i = 0; i < dense.length - 1; i++) for (let j = 0; j < ACROSS; j++) {
    const k = i * (ACROSS + 1) + j, n = k + ACROSS + 1;
    idx.push(k, k + 1, n, k + 1, n + 1, n);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('edge', new THREE.Float32BufferAttribute(edge, 1));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/* --- пепел и искры. Частицы живут в мире (не едут вместе с героем): когда частица уходит
   дальше R от героя, она переносится на противоположную сторону — так облако всегда вокруг,
   но при беге герой проходит сквозь него. Высота — от земли под героем (на вулкане тоже). --- */
function softDot() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}
function makeCloud(N, R, color, size, opts) {
  const pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * R * 2; pos[i * 3 + 1] = Math.random() * 8; pos[i * 3 + 2] = (Math.random() - 0.5) * R * 2;
    seed[i] = Math.random() * 100;
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ size, map: softDot(), color, transparent: true, depthWrite: false, sizeAttenuation: true, ...opts });
  const points = new THREE.Points(geo, mat); points.frustumCulled = false; points.userData.noAO = true;
  return { points, pos, seed, N, R, geo };
}
function makeAsh() {
  const ash = makeCloud(260, 18, 0x8a8480, 0.06, { opacity: 0.55 });
  const sparks = makeCloud(70, 14, 0xff8a30, 0.07, { opacity: 0.95, blending: THREE.AdditiveBlending });
  const group = new THREE.Group(); group.add(ash.points, sparks.points);
  let t = 0, hx = 0, hy = 0, hz = 0;
  const step = (c, dt, fall, rise) => {
    const { pos, seed, N, R } = c;
    for (let i = 0; i < N; i++) {
      const s = seed[i], k = i * 3;
      pos[k] += Math.sin(t * 0.6 + s) * dt * 0.35;
      pos[k + 2] += Math.cos(t * 0.5 + s * 1.3) * dt * 0.35;
      pos[k + 1] += (rise ? 0.6 + (s % 1) * 0.6 : -(fall + (s % 1) * 0.25)) * dt;
      if (pos[k + 1] - hy < -1) pos[k + 1] += 9; else if (pos[k + 1] - hy > 8) pos[k + 1] -= 9;
      if (pos[k] - hx > R) pos[k] -= 2 * R; else if (pos[k] - hx < -R) pos[k] += 2 * R;
      if (pos[k + 2] - hz > R) pos[k + 2] -= 2 * R; else if (pos[k + 2] - hz < -R) pos[k + 2] += 2 * R;
    }
    c.geo.attributes.position.needsUpdate = true;
  };
  return {
    points: group,
    update(dt) { t += dt; step(ash, dt, 0.18, false); step(sparks, dt, 0, true); sparks.points.material.opacity = 0.75 + 0.2 * Math.sin(t * 3); },
    follow(x, y, z) { hx = x; hy = y; hz = z; },
  };
}

/* --- модели Meshy: расставляются по карте случайно, но повторяемо (одно и то же зерно),
   не на лаве, не на тропах и не в центрах зон --- */
async function addProps(scene, colliders) {
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const p of FIRE_PROPS) {
    let gltf;
    try { gltf = await loadGltf(`assets/models/fire/${p.model}.glb`); } catch (e) { continue; }   // модели ещё нет
    const box = new THREE.Box3().setFromObject(gltf.scene), h = box.max.y - box.min.y;
    let placed = 0;
    for (let tries = 0; placed < p.count && tries < p.count * 40; tries++) {
      const x = (rnd() - 0.5) * (SIZE - 16), z = (rnd() - 0.5) * (SIZE - 16);
      if (lavaInfo(x, z)[0] < 5) continue;
      if (Math.min(...PATHS.map((q) => distToPolyline(x, z, q))) < 5) continue;
      if (ZONES.some(([zx, zz, r]) => Math.hypot(x - zx, z - zz) < r)) continue;
      const s = lerp(p.scale[0], p.scale[1], rnd());
      const o = gltf.scene.clone(true);
      o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      sharpen(o);
      const k = (p.base * s) / h;
      o.scale.setScalar(k); o.rotation.y = rnd() * Math.PI * 2;
      o.position.set(x, heightAt(x, z) - box.min.y * k - 0.25, z);
      scene.add(o);
      colliders.addCircle(x, z, p.col * s);
      placed++;
    }
  }
}

/* --- скальные стены по краю карты (модульные сегменты Meshy, лицом внутрь).
   Каждая копия — отдельный объект: камера видит 3–6 сегментов, остальные отсекаются и не рисуются.
   Не ставим у жерла вулкана и там, где лава уходит за край карты. --- */
async function addCliffs(scene, colliders) {
  let gltf;
  const occluders = [];
  try { gltf = await loadGltf('assets/models/fire/cliff_wall.glb'); } catch (e) { return occluders; }
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const WIDTH = 14, k = WIDTH / (box.max.x - box.min.x), depth = (box.max.z - box.min.z) * k;
  let seed = 23; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const D = 86, STEP = 12.5;                                        // сегменты внахлёст, без щелей
  const edges = [                                                   // [начало, направление вдоль края, поворот лицом к центру]
    { at: (t) => [t, -D], rot: 0 },            // север: лицом на юг (+z)
    { at: (t) => [t, D], rot: Math.PI },       // юг
    { at: (t) => [D, t], rot: -Math.PI / 2 },  // восток
    { at: (t) => [-D, t], rot: Math.PI / 2 },  // запад
  ];
  for (const e of edges) {
    for (let t = -D; t <= D + 0.1; t += STEP) {
      const [x, z] = e.at(t);
      if (Math.hypot(x - V.x, z - V.z) < 34) continue;                  // склон вулкана
      if (lavaInfo(x, z)[0] < 6) continue;                              // лава уходит за край
      const s = 0.9 + rnd() * 0.3, rot = e.rot + (rnd() - 0.5) * 0.25;
      const o = gltf.scene.clone(true);
      o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.material = m.material.clone(); } });   // своя прозрачность у каждой
      sharpen(o);
      o.scale.setScalar(k * s);
      o.position.set(-(box.min.x + box.max.x) / 2 * k * s, -box.min.y * k * s, -(box.min.z + box.max.z) / 2 * k * s);
      const g = new THREE.Group(); g.add(o);
      g.position.set(x, groundHeight(x, z) - 1.2, z); g.rotation.y = rot;
      scene.add(g);
      occluders.push(g);                                             // заслоняет героя — становится полупрозрачной
      colliders.addBox(x, z, (WIDTH * s) / 2, (depth * s) / 2, rot);
    }
  }
  return occluders;
}

/* --- мощёные дороги по тропам плана: лента из каменных плит (Volcanic Rock Tiles, Poly Haven), повторяет рельеф,
   поднимается по насыпям на мосты. Края неровные, вдоль них — бордюр из камней (один вызов отрисовки). --- */
async function makeRoads(renderer) {
  const L = new THREE.TextureLoader(), aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  let col, nor;
  try {
    [col, nor] = await Promise.all([L.loadAsync('assets/textures/ground/tiles_col_1k.jpg'), L.loadAsync('assets/textures/ground/tiles_nor_1k.jpg')]);
  } catch (e) { return new THREE.Group(); }
  for (const t of [col, nor]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; }
  col.colorSpace = THREE.SRGBColorSpace;
  const pos = [], uv = [], idx = [], stones = [];
  const HALF_W = 1.6, ACROSS = 4, TILE = 2.4;
  for (const path of PATHS) {
    const pts = chaikin(path, 2), dense = [];
    for (let i = 0; i < pts.length - 1; i++) {                      // точки через 0.8 м
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.8));
      for (let k = 0; k < n; k++) dense.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
    }
    dense.push(pts[pts.length - 1]);
    let run = null, s = 0;
    const flush = () => { run = null; };
    for (let i = 0; i < dense.length; i++) {
      const [x, z] = dense[i];
      const onDeck = isFinite(deckAt(x, z)), wet = lavaInfo(x, z)[0] < 0.6, far = Math.abs(x) > 84 || Math.abs(z) > 84;
      if (onDeck || wet || far) { flush(); continue; }               // по мосту и через лаву дорога не идёт
      const a0 = dense[Math.max(0, i - 2)], a1 = dense[Math.min(dense.length - 1, i + 2)];
      const tl = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]) || 1, tx = (a1[0] - a0[0]) / tl, tz = (a1[1] - a0[1]) / tl;
      if (i > 0) s += Math.hypot(x - dense[i - 1][0], z - dense[i - 1][1]);
      const wob = 1 + (fbm(x * 0.4, z * 0.4) - 0.5) * 0.35;           // неровная ширина
      const row = pos.length / 3;
      for (let j = 0; j <= ACROSS; j++) {
        const a = (j / ACROSS - 0.5) * 2 * HALF_W * wob, px = x - tz * a, pz = z + tx * a;
        pos.push(px, heightAt(px, pz) + 0.05, pz);
        uv.push((a + HALF_W) / TILE, s / TILE);
      }
      if (run !== null) for (let j = 0; j < ACROSS; j++) { const k = run + j, n = row + j; idx.push(k, n, k + 1, k + 1, n, n + 1); }
      run = row;
      if (i % 1 === 0) for (const side of [-1, 1]) {                  // бордюр из камней
        const a = side * (HALF_W * wob + 0.15) + (hash(x, z) - 0.5) * 0.2, px = x - tz * a, pz = z + tx * a;
        stones.push([px, heightAt(px, pz), pz, 0.22 + hash(z * 3.1, x) * 0.25]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  let ny = 0; for (let i = 1; i < g.attributes.normal.count * 3; i += 3) ny += g.attributes.normal.array[i];
  if (ny < 0) { for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]]; g.setIndex(idx); g.computeVertexNormals(); }   // лицом вверх
  const mat = new THREE.MeshStandardMaterial({ map: col, normalMap: nor, color: 0xe2d6cc, roughness: 0.85,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const road = new THREE.Mesh(g, mat);
  road.receiveShadow = true;
  const group = new THREE.Group(); group.add(road);
  // бордюр: неровные камни одним вызовом
  const base = new THREE.DodecahedronGeometry(0.5, 0);
  const curb = new THREE.InstancedMesh(base, new THREE.MeshStandardMaterial({ color: 0x2a2320, roughness: 0.9, flatShading: true }), stones.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  stones.forEach(([x, y, z, r], i) => {
    e.set(hash(x, 1) * 6, hash(z, 2) * 6, 0); q.setFromEuler(e); sc.set(r * 1.3, r * 0.7, r);
    m.compose(v.set(x, y + r * 0.15, z), q, sc); curb.setMatrixAt(i, m);
  });
  curb.castShadow = true; curb.receiveShadow = true;
  group.add(curb);
  return group;
}
