/* Боевой интерфейс: здоровье героя (слева сверху), полоска босса (по центру сверху),
   всплывающие цифры урона над целью и красная вспышка по краям экрана, когда бьют героя.
   Всё на DOM — дёшево и чётко на любом экране. */
import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const v = new THREE.Vector3();

export const combatUi = {
  floats: [],

  heroHp(hp, max) {
    $('hero-hp').hidden = false;
    $('hero-hp-fill').style.width = `${(100 * hp) / max}%`;
    $('hero-hp-text').textContent = `${Math.ceil(hp)} / ${max}`;
  },

  boss(boss) {
    const el = $('boss-bar');
    if (!boss || !boss.engaged) { el.hidden = true; return; }
    el.hidden = false;
    $('boss-name').textContent = boss.name;
    $('boss-fill').style.width = `${(100 * boss.hp) / boss.maxHp}%`;
  },

  hurt() {
    const el = $('hurt');
    el.classList.remove('is-on'); void el.offsetWidth; el.classList.add('is-on');
  },

  /** Цифра урона над точкой мира; kind: 'deal' — бьёт герой, 'take' — бьют героя */
  float(text, pos, kind) {
    const el = document.createElement('div');
    el.className = `dmg dmg--${kind}`; el.textContent = text;
    document.body.appendChild(el);
    this.floats.push({ el, pos: pos.clone(), t: 0, dx: (Math.random() - 0.5) * 30 });
  },

  update(dt, camera) {
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t += dt;
      if (f.t > 0.9) { f.el.remove(); this.floats.splice(i, 1); continue; }
      v.copy(f.pos).project(camera);
      const x = (v.x * 0.5 + 0.5) * innerWidth + f.dx * f.t, y = (-v.y * 0.5 + 0.5) * innerHeight - f.t * 60;
      f.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${1 + Math.max(0, 0.25 - f.t) * 2})`;
      f.el.style.opacity = String(1 - Math.max(0, f.t - 0.55) / 0.35);
    }
  },
};
