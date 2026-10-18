/* Точка входа: рендерер, загрузка, игровой цикл.
   Порядок кадра: ввод → герой → жители → взаимодействие → камера → отрисовка. */
import * as THREE from 'three';
import { HERO, NPCS, MOVE, DIALOGS, PROPS } from './config.js';
import { onProgress, preload, charUrl, envUrl, characterModel } from './assets.js';
import { buildWorld } from './world.js';
import { Character } from './character.js';
import { Npc } from './npc.js';
import { FollowCamera } from './camera.js';
import { Input } from './input.js';
import { ui } from './ui.js';
import { PostFx } from './post.js';

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const view = new FollowCamera(innerWidth / innerHeight);
const post = new PostFx(renderer, scene, view.camera);
const input = new Input({ dpad: document.getElementById('dpad'), canvas });
const state = { run: true, quality: 'high', hero: null, npcs: [], world: null, focus: null, errors: [], fps: 0 };
window.__g3d = state;                       // для автотестов
addEventListener('error', (e) => state.errors.push(String(e.message)));

function resize() {
  const q = state.quality === 'high' ? Math.min(devicePixelRatio, 2) : 1;
  renderer.setPixelRatio(q);
  renderer.setSize(innerWidth, innerHeight, false);
  // постобработка дорогая на телефоне: рисуем её не выше чем в 1.5× плотности
  post.setSize(innerWidth, innerHeight, Math.min(q, 1.5));
  view.camera.aspect = innerWidth / innerHeight;
  view.camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

/* ---------- кнопки ---------- */
const bind = (id, fn) => document.getElementById(id).addEventListener('click', fn);
bind('btn-cam-left', () => view.rotateStep(-1));
bind('btn-cam-right', () => view.rotateStep(1));
bind('btn-zoom-in', () => view.zoom(1 / 1.2));
bind('btn-zoom-out', () => view.zoom(1.2));
bind('btn-run', (e) => { state.run = !state.run; e.currentTarget.classList.toggle('is-on', state.run); });
bind('btn-quality', () => {
  state.quality = state.quality === 'high' ? 'low' : 'high';
  renderer.shadowMap.enabled = state.quality === 'high';
  scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  resize();
  ui.toast(state.quality === 'high' ? 'Качество: высокое (тени, объёмный свет, цвет)' : 'Качество: экономное (без теней и эффектов)');
});
input.onRotateStep = (s) => view.rotateStep(s);
input.onRotate = (deg) => view.rotateBy(deg);
input.onZoom = (f) => view.zoom(f);
input.onAction = () => document.getElementById('btn-action').click();

/* ---------- загрузка ---------- */
async function start() {
  onProgress(ui.progress);
  await preload([charUrl(HERO.model), ...NPCS.map((n) => charUrl(n.model)), ...PROPS.map((p) => envUrl(p.model, p.pack)), envUrl('fence_wood_straight')]);
  state.world = await buildWorld(scene, renderer);
  state.hero = new Character(await characterModel(HERO.model, HERO.keep), HERO);
  scene.add(state.hero.object);
  // «свет героя», как в Diablo: тёмную модель видно на тёмной земле и ночью
  const heroLight = new THREE.PointLight(0xffd2a0, 6, 6, 1.6);
  heroLight.position.set(0, 3.2, 0.6);
  state.hero.object.add(heroLight);
  for (const def of NPCS) {
    const npc = new Npc(await characterModel(def.model, def.keep), def);
    state.npcs.push(npc);
    scene.add(npc.object);
  }
  view.focus.set(HERO.x, 1, HERO.z);
  ui.loaded();
  ui.toast('Стрелки — движение, ⟲ ⟳ — поворот камеры', 3500);
  renderer.setAnimationLoop(frame);
}

/* ---------- кадр ---------- */
const timer = new THREE.Timer();
let fpsT = 0, fpsN = 0;

function frame() {
  timer.update();
  const dt = Math.min(timer.getDelta(), 1 / 20);
  fpsT += dt; fpsN++; if (fpsT > 1) { state.fps = Math.round(fpsN / fpsT); fpsT = 0; fpsN = 0; }
  const { hero, npcs, world } = state;

  moveHero(dt);
  for (const n of npcs) { n.think(dt, hero, world.colliders); n.update(dt); }
  hero.update(dt);
  updateFocus();
  // тень следует за героем, чтобы карта теней была резкой рядом с ним
  const sun = world.lights.sun;
  sun.target.position.set(hero.position.x, 0, hero.position.z);
  sun.position.set(hero.position.x - 18, 22, hero.position.z + 10);
  view.update(dt, hero.position, world.occluders);
  if (state.quality === 'high') post.render(); else renderer.render(scene, view.camera);
}

function moveHero(dt) {
  const hero = state.hero, a = input.axis;
  if (ui.dialogOpen || !a.active) { hero.speed = 0; return; }
  const { forward, right } = view.basis();
  const dir = new THREE.Vector2().addScaledVector(right, a.x).addScaledVector(forward, -a.y).normalize();
  const speed = state.run ? MOVE.run : MOVE.walk;
  const p = hero.position, ox = p.x, oz = p.z;
  p.x += dir.x * speed * dt; p.z += dir.y * speed * dt;
  state.world.colliders.resolve(p, MOVE.radius);
  for (const n of state.npcs) {                          // жители тоже препятствия
    const dx = p.x - n.position.x, dz = p.z - n.position.z, d = Math.hypot(dx, dz), min = MOVE.radius + 0.35;
    if (d < min && d > 0) { p.x = n.position.x + (dx / d) * min; p.z = n.position.z + (dz / d) * min; }
  }
  hero.speed = Math.hypot(p.x - ox, p.z - oz) / dt;      // реальная скорость: упёрся в стену — анимация замедляется
  hero.turnTo(Math.atan2(dir.x, dir.y), dt, MOVE.turn);
}

/* ---------- взаимодействие: ближайшее в радиусе, кнопка появляется только тогда ---------- */
function updateFocus() {
  if (ui.dialogOpen) { ui.action(null); return; }
  const h = state.hero.position;
  let best = null, bestD = 2.4;
  for (const n of state.npcs) {
    const d = Math.hypot(n.position.x - h.x, n.position.z - h.z);
    if (d < bestD) { bestD = d; best = { kind: 'npc', npc: n }; }
  }
  for (const door of state.world.doors) {
    const d = Math.hypot(door.x - h.x, door.z - h.z);
    if (d < bestD) { bestD = d; best = { kind: 'door', door }; }
  }
  state.focus = best;
  if (!best) { ui.action(null); return; }
  if (best.kind === 'npc') ui.action(`💬 ${best.npc.name.split(' ').pop()}`, () => talk(best.npc));
  else ui.action('🚪 Войти', () => useDoor(best.door));
}

function talk(npc) {
  const hero = state.hero;
  input.release();
  npc.talking = hero.talking = true;
  npc.playOnce('interact');
  hero.faceTowards(npc.position.x, npc.position.z, 1, 100);
  ui.dialog(npc.def, DIALOGS[npc.def.talk], (ev) => { if (ev === 'cheer') hero.playOnce('cheer'); }, () => {
    npc.talking = hero.talking = false;
    npc.talked = true;
  });
}

function useDoor(door) {
  state.hero.playOnce('interact');
  ui.toast(`${door.name}: интерьер появится на этапе 3`, 2600);
}

start().catch((e) => { console.error(e); state.errors.push(String(e)); ui.fail('Не удалось загрузить: ' + e.message); });
