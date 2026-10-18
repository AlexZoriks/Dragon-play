/* Тестовая локация: земля с дорогами, здания и природа (паки KayKit Medieval и Halloween),
   кладбище, лес по краю, холмы на горизонте, фонари, свет и туман.
   Каждый объект сразу получает коллайдер; здания помечены как «заслоняющие» для камеры. */
import * as THREE from 'three';
import { ENV_SCALE, WORLD, PATHS, SQUARE, PROPS, FENCES, LAMPS, DOORS, GRAVEYARD, FOREST, HORIZON } from './config.js';
import { envModel } from './assets.js';
import { Colliders } from './collision.js';

const DEG = Math.PI / 180;
const C = {
  grass: new THREE.Color(0x4f7436), grassDark: new THREE.Color(0x36532a), grassDry: new THREE.Color(0x6c7a3c),
  dirt: new THREE.Color(0x8a6b47), dirtDark: new THREE.Color(0x6e5436),
};

export async function buildWorld(scene) {
  const half = WORLD.size / 2;
  const colliders = new Colliders(half - 1);
  const occluders = [];
  const named = {};

  scene.background = new THREE.Color(WORLD.fog[0]);
  scene.fog = new THREE.Fog(...WORLD.fog);
  const lights = addLights(scene);
  scene.add(makeGround(WORLD.size));
  scene.add(makeGrass(WORLD.size));
  scene.add(makeScatter(WORLD.size));

  for (const p of PROPS) {
    const obj = await envModel(p.model, p.pack);
    const s = p.scale ?? ENV_SCALE;
    obj.scale.setScalar(s);
    obj.rotation.y = p.rot * DEG;
    obj.position.set(p.x, 0, p.z);
    scene.add(obj);
    const isBuilding = p.model.startsWith('building_') && !p.model.includes('well');
    if (isBuilding) {
      obj.traverse((m) => { if (m.isMesh) m.material = m.material.clone(); });   // своя прозрачность у каждого здания
      obj.userData.occluder = true;
      occluders.push(obj);
    }
    addCollider(colliders, obj, p);
    if (p.name) named[p.name] = obj;
  }

  for (const f of FENCES) await addFence(scene, colliders, f);
  await addLamps(scene, colliders);
  await addGraveyard(scene, colliders);
  await addForest(scene, colliders, occluders);
  await addHorizon(scene);
  const doors = DOORS.map((d) => makeDoor(named[d.building], d));

  return { colliders, occluders, doors, lights };
}

function addLights(scene) {
  const hemi = new THREE.HemisphereLight(0xb8c8dc, 0x3a3020, 1.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9b0, 2.0);   // низкое вечернее солнце
  sun.position.set(-18, 22, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = sc.bottom = -20; sc.right = sc.top = 20; sc.near = 1; sc.far = 80;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  return { hemi, sun };
}

/* --- земля: вершинные цвета, трава с пятнами, дороги и площадь — утоптанная земля --- */
function noise(x, z) {
  return Math.sin(x * 0.31 + Math.sin(z * 0.17) * 2) * 0.5 + Math.sin(z * 0.27 + x * 0.11) * 0.5;
}

function pathDistance(x, z) {
  let best = Math.hypot(x - SQUARE.x, z - SQUARE.z) - SQUARE.r, w = 0;
  for (const p of PATHS) {
    for (let i = 0; i < p.pts.length - 1; i++) {
      const [ax, az] = p.pts[i], [bx, bz] = p.pts[i + 1];
      const vx = bx - ax, vz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
      const d = Math.hypot(x - (ax + vx * t), z - (az + vz * t)) - p.w / 2;
      if (d < best) { best = d; w = p.w; }
    }
  }
  return best;
}

function makeGround(size) {
  const seg = 140;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const d = pathDistance(x + noise(x * 3, z * 3) * 0.35, z + noise(z * 3, x * 3) * 0.35);
    const n = noise(x, z) * 0.5 + 0.5;
    c.copy(C.grass).lerp(C.grassDark, n * 0.7).lerp(C.grassDry, Math.max(0, noise(x * 0.4 + 9, z * 0.4) - 0.4) * 0.6);
    if (d < 0.6) {
      const t = THREE.MathUtils.smoothstep(d, -0.4, 0.6);      // мягкая кромка дороги
      const dirt = C.dirt.clone().lerp(C.dirtDark, noise(x * 2.1, z * 2.3) * 0.5 + 0.5);
      c.lerp(dirt, 1 - t);
    }
    c.toArray(col, i * 3);
    pos.setY(i, d < 0 ? -0.02 : Math.max(0, noise(x * 0.7, z * 0.7)) * 0.06); // дорога чуть ниже травы
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, map: detailTexture() }));
  mesh.receiveShadow = true;
  return mesh;
}

/* Мелкая фактура земли (штрихи травы, крапинки, камешки), рисуется один раз на холсте
   и повторяется по всей карте; цвет даёт вершинная раскраска, текстура — только светотень. */
