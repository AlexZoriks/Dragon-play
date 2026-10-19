/* Оружие в руке героя: модель крепится к кости кисти и двигается вместе с анимациями.
   Огонь вокруг клинка — процедурные языки пламени (70 частиц, аддитивно), без источников света:
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

  const weapon = { model, grip, fire: null, dispose: () => weapon.fire?.dispose() };
  if (def.fire) {
    const blade = def.length * def.grip;                 // клинок — часть ниже рукояти
    weapon.fire = makeFire(grip, blade * 0.85, blade * 0.08);
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

/* --- Огонь клинка. Языки пламени — рисованные спрайты Kenney Particle Pack (CC0), собранные
   в один атлас 512×256 (8 кадров, 30 КБ): 4 «дымных» языка, 2 острых язычка, огонь, искра.
   Спрайт серый — цвет даёт шейдер по «жару»: белёсо-жёлтый → оранжевый → тёмно-красный → гаснет.
   Каждая частица со своим кадром и поворотом — пламя не повторяется.
   Частицы рождаются на клинке, но живут в мире: при взмахе за мечом остаётся огненный шлейф.
   Часть частиц — мелкие угольки, они летят дальше и гаснут дольше. --- */
const FIRE_VS = `
  attribute float aAge, aSeed, aSize, aKind, aTile, aRot; uniform float scale;
  varying float vAge, vKind, vTile, vRot;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float grow = aKind > 0.5 ? 1.0 : smoothstep(0.0, 0.25, aAge) * (1.0 - aAge * 0.4);
    gl_PointSize = aSize * grow * scale / -mv.z;
    vAge = aAge; vKind = aKind; vTile = aTile; vRot = aRot + aSeed * aAge * 0.6;
  }`;
const FIRE_FS = `
  uniform sampler2D atlas; varying float vAge, vKind, vTile, vRot;
  vec3 ramp(float k){                                   // цвет по жару; >1 — подхватит bloom
    vec3 c = mix(vec3(0.55, 0.05, 0.0), vec3(1.4, 0.45, 0.04), smoothstep(0.1, 0.45, k));
    return mix(c, vec3(1.9, 1.35, 0.6), smoothstep(0.6, 0.95, k));
  }
  void main(){
    if (vKind > 0.5) {                                   // уголёк: маленькая яркая точка
      float d = length(gl_PointCoord * 2.0 - 1.0), a = (1.0 - smoothstep(0.0, 1.0, d)) * (1.0 - vAge);
      gl_FragColor = vec4(ramp(0.9 - vAge * 0.6), a * a);
      return;
    }
    vec2 p = gl_PointCoord - 0.5, c = vec2(cos(vRot), sin(vRot));
    p = vec2(c.x * p.x - c.y * p.y, c.y * p.x + c.x * p.y) + 0.5;
    if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) discard;
    float col = mod(vTile, 4.0), row = floor(vTile / 4.0);
    float m = texture2D(atlas, vec2((col + p.x) * 0.25, 1.0 - (row + p.y) * 0.5)).r;
    float heat = m * (1.15 - vAge);
    float a = m * (1.0 - smoothstep(0.5, 1.0, vAge));
    gl_FragColor = vec4(ramp(heat), a);
  }`;
let atlasTex = null;
function fireAtlas() {
  if (!atlasTex) {
    atlasTex = new THREE.TextureLoader().load('assets/textures/fx/fire_atlas.png');
    atlasTex.minFilter = THREE.LinearMipmapLinearFilter;
  }
  return atlasTex;
}

function makeFire(grip, bladeLen, bladeStart) {
  const N = 70, SPARKS = 12;
  const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3);
  const age = new Float32Array(N), life = new Float32Array(N), seed = new Float32Array(N), size = new Float32Array(N), kind = new Float32Array(N);
  const tile = new Float32Array(N), rot = new Float32Array(N);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aAge', new THREE.BufferAttribute(age, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
  geo.setAttribute('aTile', new THREE.BufferAttribute(tile, 1));
  geo.setAttribute('aRot', new THREE.BufferAttribute(rot, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { atlas: { value: fireAtlas() }, scale: { value: 500 } }, vertexShader: FIRE_VS, fragmentShader: FIRE_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.userData.noAO = true;
  // размер точки в пикселях = метры × (высота кадра / (2·tg(fov/2))) / расстояние
  const buf = new THREE.Vector2();
  points.onBeforeRender = (renderer, _scene, camera) => {
    renderer.getDrawingBufferSize(buf);
    mat.uniforms.scale.value = buf.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  };

  const v = new THREE.Vector3();
  const spawn = (i) => {
    const spark = i < SPARKS;
    kind[i] = spark ? 1 : 0;
    age[i] = 0; seed[i] = Math.random();
    life[i] = spark ? 0.6 + Math.random() * 0.6 : 0.28 + Math.random() * 0.3;
    const tongue = Math.random() < 0.4;                 // острый язычок (кадры 4–5) или дымный язык (0–3)
    tile[i] = tongue ? 4 + Math.floor(Math.random() * 2) : Math.floor(Math.random() * 4);
    rot[i] = (Math.random() - 0.5) * (tongue ? 0.4 : 1.4);
    size[i] = spark ? 0.035 + Math.random() * 0.03 : tongue ? 0.16 + Math.random() * 0.12 : 0.22 + Math.random() * 0.18;
    // точка на клинке (у основания пламя гуще), в координатах рукояти → в мир
    const along = Math.pow(Math.random(), 0.8);
    v.set((Math.random() - 0.5) * 0.05, -bladeStart - along * bladeLen, (Math.random() - 0.5) * 0.03);
    grip.localToWorld(v).toArray(pos, i * 3);
    const up = spark ? 1.0 + Math.random() * 1.2 : 0.5 + Math.random() * 0.5;
    const side = spark ? 0.8 : 0.15;
    vel[i * 3] = (Math.random() - 0.5) * side; vel[i * 3 + 1] = up; vel[i * 3 + 2] = (Math.random() - 0.5) * side;
  };
  for (let i = 0; i < N; i++) { spawn(i); age[i] = Math.random(); }
  return {
    points,
    update(dt) {
      if (!points.parent) {                  // частицы живут в мире: добавляем в сцену, как только меч в ней
        let root = grip; while (root.parent) root = root.parent;
        if (!root.isScene) return;
        root.add(points);
      }
      grip.updateWorldMatrix(true, false);
      for (let i = 0; i < N; i++) {
        age[i] += dt / life[i];
        if (age[i] >= 1) { spawn(i); continue; }
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      }
      for (const k of ['position', 'aAge', 'aSeed', 'aSize', 'aKind', 'aTile', 'aRot']) geo.attributes[k].needsUpdate = true;
    },
    dispose() { points.removeFromParent(); geo.dispose(); mat.dispose(); },
  };
}
