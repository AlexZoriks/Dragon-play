/* Босс: Лавовый демон. Свой автомат состояний поверх анимаций Meshy.

   idle    — стоит на месте. Замечает героя впереди (конус ±63°) ближе sight или с любой стороны ближе sightBack (2.2 м — можно подкрасться со спины);
   notice  — плавно поворачивается к герою (на большом угле — анимация шага-поворота), затем
   roar    — рычит и переходит в погоню;
   chase   — идёт к герою; бежит, если разъярён или герой далеко. Вплотную — выбирает удар;
   attack  — один из трёх ударов (кулак, когти, удар по земле). Урон — в момент удара, если герой в зоне;
   hit     — вздрагивает от удара (не чаще раза в 2.5 с, во время своих ударов не вздрагивает — «супер-броня»);
   return  — герой убежал далеко: возвращается домой и восстанавливает здоровье;
   dead    — умер; через несколько секунд возрождается дома (для тренировки).
   Ударил первым (со спины, пока не заметил) — демон разъярён: без рыка сразу бежит на героя. */
import * as THREE from 'three';
import { characterModel } from './assets.js';

export const BOSS_DEF = {
  model: 'LavaDemon', name: 'Лавовый демон', height: 3.8, hp: 300,
  walk: 1.7, run: 4.4, radius: 1.05,
  sight: 13, sightBack: 2.2, lose: 26,     // со спины слышит только вплотную — можно подкрасться и ударить первым
  reach: 2.8,                       // с этого расстояния начинает удар
  respawn: 8,
};

const CLIPS = {
  idle: [/idle_10/i, /^idle/i, /idle/i], walk: [/walk/i], run: [/run/i], roar: [/skill_01/i, /roar|taunt/i],
  turnL: [/turn_left/i], turnR: [/turn_right/i],
  punch: [/uppercut/i, /punch/i], swipe: [/slash/i, /swipe|claw/i], smash: [/slam/i, /smash/i],
  hit: [/hit_reaction/i, /hit/i], death: [/dead/i, /death|dying/i],
};
const LOOPS = new Set(['idle', 'walk', 'run']);
/* at — доля длительности клипа, когда удар достигает цели; cone — косинус половины угла зоны (−1 — вокруг) */
const ATTACKS = {
  punch: { dmg: 12, at: 0.5, reach: 3.0, cone: 0.5, weight: 4 },
  swipe: { dmg: 16, at: 0.4, reach: 3.3, cone: 0.0, weight: 4 },
  smash: { dmg: 26, at: 0.58, reach: 3.7, cone: -1, weight: 2 },
};

const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const find = (clips, list) => { for (const re of list) { const c = clips.find((x) => re.test(x.name)); if (c) return c; } return null; };

/* Удары, повороты и реакция на удар у Meshy сдвигают таз в сторону (до 1.5 м) — фиксируем его по XZ,
   чтобы демон не «уезжал» и не прыгал обратно в конце клипа. Высоту (присед, наклон) оставляем. */
function lockRoot(clip) {
  for (const t of clip.tracks) {
    if (!/hips\.position$/i.test(t.name)) continue;
    const v = t.values, x0 = v[0], z0 = v[2];
    for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
  }
}

export class Boss {
  static async create(def, spawn) { return new Boss(await characterModel(def.model), def, spawn); }

  constructor({ root, clips }, def, { x = 0, z = 0, face = 0 }) {
    this.def = def; this.name = def.name;
    this.maxHp = def.hp; this.hp = def.hp;
    this.home = { x, z, heading: THREE.MathUtils.degToRad(face) };
    this.object = new THREE.Group();
    this.object.add(root);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root, true), h = box.max.y - box.min.y || 1;
    root.scale.setScalar(def.height / h);
    root.position.y = -box.min.y * (def.height / h);

