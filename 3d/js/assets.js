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

export const envUrl = (name) => `assets/models/env/${name}.gltf`;
export const charUrl = (name) => `assets/models/chars/${name}.glb`;

/** Предзагрузка списка файлов; возвращает Map url → gltf */
export async function preload(urls) {
  const unique = [...new Set(urls)];
  const results = await Promise.all(unique.map(load));
  return new Map(unique.map((u, i) => [u, results[i]]));
}

/** Статичная модель окружения: общая геометрия, свои материалы не нужны */
export async function envModel(name) {
  const gltf = await load(envUrl(name));
  const obj = gltf.scene.clone(true);
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return obj;
}

/** Анимированный персонаж: { root, clips }. keep — какие предметы оставить видимыми. */
export async function characterModel(name, keep = []) {
  const gltf = await load(charUrl(name));
  const root = cloneSkinned(gltf.scene);
  const keepSet = new Set(keep);
  const isBody = (n) => /_(Arm|Body|Head|Leg)/.test(n);       // тело видно всегда
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.frustumCulled = false;            // скинированные меши иначе пропадают у края кадра
    // у многоматериальных узлов меш — дочерний объект с суффиксом, имя узла — у родителя
    const names = [o.name, o.parent && !o.parent.isBone ? o.parent.name : ''];
    o.visible = names.some((n) => isBody(n) || keepSet.has(n));
  });
  return { root, clips: gltf.animations };
}
