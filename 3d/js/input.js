/* Ввод: стрелки на экране (как во 2D-версии, с диагоналями при двух нажатиях), клавиатура,
   щипок/колесо — зум, перетаскивание по пустому экрану — поворот камеры. */

const KEYS = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};

export class Input {
  constructor({ dpad, canvas }) {
    this.held = new Set();
    this.onAction = null;
    this.onZoom = null;
    this.onRotate = null;         // (градусы)
    this.onRotateStep = null;     // (+1 / −1)
    this.#keyboard();
    this.#dpad(dpad);
    this.#gestures(canvas);
  }

  /** Направление движения в координатах экрана: x — вправо, y — вниз */
  get axis() {
    const x = (this.held.has('right') ? 1 : 0) - (this.held.has('left') ? 1 : 0);
    const y = (this.held.has('down') ? 1 : 0) - (this.held.has('up') ? 1 : 0);
    const l = Math.hypot(x, y) || 1;
    return { x: x / l, y: y / l, active: x !== 0 || y !== 0 };
  }

  release() { this.held.clear(); document.querySelectorAll('.dpad .is-held').forEach((b) => b.classList.remove('is-held')); }

  #keyboard() {
    addEventListener('keydown', (e) => {
      if (KEYS[e.code]) { this.held.add(KEYS[e.code]); e.preventDefault(); }
      else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyF') { this.onAction?.(); e.preventDefault(); }
      else if (e.code === 'KeyQ') this.onRotateStep?.(-1);
      else if (e.code === 'KeyE') this.onRotateStep?.(1);
    });
    addEventListener('keyup', (e) => { if (KEYS[e.code]) this.held.delete(KEYS[e.code]); });
    addEventListener('blur', () => this.release());
  }

  #dpad(root) {
    // отслеживаем каждое касание отдельно: палец можно вести с одной стрелки на другую
    const touches = new Map();
    const dirAt = (x, y) => document.elementFromPoint(x, y)?.closest?.('[data-dir]')?.dataset.dir || null;
    const sync = () => {
      this.held.clear();
      for (const d of touches.values()) if (d) this.held.add(d);
      root.querySelectorAll('[data-dir]').forEach((b) => b.classList.toggle('is-held', this.held.has(b.dataset.dir)));
    };
    root.addEventListener('pointerdown', (e) => {
      root.setPointerCapture(e.pointerId);
      touches.set(e.pointerId, dirAt(e.clientX, e.clientY)); sync(); e.preventDefault();
    });
    root.addEventListener('pointermove', (e) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, dirAt(e.clientX, e.clientY)); sync();
    });
    const end = (e) => { touches.delete(e.pointerId); sync(); };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
  }

  #gestures(canvas) {
    const pts = new Map();
    let lastDist = 0;
    canvas.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      if (pts.size === 1) this.onRotate?.((e.clientX - p.x) * 0.3);
      p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (lastDist) this.onZoom?.(lastDist / d);
        lastDist = d;
      }
    });
    const up = (e) => { pts.delete(e.pointerId); lastDist = 0; };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => { this.onZoom?.(e.deltaY > 0 ? 1.1 : 1 / 1.1); e.preventDefault(); }, { passive: false });
  }
}
