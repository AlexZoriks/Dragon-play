/* Данные тестовой локации: всё, что можно поменять без правки логики.
   Единица длины — метр. Ось X — восток, ось Z — юг (к камере по умолчанию), Y — вверх. */

export const HERO_HEIGHT = 1.8;          // единый рост: под него масштабируются все персонажи
export const ENV_SCALE = 4.5;             // масштаб зданий и природы из пака KayKit Medieval

export const CAMERA = {
  pitch: 52,            // наклон камеры, градусы от горизонта
  distance: 16,         // расстояние до героя
  minDistance: 8,
  maxDistance: 30,
  yawStep: 45,          // шаг поворота кнопками
  follow: 6,            // жёсткость следования (больше — быстрее)
};

export const MOVE = { walk: 2.3, run: 4.6, radius: 0.35, turn: 12 };

export const WORLD = { size: 70, fog: [0x1d2330, 28, 70] };

/* Дороги: ломаные линии, по ним рисуется земля на траве. w — ширина. */
export const PATHS = [
  { w: 3.2, pts: [[0, 34], [1, 22], [-1, 12], [0, 3]] },
  { w: 2.4, pts: [[0, -2], [-2, -10], [-1, -16]] },
  { w: 2.2, pts: [[2, 1], [8, 4], [12, 6]] },
  { w: 2.0, pts: [[-2, 1], [-7, -2], [-10, -4.5]] },
];
export const SQUARE = { x: 0, z: 0, r: 5 };

/* Объекты окружения. model — имя файла в assets/models/env; rot — градусы; col — коллайдер. */
export const PROPS = [
  { model: 'building_tavern_red', x: -11, z: -9, rot: 30, col: 'box', name: 'tavern' },
  { model: 'building_church_red', x: -1, z: -22, rot: 0, col: 'box' },
  { model: 'building_home_A_red', x: 9, z: -10, rot: -20, col: 'box' },
  { model: 'building_home_B_red', x: 17, z: -2, rot: -60, col: 'box' },
  { model: 'building_blacksmith_red', x: 15, z: 9, rot: -110, col: 'box' },
  { model: 'building_well_red', x: 0, z: 0, rot: 0, col: 'circle', scale: 3.2 },

  { model: 'barrel', x: -6.3, z: -4.2, rot: 0, col: 'circle', scale: 3 },
  { model: 'barrel', x: -5.4, z: -5.0, rot: 30, col: 'circle', scale: 3 },
  { model: 'crate_A_big', x: 11.5, z: 12.5, rot: 15, col: 'box', scale: 3 },
  { model: 'crate_B_small', x: 10.4, z: 11.6, rot: -10, col: 'box', scale: 3 },
  { model: 'weaponrack', x: 10.5, z: 5.5, rot: -110, col: 'box', scale: 3 },
  { model: 'wheelbarrow', x: 5.5, z: -6.5, rot: 40, col: 'box', scale: 3 },
  { model: 'sack', x: -4.2, z: -6.2, rot: 0, col: 'circle', scale: 3 },

  { model: 'trees_A_medium', x: -22, z: 4, rot: 0, col: 'circle', rcol: 2.6 },
  { model: 'trees_A_medium', x: 23, z: -16, rot: 120, col: 'circle', rcol: 2.6 },
  { model: 'tree_single_A', x: -15, z: 12, rot: 0, col: 'circle', rcol: 0.9 },
  { model: 'tree_single_B', x: -9, z: 17, rot: 40, col: 'circle', rcol: 0.9 },
  { model: 'tree_single_A', x: 8, z: 20, rot: 70, col: 'circle', rcol: 0.9 },
  { model: 'tree_single_B', x: 19, z: 18, rot: 10, col: 'circle', rcol: 0.9 },
  { model: 'tree_single_A', x: -19, z: -18, rot: 10, col: 'circle', rcol: 0.9 },
  { model: 'tree_single_B', x: 13, z: -24, rot: 10, col: 'circle', rcol: 0.9 },
  { model: 'tree_single_A', x: -26, z: -6, rot: 90, col: 'circle', rcol: 0.9 },
  { model: 'tree_single_B', x: 27, z: 4, rot: 90, col: 'circle', rcol: 0.9 },
  { model: 'rock_single_A', x: -6, z: 9, rot: 0, col: 'circle', scale: 4 },
  { model: 'rock_single_C', x: 6.5, z: 14, rot: 50, col: 'circle', scale: 4 },
];

/* Забор огорода у дома (отрезки) */
export const FENCES = [
  { from: [4, -16], to: [13, -16] },
  { from: [4, -16], to: [4, -12.5] },
];

/* Фонари: тёплый свет вечером. Не больше трёх — точечный свет дорог на iPhone. */
export const LAMPS = [[-3.5, 4.5], [4, -3.8], [-1.8, 13]];

/* Жители. model — файл в assets/models/chars; keep — какие предметы в руках видны. */
export const NPCS = [
  {
    id: 'elder', model: 'Mage', keep: ['2H_Staff', 'Mage_Hat'], x: -3, z: 2.5, face: 200,
    name: 'Староста Ульрих', title: 'Глава деревни', icon: '📜',
    talk: 'elder',
  },
  {
    id: 'guard', model: 'Knight', keep: ['1H_Sword', 'Badge_Shield', 'Knight_Helmet'], x: 6, z: 3,
    name: 'Капитан Бруно', title: 'Начальник стражи', icon: '🛡️',
    patrol: [[6, 3], [6, -4], [-4, -5], [-5, 6], [4, 7]],
    talk: 'guard',
  },
];

export const HERO = { model: 'Rogue_Hooded', keep: ['Knife', 'Rogue_Cape'], x: 0.5, z: 9, face: 180 };

/* Входы в здания: кнопка «Войти» появляется только у крыльца. local[0] — сдвиг вдоль фасада. */
export const DOORS = [
  { id: 'tavern', building: 'tavern', local: [0.12, 0, 0], name: 'Таверна «Пьяный гусь»' },
];

/* Диалоги. Узел: text + answers [текст, следующий узел | null, действие?] */
export const DIALOGS = {
  elder: {
    start: {
      text: 'Ты всё-таки пришёл в себя. Добро пожаловать на Изумрудные луга, путник.\nНочью на кладбище снова выли. Мне нужен кто-то, кто не боится темноты.',
      answers: [['Что случилось на кладбище?', 'grave'], ['Где здесь можно отдохнуть?', 'rest'], ['Мне пора.', null]],
    },
    grave: {
      text: 'Могильщик Грег раскопал старый склеп. С тех пор там бродят мертвецы, а мальчишка Федька пропал.\nНайди Грега за церковью — он расскажет больше.',
      answers: [['Я разберусь.', null, 'cheer'], ['Назад', 'start']],
    },
    rest: {
      text: 'Таверна «Пьяный гусь» — на западе площади. Марта накормит и даст комнату, если монеты звенят.',
      answers: [['Спасибо.', null], ['Назад', 'start']],
    },
  },
  guard: {
    start: {
      text: 'Стой. Ты новенький? Держись дорог — в лесу волки, а у кладбища по ночам нечисто.',
      answers: [['Понял, капитан.', null], ['Что за нечисть?', 'undead']],
    },
    undead: {
      text: 'Скелеты. Медленные, но бьют больно. Огонь и серебро — вот что их берёт.',
      answers: [['Учту.', null]],
    },
  },
};
