/* Данные тестовой локации: всё, что можно поменять без правки логики.
   Единица длины — метр. Ось X — восток, ось Z — юг (к камере по умолчанию), Y — вверх. */

export const HERO_HEIGHT = 1.8;          // единый рост: под него масштабируются все персонажи
export const ENV_SCALE = 4.5;             // масштаб зданий и природы из пака KayKit Medieval

export const CAMERA = {
  pitch: 46,            // наклон камеры, градусы от горизонта (ниже — герой крупнее и виден объём)
  distance: 11,         // расстояние до героя: герой занимает ~1/5 высоты экрана
  minDistance: 5,
  maxDistance: 24,
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
  { model: 'building_church_red', x: -1, z: -21, rot: 0, col: 'box' },
  { model: 'bench', pack: 'gothic', x: -6.5, z: 1.6, rot: 70, col: 'box', scale: 1 },
  { model: 'bench', pack: 'gothic', x: 3.6, z: 5.6, rot: -30, col: 'box', scale: 1 },
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

  { model: 'tree_single_A', x: -15, z: 12, rot: 0, col: 'circle', rcol: 0.9 },
  { model: 'tree_single_B', x: -9, z: 17, rot: 40, col: 'circle', rcol: 0.9 },
  { model: 'tree_single_A', x: 8, z: 20, rot: 70, col: 'circle', rcol: 0.9 },
  { model: 'tree_single_B', x: 19, z: 18, rot: 10, col: 'circle', rcol: 0.9 },
  { model: 'tree_pine_orange_medium', pack: 'gothic', x: -7, z: 9, rot: 0, col: 'circle', rcol: 0.7, scale: 1.1 },
  { model: 'rock_single_A', x: -6, z: 12, rot: 0, col: 'circle', scale: 4 },
  { model: 'rock_single_C', x: 6.5, z: 14, rot: 50, col: 'circle', scale: 4 },
];

/* Забор огорода у дома (отрезки) */
export const FENCES = [
  { from: [4, -16], to: [13, -16] },
  { from: [4, -16], to: [4, -12.5] },
];

/* Фонари на столбах (пак Halloween): у каждого свой тёплый свет. Не больше четырёх источников. */
export const LAMPS = [[-6, 5.2, 200], [3.8, -3.6, 20], [-1.9, 13, 90], [-4.2, -14.5, 90]];

/* Кладбище за церковью: ограда, ворота, могилы, мёртвые деревья, свечи */
export const GRAVEYARD = {
  x: -1, z: -31, w: 18, d: 10,
  gate: 'south',
  items: [
    ['gravestone', -6, -2, 10], ['gravestone', -2, -3, -8], ['grave_A', 3, -2, 0], ['grave_B', 6.5, -3, 15],
    ['gravemarker_A', -5, 2, -20], ['gravestone', 0, 2, 5], ['grave_A', 5, 2.4, -5], ['coffin', -7.2, 3, 80],
    ['tree_dead_large', 7.5, 3.4, 40], ['tree_dead_medium', -8, -3.6, -30], ['shrine_candles', 1.5, -0.2, 0],
    ['candle_triple', -3.5, 0.5, 0], ['candle_triple', 3.8, 0.6, 30],
  ],
};

/* Лес по краю карты и холмы на горизонте — чтобы мир не обрывался пустой плоскостью */
export const FOREST = { inner: 25, outer: 33, count: 70, seed: 11 };
export const HORIZON = [
  ['hills_A_trees', -44, -30, 0, 9], ['mountain_A_grass_trees', 0, -50, 30, 10], ['hills_B_trees', 42, -28, 60, 9],
  ['hills_A_trees', 48, 12, 120, 9], ['hills_B_trees', -46, 16, 200, 9], ['mountain_A_grass_trees', 30, 46, 250, 9],
  ['hills_A_trees', -30, 46, 300, 9],
];

