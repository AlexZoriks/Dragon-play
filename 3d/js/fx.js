/* Эффекты окружения: пламя, искры, дым и пар — частицы-спрайты из атласа Kenney (fire_atlas.png, CC0).
   Две системы на всю сцену (два вызова отрисовки):
   - «огонь» — сложение цветов: языки пламени и искры; цвет по жару (жёлтый → оранжевый → красный), ярче 1 — bloom;
   - «дым» — обычное смешивание: тёмный дым и светлый пар.
   Частицы живут в мире; буфер кольцевой — новая частица занимает место самой старой, утечек нет. */
import * as THREE from 'three';

const VS = `
  attribute float aAge, aSize, aTile, aRot, aKind; uniform float scale;
  varying float vAge, vTile, vRot, vKind;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float grow = aKind > 1.5 ? 0.45 + aAge * 1.1 : (aKind > 0.5 ? 1.0 : smoothstep(0.0, 0.25, aAge) * (1.0 - aAge * 0.4));
    gl_PointSize = aAge >= 1.0 ? 0.0 : aSize * grow * scale / -mv.z;
    vAge = aAge; vTile = aTile; vRot = aRot + aAge * 0.9; vKind = aKind;
  }`;
const ATLAS = `
  uniform sampler2D atlas; varying float vAge, vTile, vRot, vKind;
  float sampleTile(){
    vec2 p = gl_PointCoord - 0.5, c = vec2(cos(vRot), sin(vRot));
    p = vec2(c.x * p.x - c.y * p.y, c.y * p.x + c.x * p.y) + 0.5;
    if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) return 0.0;
    float col = mod(vTile, 4.0), row = floor(vTile / 4.0);
    return texture2D(atlas, vec2((col + p.x) * 0.25, 1.0 - (row + p.y) * 0.5)).r;
  }`;
const FIRE_FS = ATLAS + `
  vec3 ramp(float k){
    vec3 c = mix(vec3(0.55, 0.05, 0.0), vec3(1.4, 0.45, 0.04), smoothstep(0.1, 0.45, k));
    return mix(c, vec3(1.9, 1.35, 0.6), smoothstep(0.6, 0.95, k));
  }
  void main(){
    if (vKind > 0.5) {                                   // искра
      float d = length(gl_PointCoord * 2.0 - 1.0), a = (1.0 - smoothstep(0.0, 1.0, d)) * (1.0 - vAge);
      gl_FragColor = vec4(ramp(0.9 - vAge * 0.6), a * a);
      return;
    }
    float m = sampleTile();
    gl_FragColor = vec4(ramp(m * (1.15 - vAge)), m * (1.0 - smoothstep(0.5, 1.0, vAge)));
  }`;
const SMOKE_FS = ATLAS + `
  void main(){
    float m = sampleTile();
    vec3 col = vKind > 2.5 ? vec3(0.62, 0.6, 0.58) : vec3(0.07, 0.055, 0.05);    // пар / дым
    float a = m * smoothstep(0.0, 0.15, vAge) * pow(1.0 - vAge, 1.4) * (vKind > 2.5 ? 0.55 : 0.7);
    gl_FragColor = vec4(col, a);
  }`;

let atlasTex = null;
function atlas() {
  if (!atlasTex) { atlasTex = new THREE.TextureLoader().load('assets/textures/fx/fire_atlas.png'); atlasTex.minFilter = THREE.LinearMipmapLinearFilter; }
  return atlasTex;
}

class System {
  constructor(N, fs, blending) {
    this.N = N; this.next = 0;
    this.pos = new Float32Array(N * 3); this.vel = new Float32Array(N * 3);
    this.age = new Float32Array(N).fill(1); this.life = new Float32Array(N).fill(1);
    this.size = new Float32Array(N); this.tile = new Float32Array(N); this.rot = new Float32Array(N); this.kind = new Float32Array(N);
    this.drag = new Float32Array(N); this.grav = new Float32Array(N);
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    for (const [n, a] of [['aAge', this.age], ['aSize', this.size], ['aTile', this.tile], ['aRot', this.rot], ['aKind', this.kind]]) g.setAttribute(n, new THREE.BufferAttribute(a, 1));
    const mat = new THREE.ShaderMaterial({ uniforms: { atlas: { value: atlas() }, scale: { value: 500 } }, vertexShader: VS, fragmentShader: fs,
      transparent: true, depthWrite: false, blending });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false; this.points.userData.noAO = true;
    const buf = new THREE.Vector2();
    this.points.onBeforeRender = (renderer, _s, camera) => {
      renderer.getDrawingBufferSize(buf);
      mat.uniforms.scale.value = buf.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    };
  }

