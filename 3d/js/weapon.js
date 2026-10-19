/* Оружие в руке героя: модель крепится к кости кисти и двигается вместе с анимациями.
   Огонь вокруг клинка — лёгкие частицы (40 точек, аддитивно), без источников света:
   клинок светится сам за счёт emissive-текстуры трещин, а свечение (bloom) делает ореол. */
import * as THREE from 'three';
import { loadGltf, sharpen } from './assets.js';

/**
 * def: { model, bone, length, grip, aim:[x,y,z], offset:[x,y,z] м, fire }
 *  length — длина оружия в метрах; grip — где у модели середина рукояти (в долях от низа 0..1);
 *  aim — куда смотрит клинок в позе привязки (A-поза), в осях персонажа: +z вперёд, +y вверх, +x влево.
 *  Посадка вычисляется сама из направления кости — шаблон подходит к любому скелету Mixamo/Meshy.
 */
export async function attachWeapon(character, def) {
  const gltf = await loadGltf(`assets/models/chars/${def.model}.glb`);
  const bone = findBone(character.object, def.bone);
  if (!bone) return null;

  const model = gltf.scene.clone(true);
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  sharpen(model);
  const box = new THREE.Box3().setFromObject(model), h = box.max.y - box.min.y;
  const k = def.length / h;
  model.scale.setScalar(k);
  // рукоять — в начало координат, клинок вдоль -Y
  model.position.set(-(box.min.x + box.max.x) / 2 * k, -(box.min.y + h * def.grip) * k, -(box.min.z + box.max.z) / 2 * k);

  const grip = new THREE.Group();          // в метрах, независимо от масштаба скелета
  grip.add(model);
  grip.position.set(...def.offset);

  const holder = new THREE.Group();        // компенсирует масштаб кости (у Mixamo-скелета он 0.01)
  character.object.updateMatrixWorld(true);
  const ws = bone.getWorldScale(new THREE.Vector3());
  holder.scale.set(1 / ws.x, 1 / ws.y, 1 / ws.z);
  holder.add(grip);
  bone.add(holder);
  aimGrip(character, holder, grip, def.aim);

  const weapon = { model, grip, fire: null };
  if (def.fire) {
    weapon.fire = makeFire(def.length * (1 - def.grip) * 0.85);
    weapon.fire.points.position.y = -def.length * (1 - def.grip) * 0.08;
    grip.add(weapon.fire.points);
  }
  return weapon;
}

export function updateWeapon(weapon, dt) {
  if (weapon?.fire) weapon.fire.update(dt);
}

/* Поворачивает рукоять так, чтобы клинок (−Y модели) смотрел вдоль aim, а гарда (X модели) лежала горизонтально.
   Считается в позе привязки, один раз: дальше оружие просто следует за костью в любой анимации. */
function aimGrip(character, holder, grip, aim) {
  character.object.updateMatrixWorld(true);
  const body = new THREE.Quaternion(); character.object.getWorldQuaternion(body);
  const blade = new THREE.Vector3(...aim).normalize().applyQuaternion(body);         // в мире
  const yAxis = blade.clone().negate();
  let xAxis = new THREE.Vector3(0, 1, 0).cross(yAxis);
  if (xAxis.lengthSq() < 1e-4) xAxis.set(1, 0, 0);
  xAxis.normalize();
  const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();
  const want = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
  const parent = new THREE.Quaternion(); holder.getWorldQuaternion(parent);
  grip.quaternion.copy(parent.invert().multiply(want));
}

function findBone(root, pattern) {
  let found = null;
  const re = new RegExp(pattern, 'i');
  root.traverse((o) => { if (!found && o.isBone && re.test(o.name)) found = o; });
  return found;
}

/* Языки пламени вдоль клинка: частицы рождаются на клинке, поднимаются и гаснут */
let flameTex = null;
function flameTexture() {
  if (flameTex) return flameTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,240,180,1)'); gr.addColorStop(0.35, 'rgba(255,140,40,0.8)'); gr.addColorStop(1, 'rgba(255,60,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  flameTex = new THREE.CanvasTexture(c); flameTex.colorSpace = THREE.SRGBColorSpace;
  return flameTex;
}

function makeFire(bladeLen) {
  const N = 40, pos = new Float32Array(N * 3), life = new Float32Array(N), vel = new Float32Array(N * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ size: 0.16, map: flameTexture(), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, color: 0xff9a40, sizeAttenuation: true });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.userData.noAO = true;
  const spawn = (i) => {
    life[i] = 0.3 + Math.random() * 0.5;
    pos[i * 3] = (Math.random() - 0.5) * 0.06;
    pos[i * 3 + 1] = -Math.random() * bladeLen;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 0.03;
    vel[i * 3] = (Math.random() - 0.5) * 0.2; vel[i * 3 + 1] = 0.15 + Math.random() * 0.25; vel[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
  };
  for (let i = 0; i < N; i++) { spawn(i); life[i] *= Math.random(); }
  return {
    points,
    update(dt) {
      for (let i = 0; i < N; i++) {
        life[i] -= dt;
        if (life[i] <= 0) spawn(i);
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = 0.75 + Math.sin(performance.now() / 90) * 0.15;
    },
  };
}
