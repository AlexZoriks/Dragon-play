/* Точка входа: рендерер, загрузка, игровой цикл.
   Порядок кадра: ввод → герой → жители → взаимодействие → камера → отрисовка. */
import * as THREE from 'three';
import { HERO, SKINS, DEFAULT_SKIN, NPCS, MOVE, DIALOGS, PROPS, CHAR_MODE_DEFAULT } from './config.js';
import { onProgress, preload, charUrl, envUrl, characterModel, setMaxAnisotropy } from './assets.js';
import { buildWorld } from './world.js';
import { buildArena } from './arena.js';
import { buildFireland } from './fireland.js';
import { Character } from './character.js';
import { Npc, SpriteNpc } from './npc.js';
import { SpriteCharacter, loadSprite } from './sprite.js';
import { attachWeapon, updateWeapon } from './weapon.js';
import { FollowCamera } from './camera.js';
import { Input } from './input.js';
import { ui } from './ui.js';
import { PostFx } from './post.js';
import { Boss, BOSS_DEF } from './boss.js';
import { combatUi } from './combat-ui.js';
import { Minimap, captureMap } from './minimap.js';

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
setMaxAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
const view = new FollowCamera(innerWidth / innerHeight);
const post = new PostFx(renderer, scene, view.camera);
const input = new Input({ dpad: document.getElementById('dpad'), canvas });
const state = { autoQ: true, run: true, quality: 'medium', hero: null, npcs: [], world: null, focus: null, errors: [], fps: 0,
  boss: null, hp: 100, maxHp: 100, hurtT: 99 };
window.__g3d = state;                       // для автотестов
state.view = view; state.renderer = renderer; state.scene = scene;     // для автотестов и снимка карты
state.setGrip = (rot, off, order = 'YXZ') => { const g = state.weapon.grip; g.rotation.set(...rot.map((a) => a * Math.PI / 180), order); if (off) g.position.set(...off); };
addEventListener('error', (e) => state.errors.push(String(e.message)));

/* Качество графики: три уровня. На телефоне по умолчанию «среднее»; если кадров мало — понижается само.
   high   — чёткость до 2×, тени 2048, затенение углов (GTAO), свечение, цвет и «миниатюра»;
   medium — чёткость до 1.5×, тени 1024, только цвет и «миниатюра» (самое дорогое выключено);
   low    — чёткость 1×, без теней и постобработки. */
/* px — потолок числа пикселей кадра: на большом мониторе с плотностью 2 кадр иначе выходит 6+ млн пикселей */
const QUALITY = {
  high: { name: 'высокое', dpr: 2, px: 2.4e6, shadow: 2048, ao: true, bloom: true, post: true },
  medium: { name: 'среднее', dpr: 1.5, px: 1.3e6, shadow: 1024, ao: false, bloom: true, post: true },
  low: { name: 'экономное', dpr: 1, px: 0.8e6, shadow: 0, ao: false, bloom: false, post: false },
};
const ORDER = ['high', 'medium', 'low'];
state.quality = initialQuality();
function initialQuality() {
  try { const q = localStorage.getItem('g3d-quality'); if (QUALITY[q]) return q; } catch (e) { /* приватный режим */ }
  return 'medium';                              // «высокое» — только вручную, если устройство тянет
}
function applyQuality(q, announce = true) {
  state.quality = q;
  const Q = QUALITY[q];
  const wantShadows = Q.shadow > 0;
  if (renderer.shadowMap.enabled !== wantShadows) {
    renderer.shadowMap.enabled = wantShadows;
    scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
  }
  const sun = state.world?.lights.sun;
  if (sun && wantShadows && sun.shadow.mapSize.x !== Q.shadow) {
    sun.shadow.mapSize.set(Q.shadow, Q.shadow); sun.shadow.map?.dispose(); sun.shadow.map = null;
  }
  post.ao.enabled = Q.ao; post.bloom.enabled = Q.bloom;
  try { localStorage.setItem('g3d-quality', q); } catch (e) { /* приватный режим */ }
  resize();
  if (announce) ui.toast(`Качество: ${Q.name}`);
}

