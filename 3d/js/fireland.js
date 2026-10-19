/* Огненные земли — первая локация нового 3D-мира.
   Всё, кроме моделей из Meshy, строится кодом:
   - рельеф из шума (холмы по краям, ровная середина для боя), трещины и русла лавы;
   - лава — свой шейдер: течёт, пульсирует, светится (её подхватывает bloom);
   - тёмное небо в дыму, красно-оранжевый туман, пепел и искры в воздухе;
   - свет без точечных ламп: низкое багровое «солнце» + отсвет лавы снизу (полусферический свет).
   Модели скал/деревьев/руин добавляются из assets/models/fire/*.glb, если они есть (см. FIRE_PROPS). */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Colliders } from './collision.js';
import { loadGltf, sharpen } from './assets.js';

const SIZE = 90, SEG = 180, HALF = SIZE / 2;

/* Русла лавы: ломаные (x, z), ширина */
const LAVA = [
  { w: 2.6, pts: [[-45, -18], [-30, -14], [-18, -20], [-8, -16], [2, -22], [14, -19], [28, -26], [45, -24]] },
  { w: 1.8, pts: [[22, 45], [18, 30], [24, 18], [20, 8], [30, 2], [45, 4]] },
];
/* Мосты-перешейки через лаву (по ним можно пройти) */
const BRIDGES = [[-8, -16], [20, 10]];

/* Модели из Meshy: имя файла → где стоят. Отсутствующие файлы пропускаются. */
export const FIRE_PROPS = [
  { model: 'rock_big', at: [[-14, 6, 20, 1.3], [16, -6, 140, 1.1], [-26, 22, 260, 1.5], [28, 24, 80, 1.4], [-34, -4, 10, 1.6], [6, 30, 200, 1.2]], col: 1.6 },
];

function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 4; i++) { s += a * vnoise(x * f, z * f); f *= 2; a *= 0.5; } return s; }

function distToPolyline(x, z, pts) {
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], vx = bx - ax, vz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
    best = Math.min(best, Math.hypot(x - ax - vx * t, z - az - vz * t));
  }
  return best;
}
/** <0 — внутри лавы; число — расстояние до берега в метрах */
export function lavaDist(x, z) {
  let d = 1e9;
  for (const r of LAVA) d = Math.min(d, distToPolyline(x, z, r.pts) - r.w);
  d += (fbm(x * 0.22 + 11, z * 0.22 - 4) - 0.5) * 1.6;            // неровный берег вместо прямых линий
  // мост: плавный каменный перешеек, без ступенек
  for (const [bx, bz] of BRIDGES) d = THREE.MathUtils.lerp(d, Math.max(d, 1.6), 1 - THREE.MathUtils.smoothstep(Math.hypot(x - bx, z - bz), 2, 4));
  return d;
}

/** Высота земли: ровная арена в центре, холмы к краям, берега лавы опускаются к руслу */
export function heightAt(x, z) {
  const r = Math.hypot(x, z) / HALF;
  let h = fbm(x * 0.06 + 3, z * 0.06 + 7) * 1.4;
  h += Math.max(0, r - 0.55) ** 2 * 26 * (0.6 + fbm(x * 0.04, z * 0.04));   // гряды по краю
  const ld = lavaDist(x, z);
  if (ld < 1.6) h = THREE.MathUtils.lerp(-0.9, h, THREE.MathUtils.smoothstep(ld, -0.4, 1.6));
  return h;
}

export async function buildFireland(scene, renderer) {
  const colliders = new Colliders(HALF - 4);
  const sky = new THREE.Color(0x1a0d0a);
  scene.background = sky;
  scene.fog = new THREE.FogExp2(0x1c0c08, 0.011);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.25;
  const hemi = new THREE.HemisphereLight(0x7a5a54, 0xc0441a, 1.1);        // снизу — отсвет лавы
  const sun = new THREE.DirectionalLight(0xff9a6a, 3.0);
  sun.position.set(-20, 18, -10); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = sc.bottom = -20; sc.right = sc.top = 20; sc.near = 1; sc.far = 80;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  scene.add(hemi, sun, sun.target);

  scene.add(makeGround());
  const lava = makeLava(); scene.add(lava.mesh);
  const ash = makeAsh(); scene.add(ash.points);

  // лава непроходима: коллайдеры-кружки вдоль русел (кроме мостов)
  for (const r of LAVA) {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 1.2);
      for (let k = 0; k <= n; k++) {
        const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n;
        if (BRIDGES.some(([px, pz]) => Math.hypot(x - px, z - pz) < 3.2)) continue;
        colliders.addCircle(x, z, r.w * 0.9);
      }
    }
  }
  await addProps(scene, colliders);

  // пепел висит вокруг героя, чтобы не тратить частицы на всю карту
  const update = (dt, t, hero) => { lava.update(t); ash.update(dt); if (hero) ash.follow(hero.position.x, hero.position.z); };
  return { colliders, occluders: [], doors: [], lights: { hemi, sun }, dummies: [], update, heightAt };
}