function detailTexture() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d');
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, N, N);
  let seed = 3; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 2600; i++) {                     // штрихи
    const x = r() * N, y = r() * N, l = 3 + r() * 6, a = -1.2 + r() * 0.5, v = 150 + r() * 105;
    g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = 1 + r();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  for (let i = 0; i < 260; i++) {                      // крапинки и камешки
    const v = r() < 0.5 ? 120 + r() * 40 : 245;
    g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath(); g.arc(r() * N, r() * N, 0.6 + r() * 1.6, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(26, 26); t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* Цветы и мелкие камни на траве: два InstancedMesh */
function makeScatter(size) {
  const group = new THREE.Group();
  let seed = 19; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const place = (mesh, n, colorFn, sMin, sMax) => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    let i = 0;
    while (i < n) {
      const x = (r() - 0.5) * size * 0.9, z = (r() - 0.5) * size * 0.9;
      if (pathDistance(x, z) < 0.4) continue;
      e.set(0, r() * 6.3, 0); q.setFromEuler(e); const k = sMin + r() * (sMax - sMin); s.set(k, k * (0.7 + r() * 0.6), k);
      mesh.setMatrixAt(i, m.compose(p.set(x, 0, z), q, s)); mesh.setColorAt(i, colorFn(col)); i++;
    }
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  };
  const flower = new THREE.IcosahedronGeometry(0.07, 0); flower.translate(0, 0.12, 0);
  const petals = ['#c9b04a', '#b8584a', '#8a78b8', '#d8d4c4'];
  place(new THREE.InstancedMesh(flower, new THREE.MeshLambertMaterial(), 420), 420, (c) => c.set(petals[Math.floor(r() * 4)]), 0.8, 1.3);
  const pebble = new THREE.DodecahedronGeometry(0.12, 0); pebble.translate(0, 0.04, 0);
  place(new THREE.InstancedMesh(pebble, new THREE.MeshLambertMaterial(), 150), 150, (c) => c.setHSL(0.08, 0.05, 0.2 + r() * 0.12), 0.6, 1.5);
  return group;
}

/* --- пучки травы: один InstancedMesh, дешёво для телефона --- */
function makeGrass(size) {
  const blade = new THREE.ConeGeometry(0.06, 0.32, 3, 1);
  blade.translate(0, 0.16, 0);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const N = 1800, mesh = new THREE.InstancedMesh(blade, mat, N), m = new THREE.Matrix4(), q = new THREE.Quaternion();
  const e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3(), color = new THREE.Color();
  let n = 0, seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  while (n < N) {
    const x = (rnd() - 0.5) * size * 0.95, z = (rnd() - 0.5) * size * 0.95;
    if (pathDistance(x, z) < 0.8) continue;
    e.set((rnd() - 0.5) * 0.5, rnd() * 6.3, (rnd() - 0.5) * 0.5); q.setFromEuler(e);
    const k = 0.7 + rnd() * 0.9; s.set(k, k, k); p.set(x, 0, z);
    mesh.setMatrixAt(n, m.compose(p, q, s));
    mesh.setColorAt(n, color.setHSL(0.25 + rnd() * 0.05, 0.5, 0.17 + rnd() * 0.08));
    n++;
  }
  mesh.receiveShadow = true;
  return mesh;
}

/* --- коллайдер по габаритам модели в её собственных осях --- */
function addCollider(colliders, obj, p) {
  if (!p.col) return;
  const s = obj.scale.x, rot = obj.rotation.y;
  obj.rotation.y = 0; obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  obj.rotation.y = rot; obj.updateMatrixWorld(true);
  const cx = (box.min.x + box.max.x) / 2 - p.x, cz = (box.min.z + box.max.z) / 2 - p.z;
  // смещение центра с учётом поворота
  const wx = p.x + cx * Math.cos(rot) + cz * Math.sin(rot), wz = p.z - cx * Math.sin(rot) + cz * Math.cos(rot);
  const hw = (box.max.x - box.min.x) / 2, hd = (box.max.z - box.min.z) / 2;
  if (p.col === 'circle') colliders.addCircle(wx, wz, p.rcol ?? Math.max(hw, hd) * 0.85);
  else colliders.addBox(wx, wz, hw * 0.86, hd * 0.86, rot);   // карнизы и крыши шире стен
  obj.userData.collider = { x: wx, z: wz, hw, hd, rot, s };
}

async function addFence(scene, colliders, f) {
  const [ax, az] = f.from, [bx, bz] = f.to, len = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bx - ax, bz - az);
  const proto = await envModel('fence_wood_straight');
  proto.scale.setScalar(2.6);
  const box = new THREE.Box3().setFromObject(proto), segLen = box.max.z - box.min.z, off = (box.min.x + box.max.x) / 2;
  const count = Math.max(1, Math.round(len / segLen));
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count, o = proto.clone();
    o.rotation.y = ang;
    o.position.set(ax + (bx - ax) * t - off * Math.cos(ang), 0, az + (bz - az) * t + off * Math.sin(ang));
    scene.add(o);
  }
  colliders.addBox((ax + bx) / 2, (az + bz) / 2, 0.15, len / 2, ang);
}