/* Жители. model — файл в assets/models/chars; keep — какие предметы в руках видны. */
export const NPCS = [
  {
    id: 'elder', sprite: 'elder', model: 'Mage', keep: ['2H_Staff', 'Mage_Hat'], x: -3, z: 2.5, face: 200,
    name: 'Староста Ульрих', title: 'Глава деревни', icon: '📜',
    talk: 'elder',
  },
  {
    id: 'guard', sprite: 'guard', model: 'Knight', keep: ['1H_Sword', 'Badge_Shield', 'Knight_Helmet'], x: 6, z: 3,
    name: 'Капитан Бруно', title: 'Начальник стражи', icon: '🛡️',
    patrol: [[6, 3], [6, -4], [-4, -5], [-5, 6], [4, 7]],
    talk: 'guard',
  },
  {
    id: 'marta', sprite: 'marta', model: 'Mage', keep: [], x: -6.4, z: -2.6, face: 150,
    name: 'Марта', title: 'Хозяйка таверны', icon: '🍺', talk: 'marta',
  },
  {
    id: 'kael', sprite: 'kael', model: 'Knight', keep: ['1H_Sword'], x: 7.5, z: -5.5, face: 220,
    name: 'Каэль', title: 'Странствующий мечник', icon: '⚔️', talk: 'kael',
  },
];

/* Режим отрисовки персонажей: 'hd2d' — пиксельные спрайты в 3D-мире (как Dragon Quest HD-2D), '3d' — 3D-модели */
export const CHAR_MODE_DEFAULT = '3d';

/* Главный герой и его облики (скины). Облик меняется кнопкой 🎭 и запоминается на устройстве.
   keep — какие предметы модели видны; height — рост в метрах. */
export const HERO = { x: 0.5, z: 9, face: 180 };
export const SKINS = {
  oni: {
    name: 'Они-самурай', model: 'Oni', keep: [], height: 1.95,
    // огненный двуручник в правой руке: клинок вперёд и чуть вниз (в A-позе), рукоять — в ладони
    weapon: { model: 'FireSword', bone: 'RightHand$', length: 1.5, grip: 0.82, aim: [0, -0.25, 1], offset: [0, 0.07, 0], fire: true },
  },
  pixel: { name: 'Искатель приключений (пиксели)', sprite: 'hero' },
  wanderer: { name: 'Странник', model: 'Rogue_Hooded', keep: ['Knife', 'Rogue_Cape'], height: 1.8 },
  reaper: { name: 'Жнец Пустоты', model: 'Reaper', keep: [], height: 2.15 },
};
export const DEFAULT_SKIN = 'oni';

/* Входы в здания: кнопка «Войти» появляется только у крыльца. local[0] — сдвиг вдоль фасада. */
export const DOORS = [
  { id: 'tavern', building: 'tavern', local: [0.12, 0, 0], name: 'Таверна «Пьяный гусь»' },
];

/* Диалоги. Узел: text + answers [текст, следующий узел | null, действие?] */
export const DIALOGS = {
  marta: {
    start: {
      text: 'Заходи, заходи! У «Пьяного гуся» всегда найдётся тёплая похлёбка и место у огня.\nДа ты, гляжу, не местный — по глазам видно.',
      answers: [['Какие новости?', 'news'], ['Позже зайду.', null]],
    },
    news: {
      text: 'Каэль вернулся с перевала, весь в саже. Говорит, на юге земля горит — огненные бесы лезут из трещин.',
      answers: [['Огненные бесы?', 'fire'], ['Спасибо, Марта.', null]],
    },
    fire: {
      text: 'Сама не видела и видеть не хочу. Спроси Каэля — он у дома старосты, точит меч.',
      answers: [['Найду его.', null]],
    },
  },
  kael: {
    start: {
      text: 'А, это ты. Вовремя.\nЗа южным перевалом земля треснула, из трещин течёт лава. Я видел там тварей из огня.',
      answers: [['Покажешь дорогу?', 'road', 'cheer'], ['Звучит опасно.', 'danger']],
    },
    road: {
      text: 'Скоро. Сначала соберись: зелья, хорошая броня. Там жарко — во всех смыслах.',
      answers: [['Договорились.', null]],
    },
    danger: {
      text: 'Опасно. Поэтому и иду не один.',
      answers: [['Я с тобой.', 'road', 'cheer']],
    },
  },
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
