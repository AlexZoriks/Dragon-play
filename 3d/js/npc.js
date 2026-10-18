/* Поведение жителей.
   - Стоящий житель: смотрит в свою сторону; если герой ближе 4 м — плавно поворачивается к нему.
   - Патрульный: идёт по точкам шагом; останавливается и смотрит на героя, если тот ближе 2.5 м,
     и стоит, пока открыт разговор.
   - Над жителем, с которым можно поговорить, висит «!» — пока с ним ещё не говорили. */
import * as THREE from 'three';
import { Character } from './character.js';

const NOTICE_NEAR = 4, STOP_NEAR = 2.5, WALK = 1.4;

export class Npc extends Character {
  constructor(model, def) {
    super(model, { x: def.x, z: def.z, face: def.face ?? 180 });
    this.def = def;
    this.home = THREE.MathUtils.degToRad(def.face ?? 180);
    this.wp = 0;
    this.talked = false;
    this.marker = makeMarker();
    this.object.add(this.marker);
  }

  get name() { return this.def.name; }

  think(dt, hero, colliders) {
    const dx = hero.position.x - this.position.x, dz = hero.position.z - this.position.z, dist = Math.hypot(dx, dz);
    this.marker.visible = !this.talked;
    this.marker.position.y = 2.35 + Math.sin(performance.now() / 300) * 0.06;

    if (this.talking) { this.speed = 0; this.faceTowards(hero.position.x, hero.position.z, dt, 6); return; }

    const route = this.def.patrol;
    if (!route) {
      this.speed = 0;
      if (dist < NOTICE_NEAR) this.faceTowards(hero.position.x, hero.position.z, dt, 5);
      else this.turnTo(this.home, dt, 2);
      return;
    }
    if (dist < STOP_NEAR) { this.speed = 0; this.faceTowards(hero.position.x, hero.position.z, dt, 6); return; }
    const [tx, tz] = route[this.wp], wx = tx - this.position.x, wz = tz - this.position.z, wd = Math.hypot(wx, wz);
    if (wd < 0.3) { this.wp = (this.wp + 1) % route.length; return; }
    this.speed = WALK;
    this.position.x += (wx / wd) * WALK * dt;
    this.position.z += (wz / wd) * WALK * dt;
    colliders.resolve(this.position, 0.35);
    this.faceTowards(tx, tz, dt, 6);
  }
}

function makeMarker() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.font = '900 52px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = '#2a1500'; g.strokeText('!', 32, 34);
  g.fillStyle = '#ffd23a'; g.fillText('!', 32, 34);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, fog: false }));
  s.scale.set(0.55, 0.55, 1);
  s.renderOrder = 10;
  return s;
}