async function addLamps(scene, colliders) {
  for (const [x, z, rot] of LAMPS) {
    const lamp = await envModel('post_lantern', 'gothic');
    lamp.rotation.y = rot * DEG; lamp.position.set(x, 0, z);
    // фонарь висит на кронштейне: свет ставим в точку лампы
    const head = new THREE.Vector3(0, 2.7, 1.1).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot * DEG);
    const light = new THREE.PointLight(0xffa04a, 14, 10, 1.7);
    light.position.copy(head).add(lamp.position);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd08a }));
    glow.position.copy(light.position).y -= 0.1;
    scene.add(lamp, light, glow);
    colliders.addCircle(x, z, 0.3);
  }
}

async function addGraveyard(scene, colliders) {
  const G = GRAVEYARD, x0 = G.x - G.w / 2, x1 = G.x + G.w / 2, z0 = G.z - G.d / 2, z1 = G.z + G.d / 2;
  const fenceLine = async (ax, az, bx, bz, gapAt = null) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.round(len / 4), ang = Math.atan2(bz - az, bx - ax);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      if (gapAt !== null && Math.abs(t - gapAt) < 0.5 / n) {
        const gate = await envModel('arch_gate', 'gothic'); gate.position.set(x, 0, z); gate.rotation.y = -ang; scene.add(gate);
        colliders.addCircle(x + Math.cos(ang) * 1.9, z + Math.sin(ang) * 1.9, 0.35); colliders.addCircle(x - Math.cos(ang) * 1.9, z - Math.sin(ang) * 1.9, 0.35);
        continue;
      }
      const f = await envModel(i % 3 === 2 ? 'fence_broken' : 'fence', 'gothic'); f.position.set(x, 0, z); f.rotation.y = -ang; scene.add(f);
      colliders.addBox(x, z, 2, 0.25, -ang);
    }
    for (const [px, pz] of [[ax, az], [bx, bz]]) { const p = await envModel('fence_pillar', 'gothic'); p.position.set(px, 0, pz); scene.add(p); }
  };
  await fenceLine(x0, z1, x1, z1, 0.5);                 // южная сторона с воротами
  await fenceLine(x0, z0, x1, z0);
  await fenceLine(x0, z0, x0, z1);
  await fenceLine(x1, z0, x1, z1);
  for (const [name, dx, dz, rot] of G.items) {
    const o = await envModel(name, 'gothic'); o.position.set(G.x + dx, 0, G.z + dz); o.rotation.y = rot * DEG; scene.add(o);
    if (!name.startsWith('candle')) addCollider(colliders, o, { x: G.x + dx, z: G.z + dz, col: name.startsWith('tree') ? 'circle' : 'box', rcol: 0.5 });
  }
  const candle = new THREE.PointLight(0xff9a3a, 6, 7, 1.8); candle.position.set(G.x + 1.5, 1.4, G.z - 0.2); scene.add(candle);
}

/* Лес по краю: случайные (но всегда одинаковые) деревья в кольце между inner и outer */
async function addForest(scene, colliders) {
  const kinds = [['tree_pine_orange_large', 'gothic', 1], ['tree_pine_yellow_large', 'gothic', 1], ['tree_pine_orange_medium', 'gothic', 1.2],
    ['trees_B_large', 'env', ENV_SCALE], ['trees_A_large', 'env', ENV_SCALE], ['tree_dead_large', 'gothic', 1.1]];
  let seed = FOREST.seed; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let placed = 0, tries = 0;
  while (placed < FOREST.count && tries++ < 2000) {
    const x = (r() * 2 - 1) * FOREST.outer, z = (r() * 2 - 1) * FOREST.outer, m = Math.max(Math.abs(x), Math.abs(z));
    if (m < FOREST.inner || pathDistance(x, z) < 2.5) continue;
    if (Math.abs(x - GRAVEYARD.x) < GRAVEYARD.w / 2 + 2 && Math.abs(z - GRAVEYARD.z) < GRAVEYARD.d / 2 + 2) continue;
    const [name, pack, sc] = kinds[Math.floor(r() * kinds.length)];
    const o = await envModel(name, pack); o.scale.setScalar(sc * (0.85 + r() * 0.35)); o.rotation.y = r() * 6.28; o.position.set(x, 0, z);
    scene.add(o); colliders.addCircle(x, z, 0.8); placed++;
  }
}

async function addHorizon(scene) {
  for (const [name, x, z, rot, sc] of HORIZON) {
    const o = await envModel(name); o.scale.setScalar(sc); o.rotation.y = rot * DEG; o.position.set(x, -0.3, z);
    o.traverse((m) => { if (m.isMesh) m.castShadow = false; });
    scene.add(o);
  }
}

/* --- вход в здание: точка у крыльца модели. Нарисованная дверь модели статична и не анимируется сама;
   переход внутрь запускается только действием игрока. --- */
function makeDoor(building, d) {
  const col = building.userData.collider, rot = building.rotation.y;
  const lx = d.local[0] * building.scale.x, lz = col.hd + 0.9;              // перед крыльцом
  const x = col.x + lx * Math.cos(rot) + lz * Math.sin(rot), z = col.z - lx * Math.sin(rot) + lz * Math.cos(rot);
  return { ...d, x, z, rot };
}
