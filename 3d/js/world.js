/* Тестовая локация: земля с дорогами, здания и природа из пака KayKit, фонари, свет и туман.
   Каждый объект сразу получает коллайдер; здания помечены как «заслоняющие» для камеры. */
import * as THREE from 'three';
import { ENV_SCALE, WORLD, PATHS, SQUARE, PROPS, FENCES, LAMPS, DOORS } from './config.js';
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

  for (const p of PROPS) {
    const obj = await envModel(p.model);
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
  addLamps(scene, colliders);
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
  const sc = sun.shadow.camera; sc.left = sc.bottom = -28; sc.right = sc.top = 28; sc.near = 1; sc.far = 80;
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
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.receiveShadow = true;
  return mesh;
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

function addLamps(scene, colliders) {
  const post = new THREE.CylinderGeometry(0.07, 0.09, 2.6, 6), cap = new THREE.BoxGeometry(0.34, 0.4, 0.34);
  const wood = new THREE.MeshLambertMaterial({ color: 0x2b2118 }), glass = new THREE.MeshBasicMaterial({ color: 0xffc070 });
  for (const [x, z] of LAMPS) {
    const g = new THREE.Group();
    const p = new THREE.Mesh(post, wood); p.position.y = 1.3; p.castShadow = true;
    const c = new THREE.Mesh(cap, glass); c.position.y = 2.75;
    const light = new THREE.PointLight(0xffa64a, 9, 9, 1.8); light.position.y = 2.7;
    g.add(p, c, light); g.position.set(x, 0, z);
    scene.add(g);
    colliders.addCircle(x, z, 0.25);
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
