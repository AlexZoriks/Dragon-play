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
  if (ld < 3) h = THREE.MathUtils.lerp(-0.45, h, THREE.MathUtils.smoothstep(ld, -0.5, 3));
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
    if (ld < 1.2) c.lerp(hot, THREE.MathUtils.clamp(1 - ld / 1.2, 0, 1) * 0.6);
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

/* --- лава на текстурах ambientCG (CC0): Lava001 — остывающая корка, Lava005 — жидкая горячая лава.
   Ближе к берегу — корка, к середине русла — горячая (маска расстояния до берега запекается в текстуру).
   Течение без растягивания: два слоя со сдвигом по времени перетекают друг в друга (flow-crossfade).
   Свечение берётся из карты Emission и усиливается выше 1 — его подхватывает bloom. --- */
function makeLava() {
  const L = new THREE.TextureLoader(), dir = 'assets/textures/lava/';
  const tex = (f, srgb) => {
    const t = L.load(dir + f); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  // маска: 0 — у берега, 1 — середина русла (по lavaDist), 256×256 на всю карту
  const M = 256, data = new Uint8Array(M * M);
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    const x = (i + 0.5) / M * SIZE - HALF, z = (j + 0.5) / M * SIZE - HALF;
    data[j * M + i] = Math.round(THREE.MathUtils.clamp(-lavaDist(x, z) / 1.6, 0, 1) * 255);
  }
  const mask = new THREE.DataTexture(data, M, M, THREE.RedFormat); mask.magFilter = mask.minFilter = THREE.LinearFilter; mask.needsUpdate = true;

  const geo = new THREE.PlaneGeometry(SIZE, SIZE, 1, 1); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      t: { value: 0 }, mask: { value: mask }, size: { value: SIZE },
      cC: { value: tex('crust_color.jpg', true) }, cE: { value: tex('crust_emission.jpg', true) }, cN: { value: tex('crust_normal.jpg') },
      hC: { value: tex('hot_color.jpg', true) }, hE: { value: tex('hot_emission.jpg', true) }, hN: { value: tex('hot_normal.jpg') },
      sunDir: { value: new THREE.Vector3(-20, 18, -10).normalize() },
    },
    fog: false,
    vertexShader: 'varying vec2 vP; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `
      uniform float t, size; uniform sampler2D mask, cC, cE, cN, hC, hE, hN; uniform vec3 sunDir; varying vec2 vP;
      // два слоя течения со сдвигом фазы: пока один «растягивается», второй его плавно заменяет
      vec3 flowTex(sampler2D s, vec2 uv, vec2 dir, float speed) {
        float p0 = fract(t * speed), p1 = fract(t * speed + 0.5);
        float w = abs(p0 - 0.5) * 2.0;
        return mix(texture2D(s, uv + dir * p0).rgb, texture2D(s, uv + dir * p1 + 0.37).rgb, w);
      }
      void main() {
        float m = texture2D(mask, vP / size + 0.5).r;               // 0 у берега … 1 в середине
        vec2 uv = vP * 0.16;
        vec2 dir = vec2(0.35, 0.12);
        vec3 crC = flowTex(cC, uv, dir * 0.6, 0.03), crE = flowTex(cE, uv, dir * 0.6, 0.03), crN = flowTex(cN, uv, dir * 0.6, 0.03);
        vec3 hoC = flowTex(hC, uv * 0.8, dir, 0.06), hoE = flowTex(hE, uv * 0.8, dir, 0.06), hoN = flowTex(hN, uv * 0.8, dir, 0.06);
        float k = smoothstep(0.15, 0.85, m);
        vec3 col = mix(crC, hoC, k), emi = mix(crE, hoE, k);
        vec3 n = normalize(mix(crN, hoN, k) * 2.0 - 1.0); n = normalize(vec3(n.x, n.z, -n.y));   // карта нормалей → мировой Y вверх
        float lit = 0.25 + 0.75 * max(dot(n, sunDir), 0.0);
        float pulse = 0.9 + 0.1 * sin(t * 1.7 + vP.x * 0.3 + vP.y * 0.2);
        vec3 c = col * lit * 0.35 + emi * (1.6 + 0.8 * k) * pulse;    // яркие прожилки >1 светятся через bloom
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = -0.3;
  mesh.userData.noAO = true;
  return { mesh, update: (t) => { mat.uniforms.t.value = t; } };
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
