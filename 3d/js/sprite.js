/* HD-2D: пиксельный персонаж в 3D-мире.
   - 8 направлений (PixelLab rotations): кадр выбирается по углу между взглядом персонажа и камерой;
   - щит-плоскость всегда повёрнута к камере по горизонтали (персонаж не «ложится» при наклоне камеры);
   - один масштаб пикселя для всех: 1 px = PX метров, поэтому рост задаёт сам рисунок;
   - освещается светом сцены (фонари, солнце), отбрасывает тень и мягкое пятно под ногами;
   - без кадров ходьбы — шаг передаётся покачиванием (как в первых HD-2D-прототипах).
   Интерфейс совпадает с Character: object, position, heading, speed, talking, update(), playOnce(), turnTo(). */
import * as THREE from 'three';

export const PX = 1.8 / 52;                    // метров в одном пикселе спрайта
// по часовой при взгляде сверху: 0 — лицом к камере, +90° — смотрит вправо по экрану
const DIRS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'];
const loader = new THREE.TextureLoader();
let meta = null;

async function loadMeta() {
  meta ??= await (await fetch('assets/sprites/sprites.json')).json();
  return meta;
}

function loadTex(url) {
  return new Promise((ok, fail) => loader.load(url, (t) => {
    t.magFilter = THREE.NearestFilter;          // чёткие пиксели
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    ok(t);
  }, undefined, fail));
}

export async function loadSprite(id) {
  const m = (await loadMeta())[id];
  const tex = await Promise.all(DIRS.map((d) => loadTex(`assets/sprites/${id}/${d}.png`)));
  return { id, tex, size: m.size, bbox: m.bbox };
}

let shadowTex = null;
function blobShadow() {
  if (!shadowTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 4, 32, 32, 31);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    shadowTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.02; m.renderOrder = 1; m.userData.noAO = true;
  return m;
}

export class SpriteCharacter {
  constructor(sprite, { x = 0, z = 0, face = 0 } = {}, camera) {
    this.sprite = sprite;
    this.camera = camera;
    this.object = new THREE.Group();
    this.object.position.set(x, 0, z);
    this.heading = THREE.MathUtils.degToRad(face);
    this.speed = 0;
    this.talking = false;
    this.state = 'idle';
    this.phase = Math.random() * 6;
    this.hop = 0;                                // разовый «прыжок» (радость, разговор)

    const s = sprite.size * PX, [, , , by] = sprite.bbox;
    const geo = new THREE.PlaneGeometry(s, s);
    geo.translate(0, s / 2 - (sprite.size - by) * PX, 0);   // ноги рисунка — на земле
    this.material = new THREE.MeshLambertMaterial({ map: sprite.tex[0], alphaTest: 0.5, side: THREE.DoubleSide });
    this.board = new THREE.Mesh(geo, this.material);
    this.board.castShadow = true;
    this.board.userData.noAO = true;
    this.board.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: sprite.tex[0], alphaTest: 0.5 });
    this.pivot = new THREE.Group();                // поворот к камере
    this.pivot.add(this.board);
    this.object.add(this.pivot, blobShadow());
  }

  get position() { return this.object.position; }

  turnTo(target, dt, rate = 12) {
    let d = target - this.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.heading += d * Math.min(1, rate * dt);
  }

  faceTowards(x, z, dt, rate) { this.turnTo(Math.atan2(x - this.position.x, z - this.position.z), dt, rate); }

  playOnce(key) { if (key === 'cheer' || key === 'interact') this.hop = 1; }

  update(dt) {
    // щит смотрит на камеру только по горизонтали
    const cam = this.camera.position, p = this.position;
    const camYaw = Math.atan2(cam.x - p.x, cam.z - p.z);
    this.pivot.rotation.y = camYaw;
    // кадр: угол взгляда персонажа относительно направления на камеру
    let rel = this.heading - camYaw;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    const i = ((Math.round(rel / (Math.PI / 4)) % 8) + 8) % 8;
    const tex = this.sprite.tex[i];
    if (this.material.map !== tex) { this.material.map = tex; this.board.customDepthMaterial.map = tex; }
    // движение: шаг — покачивание и лёгкий наклон, на месте — дыхание
    const moving = this.speed > 0.15;
    this.state = this.talking ? 'idle' : this.speed > 3.2 ? 'run' : moving ? 'walk' : 'idle';
    this.phase += dt * (moving ? 5 + this.speed * 1.8 : 2);
    this.hop = Math.max(0, this.hop - dt * 2.5);
    const step = moving ? Math.abs(Math.sin(this.phase)) * 0.09 : 0;
    const hop = Math.sin(this.hop * Math.PI) * 0.35;
    this.board.position.y = step + hop;
    this.board.scale.set(1 + (moving ? 0 : Math.sin(this.phase) * 0.012), 1 - (moving ? 0 : Math.sin(this.phase) * 0.012), 1);
    this.board.rotation.z = moving ? Math.sin(this.phase) * 0.06 : 0;
  }
}
