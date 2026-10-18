/* Камера сверху под углом: следует за героем с затуханием, поворачивается шагами по 45°
   (плавно) или перетаскиванием, приближается щипком. Здания между камерой и героем
   становятся полупрозрачными, чтобы герой не терялся за крышами. */
import * as THREE from 'three';
import { CAMERA } from './config.js';

const DEG = Math.PI / 180;

export class FollowCamera {
  constructor(aspect) {
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.5, 160);
    this.yaw = 0;
    this.yawTarget = 0;
    this.distance = CAMERA.distance;
    this.distanceTarget = CAMERA.distance;
    this.focus = new THREE.Vector3();
    this.ray = new THREE.Raycaster();
    this.faded = new Set();
  }

  rotateStep(sign) { this.yawTarget += sign * CAMERA.yawStep * DEG; }
  rotateBy(deg) { this.yawTarget += deg * DEG; this.yaw = this.yawTarget; }
  zoom(f) { this.distanceTarget = THREE.MathUtils.clamp(this.distanceTarget * f, CAMERA.minDistance, CAMERA.maxDistance); }

  /** Направления «вперёд» и «вправо» на земле — для движения относительно камеры */
  basis() {
    const f = new THREE.Vector2(-Math.sin(this.yaw), -Math.cos(this.yaw));
    return { forward: f, right: new THREE.Vector2(-f.y, f.x) };
  }

  update(dt, target, occluders) {
    const k = 1 - Math.exp(-CAMERA.follow * dt);
    this.yaw += (this.yawTarget - this.yaw) * Math.min(1, 10 * dt);
    this.distance += (this.distanceTarget - this.distance) * Math.min(1, 8 * dt);
    this.focus.lerp(new THREE.Vector3(target.x, 1.1, target.z), k);
    // в вертикальном экране телефона видно меньше по ширине — камера отходит дальше
    const fit = this.camera.aspect < 1 ? Math.pow(1 / this.camera.aspect, 0.55) : 1;
    const dist = this.distance * fit, p = CAMERA.pitch * DEG, h = Math.sin(p) * dist, r = Math.cos(p) * dist;
    this.camera.position.set(this.focus.x + Math.sin(this.yaw) * r, this.focus.y + h, this.focus.z + Math.cos(this.yaw) * r);
    this.camera.lookAt(this.focus);
    this.#fade(target, occluders, dt);
  }

  #fade(target, occluders, dt) {
    // устойчивая проверка: луч от камеры к голове и к ногам героя против габаритов здания
    const from = this.camera.position, hit = new Set(), p = new THREE.Vector3();
    for (const y of [0.3, 1.6]) {
      const to = new THREE.Vector3(target.x, y, target.z), len = to.distanceTo(from);
      this.ray.set(from, to.sub(from).normalize());
      for (const o of occluders) {
        o.userData.box ??= new THREE.Box3().setFromObject(o).expandByScalar(-0.3);
        if (this.ray.ray.intersectBox(o.userData.box, p) && p.distanceTo(from) < len - 0.5) hit.add(o);
      }
    }
    for (const o of occluders) {
      const want = hit.has(o) ? 0.3 : 1;
      o.userData.alpha ??= 1;
      if (Math.abs(o.userData.alpha - want) < 0.01) continue;
      o.userData.alpha += (want - o.userData.alpha) * Math.min(1, dt * 8);
      const a = o.userData.alpha;
      o.traverse((m) => {
        if (!m.isMesh) return;
        m.material.transparent = a < 0.99;
        m.material.opacity = a;
        m.material.depthWrite = a > 0.99;
      });
    }
  }
}
