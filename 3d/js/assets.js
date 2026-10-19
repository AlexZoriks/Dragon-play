/* Загрузка моделей с общим прогрессом и кешем. Персонажей клонируем через SkeletonUtils,
   чтобы у каждого был свой скелет и свои анимации. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const manager = new THREE.LoadingManager();
const loader = new GLTFLoader(manager);
const cache = new Map();

export function onProgress(fn) {
  manager.onProgress = (_url, loaded, total) => fn(loaded / Math.max(1, total));
}

function load(url) {
  if (!cache.has(url)) cache.set(url, loader.loadAsync(url));
  return cache.get(url);
}

/* Анизотропная фильтрация: текстуры, видимые под углом (камера сверху), остаются чёткими, а не «мылятся» */
let maxAniso = 8;
export const setMaxAnisotropy = (n) => { maxAniso = n; };
export function sharpen(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) {
      if (m[k] && m[k].anisotropy !== maxAniso) { m[k].anisotropy = maxAniso; m[k].needsUpdate = true; }
    }
  });
}

/** Любая модель по пути (с общим кэшем) */
export const loadGltf = (url) => load(url);

export const envUrl = (name, pack = 'env') => `assets/models/${pack}/${name}.gltf`;
export const charUrl = (name) => `assets/models/chars/${name}.glb`;

/** Предзагрузка списка файлов; возвращает Map url → gltf */
export async function preload(urls) {
  const unique = [...new Set(urls)];
  const results = await Promise.all(unique.map(load));
  return new Map(unique.map((u, i) => [u, results[i]]));
}

/** Статичная модель окружения: общая геометрия, свои материалы не нужны */
export async function envModel(name, pack = 'env') {
  const gltf = await load(envUrl(name, pack));
  const obj = gltf.scene.clone(true);
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return obj;
}

/** Анимированный персонаж: { root, clips }. keep — какие предметы оставить видимыми. */
export async function characterModel(name, keep = []) {
  const gltf = await load(charUrl(name));
  const root = cloneSkinned(gltf.scene);
  sharpen(root);
  const keepSet = new Set(keep);
  const isBody = (n) => /_(Arm|Body|Head|Leg)/.test(n);       // тело видно всегда
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.frustumCulled = false;            // скинированные меши иначе пропадают у края кадра
    // у многоматериальных узлов меш — дочерний объект с суффиксом, имя узла — у родителя
    const names = [o.name, o.parent && !o.parent.isBone ? o.parent.name : ''];
    // у моделей из одного меша (Meshy) сменных частей нет — показываем всё
    if (keep.length) o.visible = names.some((n) => isBody(n) || keepSet.has(n));
  });
  return { root, clips: gltf.animations };
}
