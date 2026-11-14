import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { applyGroundDetail, insertAtMarker } from './terrainDetail';
import { createTerrainMaterial, orthoHiPlacement } from './terrainMaterial';

const lambert = () => ({
  vertexShader: THREE.ShaderLib.lambert.vertexShader,
  fragmentShader: THREE.ShaderLib.lambert.fragmentShader,
  uniforms: {} as Record<string, THREE.IUniform>,
});
type Shader = ReturnType<typeof lambert>;
const compile = (m: THREE.Material, shader: Shader) =>
  m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);

describe('художественная детализация грунта: цепочка onBeforeCompile', () => {
  it('вызывает предыдущий хук первым и учитывает его ключ кэша', () => {
    const m = new THREE.MeshLambertMaterial();
    const calls: string[] = [];
    m.onBeforeCompile = (shader) => {
      calls.push('prev');
      // Предыдущий патч видит исходник ещё без наших вставок.
      expect(shader.fragmentShader).not.toContain('uGdStrength');
      shader.uniforms.uPrev = { value: 1 };
    };
    m.customProgramCacheKey = () => 'prev-key';
    applyGroundDetail(m);
    const shader = lambert();
    compile(m, shader);
    expect(calls).toEqual(['prev']);
    expect(shader.uniforms.uPrev).toBeDefined();
    expect(shader.uniforms.uGdStrength.value).toBe(1);
    expect(shader.vertexShader).toContain('vGdP =');
    const f = shader.fragmentShader;
    expect(f.indexOf('gdGrad = vec2')).toBeGreaterThan(f.indexOf('#include <map_fragment>'));
    expect(f.indexOf('normal = normalize( mat3( viewMatrix )')).toBeGreaterThan(f.indexOf('#include <normal_fragment_maps>'));
    const key = m.customProgramCacheKey();
    expect(key).toContain('prev-key');
    expect(key).toContain('ground-detail');
  });

  it('работает поверх патча, заменившего map_fragment, и включается без перекомпиляции', () => {
    const m = new THREE.MeshLambertMaterial();
    const prev = vi.fn((shader: Shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', 'diffuseColor *= vec4(1.0); // blend');
    });
    m.onBeforeCompile = prev as unknown as THREE.Material['onBeforeCompile'];
    const gd = applyGroundDetail(m);
    const shader = lambert();
    compile(m, shader);
    expect(prev).toHaveBeenCalledOnce();
    const f = shader.fragmentShader;
    expect(f.indexOf('gdGrad = vec2')).toBeGreaterThan(f.indexOf('// blend'));
    expect(f.indexOf('gdGrad = vec2')).toBeLessThan(f.indexOf('#include <color_fragment>'));
    const key = m.customProgramCacheKey();
    gd.setEnabled(false);
    expect(shader.uniforms.uGdStrength.value).toBe(0);
    expect(gd.enabled).toBe(false);
    expect(m.customProgramCacheKey()).toBe(key);
  });

  it('dispose возвращает предыдущий хук', () => {
    const m = new THREE.MeshLambertMaterial();
    const prev = m.onBeforeCompile;
    const gd = applyGroundDetail(m);
    expect(m.onBeforeCompile).not.toBe(prev);
    gd.dispose();
    expect(m.onBeforeCompile).toBe(prev);
  });

  it('insertAtMarker: вставка до/после маркера и ошибка без маркеров', () => {
    expect(() => insertAtMarker('void main(){}', ['#include <x>'], 'y')).toThrow();
    expect(insertAtMarker('a\nB\nc', [{ before: 'B' }], 'X')).toBe('a\n\nX\nB\nc');
    expect(insertAtMarker('a\nB\nc', ['B'], 'X')).toBe('a\nB\nX\n\nc');
  });

  it('ложится поверх материала рельефа с детальным снимком: детальный снимок раньше фактуры', () => {
    const tex = new THREE.Texture();
    const hiTex = new THREE.Texture();
    const placement = orthoHiPlacement([0, 0, 2000, 2000], [500, 500, 1500, 1500]);
    const m = createTerrainMaterial(tex, { texture: hiTex, placement });
    applyGroundDetail(m);
    const shader = lambert();
    compile(m, shader);
    const f = shader.fragmentShader;
    expect(shader.uniforms.terrainOrthoHi.value).toBe(hiTex);
    expect(shader.uniforms.uGdStrength.value).toBe(1);
    // Фактура модулирует уже итоговый снимок, поэтому идёт после вставки детального окна.
    expect(f.indexOf('terrainHiUv')).toBeGreaterThan(f.indexOf('#include <map_fragment>'));
    expect(f.indexOf('gdGrad = vec2')).toBeGreaterThan(f.indexOf('terrainHiUv'));
    expect(m.customProgramCacheKey()).toContain('terrain-ortho-hi');
    expect(m.customProgramCacheKey()).toContain('ground-detail');
  });
});

