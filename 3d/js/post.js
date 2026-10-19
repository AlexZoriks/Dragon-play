/* Постобработка для режима «высокое качество»:
   - GTAO — затенение в углах и под предметами (объём и «контакт» с землёй);
   - мягкое свечение фонарей и свечей (bloom только для очень ярких мест);
   - цветокоррекция в духе тёмного фэнтези: чуть меньше насыщенности, холодные тени, тёплый свет, виньетка.
   В экономном режиме сцена рисуется напрямую, без этих проходов. */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, saturation: { value: 0.86 }, contrast: { value: 1.08 }, vignette: { value: 0.42 },
    tilt: { value: 0.0 }, texel: { value: new THREE.Vector2(1 / 1280, 1 / 800) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float saturation, contrast, vignette, tilt; uniform vec2 texel; varying vec2 vUv;
    void main() {
      // «миниатюра» HD-2D: верх и низ кадра мягко размыты, середина (герой) резкая
      float b = tilt * smoothstep(0.18, 0.5, abs(vUv.y - 0.5)) * 3.0;
      vec4 c = texture2D(tDiffuse, vUv);
      if (b > 0.01) {
        vec4 acc = c; float w = 1.0;
        for (int i = 0; i < 8; i++) {
          float a = float(i) * 0.785398;
          vec2 o = vec2(cos(a), sin(a)) * texel * b * 2.0;
          acc += texture2D(tDiffuse, vUv + o) + texture2D(tDiffuse, vUv + o * 2.0); w += 2.0;
        }
        c = acc / w;
      }
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, saturation);
      c.rgb = (c.rgb - 0.5) * contrast + 0.5;
      c.rgb += mix(vec3(-0.012, 0.0, 0.022), vec3(0.03, 0.012, -0.02), smoothstep(0.15, 0.75, l)); // холодные тени, тёплый свет
      float d = distance(vUv, vec2(0.5));
      c.rgb *= 1.0 - vignette * smoothstep(0.35, 0.85, d);
      gl_FragColor = c;
    }`,
};

export class PostFx {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.ao = new GTAOPass(scene, camera, 1, 1);
    this.ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1, scale: 1.2 });
    this.ao.blendIntensity = 0.9;
    this.composer.addPass(this.ao);
    // значки и плоские пиксельные персонажи не должны попадать в проход затенения — иначе вокруг них квадрат
    const aoRender = this.ao.render.bind(this.ao);
    this.ao.render = (...args) => {
      const hidden = [];
      scene.traverse((o) => { if ((o.isSprite || o.userData.noAO) && o.visible) { o.visible = false; hidden.push(o); } });
      aoRender(...args);
      for (const o of hidden) o.visible = true;
    };
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.4, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());            // тонмаппинг и sRGB
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);                   // цвет и «миниатюра» после перевода в sRGB
    this.enabled = true;
  }

  setSize(w, h, pixelRatio) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
    this.grade.uniforms.texel.value.set(1 / (w * pixelRatio), 1 / (h * pixelRatio));
  }

  render() { this.composer.render(); }
}