/* --- земля: вершинные цвета (пепел, базальт, раскалённая кромка у лавы) + мелкая фактура --- */
function makeGround() {
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  const ash = new THREE.Color(0x6e655e), basalt = new THREE.Color(0x2c2624), scorched = new THREE.Color(0x4a2a1a), hot = new THREE.Color(0xff5a14);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = heightAt(x, z);
    pos.setY(i, y);
    const n = fbm(x * 0.15, z * 0.15), ld = lavaDist(x, z);
    c.copy(basalt).lerp(ash, THREE.MathUtils.smoothstep(n, 0.35, 0.75) * 0.8);
    c.lerp(scorched, THREE.MathUtils.clamp(1 - ld / 6, 0, 1) * 0.7);
    if (ld < 1.6) c.lerp(hot, THREE.MathUtils.clamp(1 - (ld - 0.3) / 1.3, 0, 1) * 0.55);   // раскалённая кромка берега
    c.toArray(col, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, map: grainTexture(), emissive: 0x000000 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

function grainTexture() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'); g.fillStyle = '#d0d0d0'; g.fillRect(0, 0, N, N);
  let seed = 9; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 5000; i++) { const v = 130 + r() * 125; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * N, r() * N, 1 + r() * 2, 1 + r() * 2); }
  for (let i = 0; i < 300; i++) { const v = 90 + r() * 60; g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath(); g.arc(r() * N, r() * N, 1 + r() * 3, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(30, 30); t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* --- лава: свой шейдер, без текстур (весит 0 КБ, не «мылится» и не растягивается).
   Лава — лента вдоль каждого русла с координатами (s — вдоль течения в метрах, a — поперёк),
   поэтому течение всегда идёт по руслу, даже на поворотах.
   Картинка: плиты остывшей чёрной корки (ячейки Вороного) плывут по течению, между ними светятся
   раскалённые трещины; к середине русла плиты тают и открывают жидкую жёлто-оранжевую лаву.
   Значения ярче 1 подхватывает bloom — получается свечение без источников света. --- */
const LAVA_Y = -0.3;
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
  for (const r of LAVA) {
    const m = new THREE.Mesh(riverRibbon(r), mat);
    m.userData.noAO = true;
    m.renderOrder = 1;                       // после земли: скрытая под берегом часть не считается
    group.add(m);
  }
  return { mesh: group, update: (t) => { mat.uniforms.t.value = t; } };
}

/* Лента вдоль ломаной русла: шире самого русла (края уходят под берег), стыки — «в ус» */
function riverRibbon({ w, pts }) {
  const half = w + 2, ACROSS = 6, pos = [], uv = [], edge = [], idx = [];
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    const d0 = i > 0 ? new THREE.Vector2(x - pts[i - 1][0], z - pts[i - 1][1]).normalize() : null;
    const d1 = i < pts.length - 1 ? new THREE.Vector2(pts[i + 1][0] - x, pts[i + 1][1] - z).normalize() : null;
    const tan = (d0 && d1 ? d0.clone().add(d1) : (d0 || d1)).normalize();
    const miter = d0 && d1 ? 1 / Math.max(0.5, tan.dot(d1)) : 1;
    if (i > 0) s += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
    for (let j = 0; j <= ACROSS; j++) {
      const a = -half + (2 * half * j) / ACROSS;
      pos.push(x - tan.y * a * miter, LAVA_Y, z + tan.x * a * miter);
      uv.push(s, a); edge.push(w - Math.abs(a));
    }
  }
  for (let i = 0; i < pts.length - 1; i++) for (let j = 0; j < ACROSS; j++) {
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
   но при беге герой проходит сквозь него. Мягкие круглые точки, а не квадраты; искры — редкие и тёплые. --- */
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
  let t = 0, hx = 0, hz = 0;
  const step = (c, dt, fall, rise) => {
    const { pos, seed, N, R } = c;
    for (let i = 0; i < N; i++) {
      const s = seed[i], k = i * 3;
      pos[k] += Math.sin(t * 0.6 + s) * dt * 0.35;
      pos[k + 2] += Math.cos(t * 0.5 + s * 1.3) * dt * 0.35;
      pos[k + 1] += (rise ? 0.6 + (s % 1) * 0.6 : -(fall + (s % 1) * 0.25)) * dt;
      if (pos[k + 1] < 0) pos[k + 1] += 8; if (pos[k + 1] > 8) pos[k + 1] -= 8;
      // перенос через край облака вокруг героя
      if (pos[k] - hx > R) pos[k] -= 2 * R; else if (pos[k] - hx < -R) pos[k] += 2 * R;
      if (pos[k + 2] - hz > R) pos[k + 2] -= 2 * R; else if (pos[k + 2] - hz < -R) pos[k + 2] += 2 * R;
    }
    c.geo.attributes.position.needsUpdate = true;
  };
  return {
    points: group,
    update(dt) { t += dt; step(ash, dt, 0.18, false); step(sparks, dt, 0, true); sparks.points.material.opacity = 0.75 + 0.2 * Math.sin(t * 3); },
    follow(x, z) { hx = x; hz = z; },
  };
}

async function addProps(scene, colliders) {
  for (const p of FIRE_PROPS) {
    let gltf;
    try { gltf = await loadGltf(`assets/models/fire/${p.model}.glb`); } catch (e) { continue; }   // модели ещё нет
    const box = new THREE.Box3().setFromObject(gltf.scene), h = box.max.y - box.min.y;
    for (const [x, z, rot, s] of p.at) {
      const o = gltf.scene.clone(true);
      o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      sharpen(o);
      const k = (3.2 * s) / h;                                       // базовая высота скалы ≈ 3.2 м
      o.scale.setScalar(k); o.rotation.y = rot * Math.PI / 180;
      o.position.set(x, heightAt(x, z) - box.min.y * k - 0.2, z);
      scene.add(o);
      colliders.addCircle(x, z, p.col * s);
    }
  }
}