    this.mats = [];
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; this.mats.push(...[].concat(o.material)); } });
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = {};
    for (const [key, list] of Object.entries(CLIPS)) {
      const clip = find(clips, list);
      if (!clip) continue;
      if (!LOOPS.has(key) && key !== 'death') lockRoot(clip);
      const a = this.mixer.clipAction(clip);
      if (!LOOPS.has(key)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions[key] = a;
    }
    this.cur = null; this.curKey = null;
    this.flash = 0; this.cool = 0; this.stagger = 0;
    this.onHitHero = null;      // (урон) — вызывает игра
    this.onEvent = null;        // ('notice' | 'dead' | 'respawn')
    this.reset();
  }

  get position() { return this.object.position; }
  get alive() { return this.mode !== 'dead'; }
  /** Бой идёт — показываем полоску здоровья */
  get engaged() { return this.mode !== 'dead' && (this.mode !== 'idle' || this.hp < this.maxHp); }

  reset() {
    this.hp = this.maxHp;
    this.object.position.set(this.home.x, 0, this.home.z);
    this.heading = this.home.heading; this.object.rotation.y = this.heading;
    this.enraged = false; this.mode = 'idle'; this.t = 0;
    this.play('idle', 0);
  }

  /** Включить анимацию; возвращает её длительность в секундах */
  play(key, fade = 0.25) {
    const a = this.actions[key];
    if (!a) return 0;
    if (this.curKey === key && LOOPS.has(key)) return a.getClip().duration;
    a.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(fade).play();
    if (this.cur && this.cur !== a) this.cur.fadeOut(fade);
    this.cur = a; this.curKey = key;
    return a.getClip().duration;
  }

  set(mode) { this.mode = mode; this.t = 0; }

  /** Повернуться к углу не быстрее rate рад/с; возвращает оставшийся угол */
  turn(target, dt, rate) {
    const d = angDiff(target, this.heading);
    this.heading += THREE.MathUtils.clamp(d, -rate * dt, rate * dt);
    this.object.rotation.y = this.heading;
    return angDiff(target, this.heading);
  }

  /** Удар героя по демону. Возвращает true, если попал. */
  hit(dmg) {
    if (!this.alive) return false;
    this.hp = Math.max(0, this.hp - dmg);
    this.flash = 1;
    if (this.hp <= 0) { this.set('dead'); this.play('death', 0.15); this.onEvent?.('dead'); return true; }
    if (this.mode === 'idle' || this.mode === 'return') {
      this.enraged = this.mode === 'idle';                 // ударили, пока не заметил — разъярён
      this.onEvent?.('notice');
    }
    if (this.mode !== 'attack' && this.mode !== 'roar' && this.stagger <= 0) {
      this.set('hit'); this.dur = this.play('hit', 0.1); this.stagger = 2.5;
    } else if (this.mode === 'idle' || this.mode === 'return') this.set('chase');
    return true;
  }

  attack() {
    const keys = Object.keys(ATTACKS).filter((k) => this.actions[k] && k !== this.lastAtk);   // не повторяет один удар подряд
    let r = Math.random() * keys.reduce((s, k) => s + ATTACKS[k].weight, 0);
    const key = keys.find((k) => (r -= ATTACKS[k].weight) < 0) || keys[0];
    this.atk = ATTACKS[key]; this.struck = false; this.lastAtk = key;
    this.set('attack'); this.dur = this.play(key, 0.15);
  }

  update(dt, hero, colliders, heightAt) {
    this.mixer.update(dt);
    this.t += dt; this.cool -= dt; this.stagger -= dt;
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 5);
      for (const m of this.mats) m.emissiveIntensity = 1 + this.flash * 3;   // трещины вспыхивают от удара
    }
    const p = this.position, D = this.def;
    if (heightAt) p.y = heightAt(p.x, p.z);
    if (this.mode === 'dead') { if (this.t > D.respawn) { this.reset(); this.onEvent?.('respawn'); } return; }

    const hp = hero.position, dx = hp.x - p.x, dz = hp.z - p.z, dist = Math.hypot(dx, dz);
    const toHero = Math.atan2(dx, dz), off = angDiff(toHero, this.heading);
    const canSee = !hero.dead && (dist < D.sightBack || (dist < D.sight && Math.abs(off) < 1.1));

    switch (this.mode) {
      case 'idle':
        this.play('idle');
        if (canSee) { this.set('notice'); this.onEvent?.('notice'); }
        break;
      case 'notice': {                                  // поворот к герою: большой угол — шаг-поворот
        const left = this.turn(toHero, dt, 1.8);
        if (Math.abs(left) > 0.35) {
          const want = left > 0 ? 'turnL' : 'turnR';
          if (this.curKey !== want || this.cur.paused) this.play(this.actions[want] ? want : 'walk', 0.2);
        }
        else if (this.enraged) this.set('chase');
        else { this.set('roar'); this.dur = this.play('roar', 0.2) || 0.1; }
        break;
      }
      case 'roar':
        this.turn(toHero, dt, 1.2);
        if (this.t >= this.dur - 0.3) this.set('chase');
        break;
      case 'chase': {
        if (hero.dead || dist > D.lose) { this.set('return'); break; }
        const left = this.turn(toHero, dt, 3.2);
        if (dist < D.reach) {                           // рядом: бьёт, когда повернулся и отдохнул
          if (this.cool <= 0 && Math.abs(left) < 0.5) this.attack(); else this.play('idle', 0.2);
          break;
        }
        const run = this.enraged || dist > 9, sp = run ? D.run : D.walk;
        this.play(run ? 'run' : 'walk', 0.25);
        this.move(sp * (Math.abs(left) > 1 ? 0.3 : 1), dt, colliders);
        break;
      }
      case 'attack':
        if (this.t < this.dur * 0.3) this.turn(toHero, dt, 1.4);       // доворачивается только на замахе — от удара можно уйти
        if (!this.struck && this.t >= this.dur * this.atk.at) {
          this.struck = true;
          const inCone = this.atk.cone < -0.5 || Math.cos(off) > this.atk.cone;
          if (!hero.dead && dist < this.atk.reach && inCone) this.onHitHero?.(this.atk.dmg);
        }
        if (this.t >= this.dur - 0.15) { this.cool = 0.7 + Math.random() * 0.9; this.set('chase'); }
        break;
      case 'hit':
        if (this.t >= this.dur * 0.75) this.set('chase');
        break;
      case 'return': {
        this.hp = Math.min(this.maxHp, this.hp + 40 * dt);
        if (canSee && this.hp > this.maxHp * 0.5) { this.set('notice'); break; }
        const hx = this.home.x - p.x, hz = this.home.z - p.z, hd = Math.hypot(hx, hz);
        if (hd < 0.4) {
          this.play('idle', 0.3);
          if (Math.abs(this.turn(this.home.heading, dt, 1.5)) < 0.05 && this.hp >= this.maxHp) { this.enraged = false; this.set('idle'); }
        } else {
          this.play('walk', 0.3);
          const left = this.turn(Math.atan2(hx, hz), dt, 2.5);
          this.move(D.walk * (Math.abs(left) > 1 ? 0.3 : 1), dt, colliders);
        }
        break;
      }
    }
  }

  move(speed, dt, colliders) {
    const p = this.position, ox = p.x, oz = p.z;
    p.x += Math.sin(this.heading) * speed * dt; p.z += Math.cos(this.heading) * speed * dt;
    colliders?.resolve(p, this.def.radius);
    if (this.world?.maxSlope && this.world.heightAt) {                 // как и герой, не лезет на крутые склоны
      const H = this.world.heightAt, d = Math.hypot(p.x - ox, p.z - oz);
      if (d > 1e-4 && (H(p.x, p.z) - H(ox, oz)) / d > this.world.maxSlope) { p.x = ox; p.z = oz; }
    }
    const a = this.actions[this.curKey];                       // темп шагов — под скорость, без «скольжения»
    if (a && (this.curKey === 'walk' || this.curKey === 'run')) a.timeScale = THREE.MathUtils.clamp(speed / (this.curKey === 'run' ? this.def.run : this.def.walk), 0.4, 1.3);
  }
}
