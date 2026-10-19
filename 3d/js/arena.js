/* Тестовый полигон: ровная тёмная площадка с сеткой, без деревни и жителей.
   Нужен, чтобы проверять героя, оружие и анимации без отвлекающего окружения.
   На площадке — тренировочные чучела: по ним можно бить, они вздрагивают от удара.
   Интерфейс совпадает с buildWorld(): { colliders, occluders, doors, lights, dummies }. */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Colliders } from './collision.js';

const SIZE = 40;

export async function buildArena(scene, renderer) {
  const colliders = new Colliders(SIZE / 2 - 1);
  scene.background = new THREE.Color(0x15161a);
  scene.fog = new THREE.Fog(0x15161a, 26, 48);

  // свет как в студии: мягкое окружение (металл и кожа читаются), тёплый ключевой и холодный контровой
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  const hemi = new THREE.HemisphereLight(0xc8d2e0, 0x2a2622, 0.9);
  const sun = new THREE.DirectionalLight(0xffe2c4, 2.4);
  sun.position.set(-8, 16, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = sc.bottom = -12; sc.right = sc.top = 12; sc.near = 1; sc.far = 50;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  const rim = new THREE.DirectionalLight(0x9fb6ff, 1.2);
  rim.position.set(10, 8, -12);
  scene.add(hemi, sun, sun.target, rim);

  scene.add(makeFloor());

  const dummies = [];
  for (const [x, z] of [[-4, -3], [0, -5], [4, -3]]) {
    const d = makeDummy(x, z);
    scene.add(d.object);
    colliders.addCircle(x, z, 0.45);
    dummies.push(d);
  }
  // босс стоит в глубине полигона лицом к герою
  return { colliders, occluders: [], doors: [], lights: { hemi, sun }, dummies, bossSpawn: { x: 0, z: -12, face: 0 } };
}

/* Пол: тёмный камень с сеткой по 1 м и кругом в центре — по сетке видно скорость и размер */
function makeFloor() {
  const N = 1024, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d');
  g.fillStyle = '#2a2b30'; g.fillRect(0, 0, N, N);
  let seed = 5; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 9000; i++) {            // зерно камня
    const v = 34 + r() * 22; g.fillStyle = `rgb(${v},${v},${v + 4})`; g.fillRect(r() * N, r() * N, 2, 2);
  }
  const cell = N / 8;                          // текстура повторяется по 8 м
  g.strokeStyle = 'rgba(255,255,255,0.09)'; g.lineWidth = 2;
  for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell, N); g.moveTo(0, i * cell); g.lineTo(N, i * cell); g.stroke(); }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(SIZE / 8, SIZE / 8);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  const ring = new THREE.Mesh(new THREE.RingGeometry(5.9, 6, 96), new THREE.MeshBasicMaterial({ color: 0xd9a441, transparent: true, opacity: 0.35 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01;
  const g2 = new THREE.Group(); g2.add(floor, ring);
  return g2;
}

/* Тренировочное чучело: столб, мешок-туловище, голова. От удара качается и затухает. */
function makeDummy(x, z) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3e26, roughness: 0.85 });
  const sack = new THREE.MeshStandardMaterial({ color: 0x9a8560, roughness: 1 });
  const rope = new THREE.MeshStandardMaterial({ color: 0x3b2a18, roughness: 1 });
  const base = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.9, 8), wood); post.position.y = 0.95;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.12, 10), wood); foot.position.y = 0.06;
  const pivot = new THREE.Group(); pivot.position.y = 0.2;           // качается от основания
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.85, 12), sack); body.position.y = 1.15;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), sack); head.position.y = 1.78;
  const arms = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), wood); arms.rotation.z = Math.PI / 2; arms.position.y = 1.4;
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.025, 6, 16), rope); band.rotation.x = Math.PI / 2; band.position.y = 1.0;
  pivot.add(post, body, head, arms, band); pivot.children.forEach((m) => { m.position.y -= 0.2; m.castShadow = true; });
  base.add(foot, pivot); base.position.set(x, 0, z); foot.receiveShadow = true;
  const d = { object: base, x, z, sway: 0, vel: 0, dir: new THREE.Vector3(1, 0, 0) };
  d.hit = (fromX, fromZ) => {
    d.dir.set(x - fromX, 0, z - fromZ).normalize();
    d.vel += 3.2;
  };
  d.update = (dt) => {
    d.vel += -d.sway * 40 * dt - d.vel * 4 * dt;                     // пружина с затуханием
    d.sway += d.vel * dt;
    pivot.rotation.x = d.dir.z * d.sway * 0.35;
    pivot.rotation.z = -d.dir.x * d.sway * 0.35;
  };
  return d;
}
