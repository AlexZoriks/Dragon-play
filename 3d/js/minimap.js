/* Мини-карта: круг в левом верхнем углу, повёрнут как камера (вверх на карте = вперёд на экране).
   Фон карты снимается один раз при загрузке: вид сверху на всю локацию (лава, скалы, площадка) —
   рисовать вручную ничего не нужно, и для новой локации карта появится сама.
   Метки: герой — золотая стрелка по направлению взгляда, босс — красная точка (за краем круга —
   прижата к краю, чтобы было видно, куда идти). Нажатие — большая карта всей локации, ещё нажатие — назад. */
import * as THREE from 'three';

const SNAP = 512;          // разрешение снимка карты

/** Снимок локации сверху в 2D-canvas. Вызывать до старта игрового цикла (размер холста потом восстановится). */
export function captureMap(renderer, scene, size) {
  const cam = new THREE.OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 1, 400);
  cam.position.set(0, 200, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0);
  const fog = scene.fog, hidden = [];
  scene.fog = null;
  scene.traverse((o) => { if ((o.isPoints || o.isSkinnedMesh) && o.visible) { o.visible = false; hidden.push(o); } });   // без частиц и персонажей
  renderer.setPixelRatio(1);
  renderer.setSize(SNAP, SNAP, false);
  renderer.render(scene, cam);
  const img = document.createElement('canvas'); img.width = img.height = SNAP;
  img.getContext('2d').drawImage(renderer.domElement, 0, 0, SNAP, SNAP, 0, 0, SNAP, SNAP);   // в той же задаче, что и render — буфер ещё цел
  scene.fog = fog;
  for (const o of hidden) o.visible = true;
  return img;
}

export class Minimap {
  constructor(canvas, image, size) {
    this.el = canvas; this.ctx = canvas.getContext('2d');
    this.img = image; this.size = size;
    this.big = false;
    this.el.hidden = false;
    this.el.addEventListener('click', () => { this.big = !this.big; this.el.classList.toggle('is-big', this.big); this.fit(); });
    addEventListener('resize', () => this.fit());
    this.fit();
  }

  /** Размер холста под экран и плотность пикселей (чёткие линии на iPhone) */
  fit() {
    const r = this.el.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
    this.el.width = Math.round(r.width * d); this.el.height = Math.round(r.height * d);
  }

  draw(hero, boss, yaw) {
    const c = this.ctx, W = this.el.width, H = this.el.height, S = this.size;
    if (!W) return;
    // видимая область: маленькая — 28 м вокруг героя, большая — вся локация
    const R = this.big ? S * 0.55 : 28, k = Math.min(W, H) / 2 / R;
    const cx = this.big ? 0 : hero.position.x, cz = this.big ? 0 : hero.position.z;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const toScreen = (x, z) => {
      const dx = x - cx, dz = z - cz;
      return [W / 2 + (dx * cos - dz * sin) * k, H / 2 + (dx * sin + dz * cos) * k];
    };

    c.clearRect(0, 0, W, H);
    c.fillStyle = '#120a07'; c.fillRect(0, 0, W, H);
    c.save();
    c.translate(W / 2, H / 2); c.rotate(yaw); c.scale(k, k); c.translate(-cx, -cz);
    c.drawImage(this.img, -S / 2, -S / 2, S, S);
    c.restore();
    // лёгкое затемнение к краю — метки читаются лучше
    const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.min(W, H) * 0.55);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.45)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);

    const u = Math.min(W, H) / 120;                 // единица размера меток
    if (boss) {
      let [bx, by] = toScreen(boss.position.x, boss.position.z);
      const ox = bx - W / 2, oy = by - H / 2, d = Math.hypot(ox, oy), lim = Math.min(W, H) / 2 - 7 * u;
      const out = !this.big && d > lim;
      if (out) { bx = W / 2 + (ox / d) * lim; by = H / 2 + (oy / d) * lim; }
      if (boss.alive) {
        const pulse = 1 + 0.25 * Math.sin(performance.now() / 180);
        c.fillStyle = 'rgba(255,60,20,.35)'; c.beginPath(); c.arc(bx, by, 7 * u * pulse, 0, 7); c.fill();
        c.fillStyle = '#ff4a1c'; c.strokeStyle = '#2a0800'; c.lineWidth = u;
        c.beginPath(); c.arc(bx, by, (out ? 3.5 : 4.5) * u, 0, 7); c.fill(); c.stroke();
      } else {                                        // повержен — серый крестик
        c.strokeStyle = '#9a8f88'; c.lineWidth = 1.6 * u;
        c.beginPath(); c.moveTo(bx - 3 * u, by - 3 * u); c.lineTo(bx + 3 * u, by + 3 * u); c.moveTo(bx + 3 * u, by - 3 * u); c.lineTo(bx - 3 * u, by + 3 * u); c.stroke();
      }
    }
    // герой: стрелка по направлению взгляда
    const [hx, hy] = toScreen(hero.position.x, hero.position.z);
    const fx = Math.sin(hero.heading), fz = Math.cos(hero.heading);
    const ax = fx * cos - fz * sin, ay = fx * sin + fz * cos, a = Math.atan2(ay, ax);
    c.save(); c.translate(hx, hy); c.rotate(a);
    c.fillStyle = '#ffd47a'; c.strokeStyle = '#1a1006'; c.lineWidth = u;
    c.beginPath(); c.moveTo(6 * u, 0); c.lineTo(-4 * u, 4 * u); c.lineTo(-2 * u, 0); c.lineTo(-4 * u, -4 * u); c.closePath(); c.fill(); c.stroke();
    c.restore();
    if (this.big) {
      c.fillStyle = 'rgba(243,231,201,.8)'; c.font = `${7 * u}px Georgia, serif`; c.textAlign = 'center';
      c.fillText('нажми, чтобы закрыть', W / 2, H - 6 * u);
    }
  }
}
