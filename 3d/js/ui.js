/* Интерфейс поверх 3D: загрузка, кнопка действия, диалоги, всплывающие сообщения.
   Текст выводится через textContent — никакого HTML из данных. */

const $ = (id) => document.getElementById(id);

export const ui = {
  progress(f) {
    $('loader-fill').style.width = `${Math.round(f * 100)}%`;
    $('loader-text').textContent = f < 1 ? `Загрузка… ${Math.round(f * 100)}%` : 'Готово';
  },
  loaded() { $('loader').classList.add('is-done'); },
  fail(msg) { $('loader-text').textContent = msg; },

  /** Кнопка действия: показывается только рядом с тем, с чем можно взаимодействовать */
  action(label, onPress) {
    const b = $('btn-action');
    if (!label) { b.hidden = true; b.onclick = null; return; }
    if (b.textContent !== label) b.textContent = label;
    b.hidden = false;
    b.onclick = onPress;
  },

  get dialogOpen() { return !$('dialog').hidden; },

  /** Диалог по дереву узлов: { text, answers: [[текст, следующий узел | null, событие?]] } */
  dialog(npc, tree, onEvent, onClose) {
    const show = (key) => {
      const node = tree[key];
      if (!node) { $('dialog').hidden = true; onClose?.(); return; }
      $('dlg-icon').textContent = npc.icon;
      $('dlg-name').textContent = npc.name;
      $('dlg-title').textContent = npc.title;
      $('dlg-text').textContent = node.text;
      const box = $('dlg-answers');
      box.replaceChildren(...node.answers.map(([label, next, event]) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.onclick = () => { if (event) onEvent?.(event); show(next); };
        return b;
      }));
      $('dialog').hidden = false;
    };
    show('start');
  },

  toast(text, ms = 2200) {
    const t = $('toast');
    t.textContent = text; t.hidden = false;
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { t.hidden = true; }, ms);
  },
};
