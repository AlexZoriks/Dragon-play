/* Анимированный персонаж и его автомат состояний.

   Состояния и условия:
   - idle     — скорость < 0.15 м/с и нет разовой анимации;
   - walk     — 0.15 … 3.2 м/с;
   - run      — больше 3.2 м/с;
   - talk     — разговор: «Interact» один раз, затем Idle, пока открыт диалог;
   - oneshot  — разовая анимация (Cheer, Hit…): играет до конца и возвращает в locomotion.
   Переходы всегда через плавное смешивание 0.25 с; разовая анимация не прерывается ходьбой. */
import * as THREE from 'three';
import { HERO_HEIGHT } from './config.js';

const CLIP = { idle: 'Idle', walk: 'Walking_A', run: 'Running_A', interact: 'Interact', cheer: 'Cheer', hit: 'Hit_A' };
const FADE = 0.25;

export class Character {
  constructor({ root, clips }, { x = 0, z = 0, face = 0 } = {}) {
    this.object = new THREE.Group();
    this.object.add(root);
    // единый рост: модель масштабируется так, чтобы любой персонаж был HERO_HEIGHT
    const box = new THREE.Box3().setFromObject(root);
    const h = box.max.y - box.min.y || 1;
    root.scale.setScalar(HERO_HEIGHT / h);
    root.position.y = -box.min.y * (HERO_HEIGHT / h);

    this.object.position.set(x, 0, z);
    this.heading = THREE.MathUtils.degToRad(face);
    this.object.rotation.y = this.heading;
    this.velocity = new THREE.Vector2();
    this.speed = 0;

    this.mixer = new THREE.AnimationMixer(root);
    this.actions = {};
    for (const [key, name] of Object.entries(CLIP)) {
      const clip = clips.find((c) => c.name === name);
      if (clip) this.actions[key] = this.mixer.clipAction(clip);
    }
    for (const k of ['interact', 'cheer', 'hit']) {
      const a = this.actions[k];
      if (a) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    }
    this.state = null;
    this.oneshot = null;
    this.talking = false;
    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.oneshot) { this.oneshot = null; this.updateState(true); }
    });
    this.play('idle');
  }

  get position() { return this.object.position; }

  play(key) {
    if (this.state === key || !this.actions[key]) return;
    const next = this.actions[key], prev = this.state && this.actions[this.state];
    next.reset().setEffectiveWeight(1).fadeIn(FADE).play();
    if (prev) prev.fadeOut(FADE);
    this.state = key;
  }

  /** Разовая анимация; вернётся к ходьбе/покою сама */
  playOnce(key) {
    const a = this.actions[key];
    if (!a) return;
    const prev = this.state && this.actions[this.state];
    a.reset().fadeIn(0.15).play();
    if (prev && prev !== a) prev.fadeOut(0.15);
    this.state = key;
    this.oneshot = a;
  }

  updateState(force = false) {
    if (this.oneshot && !force) return;
    const key = this.talking ? 'idle' : this.speed > 3.2 ? 'run' : this.speed > 0.15 ? 'walk' : 'idle';
    this.play(key);
    // темп шага подстраивается под реальную скорость, чтобы ноги не «скользили»
    if (key === 'walk') this.actions.walk.timeScale = THREE.MathUtils.clamp(this.speed / 2.3, 0.6, 1.4);
    if (key === 'run') this.actions.run.timeScale = THREE.MathUtils.clamp(this.speed / 4.6, 0.7, 1.3);
  }

  /** Плавный поворот к углу (радианы) */
  turnTo(target, dt, rate = 12) {
    let d = target - this.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.heading += d * Math.min(1, rate * dt);
    this.object.rotation.y = this.heading;
  }

  faceTowards(x, z, dt, rate) { this.turnTo(Math.atan2(x - this.position.x, z - this.position.z), dt, rate); }

  update(dt) {
    this.updateState();
    this.mixer.update(dt);
  }
}