function resize() {
  const Q = QUALITY[state.quality];
  const q = Math.min(devicePixelRatio, Q.dpr, Math.sqrt(Q.px / (innerWidth * innerHeight)));
  renderer.setPixelRatio(q);
  renderer.setSize(innerWidth, innerHeight, false);
  post.setSize(innerWidth, innerHeight, q);
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
bind('btn-attack', () => {
  // удар: только если есть такая анимация и герой не в разговоре; ходьба не прерывает замах
  if (!state.hero || ui.dialogOpen || state.hero.oneshot) return;
  if (state.hero.dead) return;
  if (state.hero.actions?.attack) state.hero.playOnce('attack'); else state.hero.playOnce('cheer');
  // попадание: в момент удара (середина замаха) — по чучелам и боссу впереди героя
  setTimeout(() => {
    const h = state.hero, fx = Math.sin(h.heading), fz = Math.cos(h.heading);
    if (h.dead) return;
    const ahead = (x, z, reach) => {
      const dx = x - h.position.x, dz = z - h.position.z, dist = Math.hypot(dx, dz);
      return dist < reach && (dist < 0.8 || (dx * fx + dz * fz) / dist > 0.3);
    };
    for (const d of state.world.dummies || []) if (ahead(d.x, d.z, 2.6)) d.hit(h.position.x, h.position.z);
    const b = state.boss;
    if (b?.alive && ahead(b.position.x, b.position.z, 2.4 + b.def.radius)) {
      const dmg = 18 + Math.floor(Math.random() * 8);
      b.hit(dmg);
      combatUi.float(String(dmg), b.position.clone().setY(b.position.y + 2.6), 'deal');
    }
  }, 1250);
});
bind('btn-run', (e) => { state.run = !state.run; e.currentTarget.classList.toggle('is-on', state.run); });
bind('btn-quality', () => { state.autoQ = false; applyQuality(ORDER[(ORDER.indexOf(state.quality) + 1) % ORDER.length]); });
input.onRotateStep = (s) => view.rotateStep(s);
input.onRotate = (deg) => view.rotateBy(deg);
input.onZoom = (f) => view.zoom(f);
input.onAction = () => document.getElementById('btn-action').click();
input.onAttack = () => document.getElementById('btn-attack').click();

/* ---------- загрузка ---------- */
async function start() {
  onProgress(ui.progress);
  // локация: полигон для тестов (по умолчанию) или старая деревня (?loc=village)
  // локация: ?loc=fire (по умолчанию) | arena (полигон для тестов) | village (старая деревня)
  const LOCS = {
    fire: ['Огненные земли', 'новый 3D-мир · проба'],
    arena: ['Полигон', 'проверка героя, оружия и анимаций'],
    village: ['Изумрудные луга', 'деревенская площадь · тест 3D'],
  };
  const want = new URLSearchParams(location.search).get('loc');
  state.loc = LOCS[want] ? want : 'fire';
  const village = state.loc === 'village';
  document.querySelector('.hud__place b').textContent = LOCS[state.loc][0];
  document.querySelector('.hud__place span').textContent = LOCS[state.loc][1];
  await preload([...(SKINS[currentSkin()].model ? [charUrl(SKINS[currentSkin()].model)] : []), ...(village ? [] : [charUrl(BOSS_DEF.model)]),
    ...(village ? [...NPCS.map((n) => charUrl(n.model)), ...PROPS.map((p) => envUrl(p.model, p.pack)), envUrl('fence_wood_straight')] : [])]);
  state.world = village ? await buildWorld(scene, renderer)
    : state.loc === 'arena' ? await buildArena(scene, renderer) : await buildFireland(scene, renderer, { quality: state.quality });
  if (!village) Object.assign(HERO, state.world.start || { x: 0, z: 3, face: 180 });
  // мини-карта: снимок локации сверху — до героя и босса, чтобы их не было на фоне
  if (state.world.size) state.minimap = new Minimap(document.getElementById('minimap'), captureMap(renderer, scene, state.world.size), state.world.size);
  await setSkin(currentSkin());
  if (state.world.bossSpawn) await spawnBoss(state.world.bossSpawn);
  for (const def of village ? NPCS : []) {
    const npc = CHAR_MODE_DEFAULT === 'hd2d' && def.sprite
      ? new SpriteNpc(await loadSprite(def.sprite), def, view.camera)
      : new Npc(await characterModel(def.model, def.keep), def);
    state.npcs.push(npc);
    scene.add(npc.object);
  }
  view.focus.set(HERO.x, 1, HERO.z);
  applyQuality(state.quality, false);
  ui.loaded();
  ui.toast('Стрелки — движение, ⟲ ⟳ — поворот камеры', 3500);
  renderer.setAnimationLoop(frame);
}

/* ---------- облик героя ---------- */
function currentSkin() {
  let id = null;
  try { id = localStorage.getItem('g3d-skin'); } catch (e) { /* приватный режим */ }
  return SKINS[id] ? id : DEFAULT_SKIN;
}

/** Меняет модель героя, сохраняя место и направление */
async function setSkin(id) {
  const skin = SKINS[id], old = state.hero;
  const pos = old ? { x: old.position.x, z: old.position.z, face: THREE.MathUtils.radToDeg(old.heading) } : HERO;
  const hero = skin.sprite
    ? new SpriteCharacter(await loadSprite(skin.sprite), pos, view.camera)
    : new Character(await characterModel(skin.model, skin.keep), { ...pos, height: skin.height });

  if (old) scene.remove(old.object);
  scene.add(hero.object);
  state.hero = hero;
  state.skin = id;
  state.weapon?.dispose();
  state.weapon = skin.weapon ? await attachWeapon(hero, skin.weapon) : null;
  try { localStorage.setItem('g3d-skin', id); } catch (e) { /* приватный режим */ }
}

bind('btn-skin', async () => {
  if (!state.hero || ui.dialogOpen) return;
  const ids = Object.keys(SKINS), next = ids[(ids.indexOf(state.skin) + 1) % ids.length];
  ui.toast('Смена облика…', 900);
  await setSkin(next);
  ui.toast(`Облик: ${SKINS[next].name}`);
});

/* ---------- бой с боссом ---------- */
async function spawnBoss(at) {
  const boss = await Boss.create(BOSS_DEF, at);
  boss.world = state.world;
  scene.add(boss.object);
  state.boss = boss;
  boss.onHitHero = (dmg) => hurtHero(dmg);
  boss.onEvent = (ev) => {
    if (ev === 'notice') ui.toast(`${boss.name} заметил тебя!`, 1600);
    if (ev === 'dead') ui.toast(`${boss.name} повержен!`, 2600);
  };
  combatUi.heroHp(state.hp, state.maxHp);
}

function hurtHero(dmg) {
  const hero = state.hero;
  if (hero.dead) return;
  state.hp = Math.max(0, state.hp - dmg); state.hurtT = 0;
  combatUi.hurt();
  combatUi.float(`−${dmg}`, hero.position.clone().setY(hero.position.y + 2), 'take');
  combatUi.heroHp(state.hp, state.maxHp);
  if (state.hp <= 0) {
    hero.playOnce('death'); hero.dead = true; hero.speed = 0;
    ui.toast('Ты пал… Возрождение через 3 секунды', 2800);
    setTimeout(() => {
      hero.dead = false; hero.oneshot = null;
      hero.position.set(HERO.x, 0, HERO.z);
      state.hp = state.maxHp; combatUi.heroHp(state.hp, state.maxHp);
      hero.updateState(true);
    }, 3000);
  } else if (!hero.oneshot) hero.playOnce('hit');
}

function updateCombat(dt) {
  const { boss, hero } = state;
  if (!boss) return;
  boss.update(dt, hero, state.world.colliders, state.world.heightAt);
  // восстановление: через 5 с после последнего удара — 6 ед./с
  state.hurtT += dt;
  if (!hero.dead && state.hurtT > 5 && state.hp < state.maxHp) { state.hp = Math.min(state.maxHp, state.hp + 6 * dt); combatUi.heroHp(state.hp, state.maxHp); }
  combatUi.boss(boss);
  combatUi.update(dt, view.camera);
}

/* ---------- кадр ---------- */
const timer = new THREE.Timer();
let fpsT = 0, fpsN = 0, slow = 0;
const fpsEl = document.getElementById('fps');

function frame() {
  timer.update();
  const raw = timer.getDelta(), dt = Math.min(raw, 1 / 20);
  fpsT += raw; fpsN++;                         // счётчик — по реальному времени (dt ограничен для физики и иначе завышал к/с)
  if (fpsT > 1) {
    state.fps = Math.round(fpsN / fpsT); fpsT = 0; fpsN = 0;
    fpsEl.textContent = `${state.fps} к/с · ${QUALITY[state.quality].name}`;
    // авто-понижение: 3 секунды подряд меньше 28 кадров — на ступень ниже (только вниз и только пока игрок сам не выбрал)
    slow = state.fps < 28 ? slow + 1 : 0;
    if (slow >= 3 && state.autoQ && state.quality !== 'low' && !navigator.webdriver) {
      slow = 0; applyQuality(ORDER[ORDER.indexOf(state.quality) + 1]);
    }
  }
  const { hero, npcs, world } = state;

  moveHero(dt);
  for (const n of npcs) { n.think(dt, hero, world.colliders); n.update(dt); }
  hero.update(dt);
  updateWeapon(state.weapon, dt);
  for (const d of world.dummies || []) d.update(dt);
  updateCombat(dt);
  // рельеф: герой стоит на земле; у локации свои эффекты (лава, пепел)
  if (world.heightAt) hero.position.y = world.heightAt(hero.position.x, hero.position.z);
  world.update?.(dt, timer.getElapsed(), hero);
  updateFocus();
  // тень следует за героем, чтобы карта теней была резкой рядом с ним
  const sun = world.lights.sun;
  sun.target.position.set(hero.position.x, 0, hero.position.z);
  sun.position.set(hero.position.x - 18, 22, hero.position.z + 10);
  view.update(dt, hero.position, world.occluders);
  state.minimap?.draw(hero, state.boss, view.yaw);
  if (QUALITY[state.quality].post) post.render(); else renderer.render(scene, view.camera);
}

function moveHero(dt) {
  const hero = state.hero, a = input.axis;
  // во время удара герой стоит на месте — иначе ноги «скользят»
  if (ui.dialogOpen || !a.active || hero.dead || hero.state === 'attack') { hero.speed = 0; return; }
  const { forward, right } = view.basis();
  const dir = new THREE.Vector2().addScaledVector(right, a.x).addScaledVector(forward, -a.y).normalize();
  const speed = state.run ? MOVE.run : MOVE.walk;
  const p = hero.position, ox = p.x, oz = p.z;
  p.x += dir.x * speed * dt; p.z += dir.y * speed * dt;
  state.world.colliders.resolve(p, MOVE.radius);
  climbLimit(p, ox, oz, state.world);
  for (const n of state.npcs) {                          // жители тоже препятствия
    const dx = p.x - n.position.x, dz = p.z - n.position.z, d = Math.hypot(dx, dz), min = MOVE.radius + 0.35;
    if (d < min && d > 0) { p.x = n.position.x + (dx / d) * min; p.z = n.position.z + (dz / d) * min; }
  }
  const b = state.boss;                                   // сквозь босса не пройти
  if (b?.alive) {
    const dx = p.x - b.position.x, dz = p.z - b.position.z, d = Math.hypot(dx, dz), min = MOVE.radius + b.def.radius;
    if (d < min && d > 0) { p.x = b.position.x + (dx / d) * min; p.z = b.position.z + (dz / d) * min; }
  }
  hero.speed = Math.hypot(p.x - ox, p.z - oz) / dt;      // реальная скорость: упёрся в стену — анимация замедляется
  hero.turnTo(Math.atan2(dir.x, dir.y), dt, MOVE.turn);
}

/** Слишком крутой подъём не пройти: откатываем шаг (сначала пробуем скользить вдоль склона по одной оси) */
function climbLimit(p, ox, oz, world) {
  const H = world.heightAt, max = world.maxSlope;
  if (!H || !max) return;
  const h0 = H(ox, oz), steep = (x, z) => { const d = Math.hypot(x - ox, z - oz); return d > 1e-4 && (H(x, z) - h0) / d > max; };
  if (!steep(p.x, p.z)) return;
  if (!steep(p.x, oz)) { p.z = oz; return; }
  if (!steep(ox, p.z)) { p.x = ox; return; }
  p.x = ox; p.z = oz;
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

/* офлайн: после первого запуска игра открывается без интернета */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* не критично */ }));
}