  spawn(x, y, z, vx, vy, vz, { life = 1, size = 0.3, kind = 0, tile = 0, drag = 0, grav = 0 } = {}) {
    const i = this.next; this.next = (i + 1) % this.N;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.age[i] = 0; this.life[i] = life; this.size[i] = size; this.kind[i] = kind; this.tile[i] = tile;
    this.rot[i] = (Math.random() - 0.5) * 1.2; this.drag[i] = drag; this.grav[i] = grav;
  }

  update(dt) {
    const { pos, vel, age, life, drag, grav } = this;
    for (let i = 0; i < this.N; i++) {
      if (age[i] >= 1) continue;
      age[i] = Math.min(1, age[i] + dt / life[i]);
      const k = Math.max(0, 1 - drag[i] * dt);
      vel[i * 3] *= k; vel[i * 3 + 1] = vel[i * 3 + 1] * k - grav[i] * dt; vel[i * 3 + 2] *= k;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
    }
    for (const n of ['position', 'aAge', 'aSize', 'aTile', 'aRot', 'aKind']) this.geo.attributes[n].needsUpdate = true;
  }
}

const R = (a, b) => a + Math.random() * (b - a);

/** Набор эффектов сцены: fx.flame / ember / smoke / steam; fx.update(dt) — раз в кадр */
export function createFx(scene) {
  const fire = new System(900, FIRE_FS, THREE.AdditiveBlending);
  const smoke = new System(320, SMOKE_FS, THREE.NormalBlending);
  scene.add(fire.points, smoke.points);
  return {
    flame(x, y, z, { size = 0.6, up = 1.2, spread = 0.3, life = 0.6 } = {}) {
      fire.spawn(x + R(-spread, spread), y, z + R(-spread, spread), R(-0.2, 0.2), up * R(0.7, 1.3), R(-0.2, 0.2),
        { life: life * R(0.7, 1.3), size: size * R(0.7, 1.3), kind: 0, tile: Math.random() < 0.4 ? 4 + Math.floor(R(0, 2)) : Math.floor(R(0, 4)) });
    },
    ember(x, y, z, { speed = 3, up = 4, life = 1.2 } = {}) {
      const a = R(0, 6.28), s = R(0.3, 1) * speed;
      fire.spawn(x, y, z, Math.cos(a) * s, up * R(0.6, 1.2), Math.sin(a) * s, { life: life * R(0.6, 1.2), size: R(0.04, 0.09), kind: 1, grav: 6, drag: 0.4 });
    },
    smoke(x, y, z, { size = 2, up = 1.5, life = 4, spread = 0.5 } = {}) {
      smoke.spawn(x + R(-spread, spread), y, z + R(-spread, spread), R(-0.3, 0.3), up * R(0.7, 1.3), R(-0.3, 0.3),
        { life: life * R(0.8, 1.2), size: size * R(0.7, 1.3), kind: 2, tile: 6, drag: 0.15 });
    },
    steam(x, y, z, { size = 1.5, up = 6, life = 1.5, spread = 0.3 } = {}) {
      smoke.spawn(x + R(-spread, spread), y, z + R(-spread, spread), R(-0.6, 0.6), up * R(0.75, 1.25), R(-0.6, 0.6),
        { life: life * R(0.8, 1.2), size: size * R(0.7, 1.3), kind: 3, tile: Math.floor(R(0, 4)), drag: 0.8 });
    },
    update(dt) { fire.update(dt); smoke.update(dt); },
  };
}
