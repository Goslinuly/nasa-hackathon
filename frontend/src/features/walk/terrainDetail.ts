// Художественная детализация грунта у ног. Это НЕ данные: процедурный шум в мировых координатах,
// который мягко модулирует яркость снимка и возмущает нормаль, чтобы вблизи (где снимок HiRISE
// даёт несколько пикселей на экран) рельеф не выглядел «мыльным». Геометрия и цвет не меняются.
//
// Патч шейдера совместим с цепочкой onBeforeCompile: предыдущий хук вызывается первым, вставки
// делаются после уникальных include-маркеров (с запасными маркерами, если предыдущий хук какой-то
// маркер заменил), все имена с префиксом gd/uGd/vGd, ключ кэша программы включает предыдущий ключ.

import * as THREE from 'three';

export interface GroundDetail {
  setEnabled(on: boolean): void;
  readonly enabled: boolean;
  dispose(): void;
}

/** Полная сила до этого расстояния от камеры, м. */
export const GD_FULL_M = 15;
/** К этому расстоянию фактура исчезает полностью, м. */
export const GD_ZERO_M = 60;

const KEY = 'ground-detail-v1';

// Якорь: координаты шума считаются от узла сетки 320 м рядом с камерой, чтобы во float32
// хватало точности на сантиметровые октавы. Все частоты кратны 1/64 м⁻¹, поэтому сдвиг якоря
// попадает в целые ячейки шума и картинка при смене якоря не прыгает (поворот (3,4)/5 тоже).
const COMMON_GLSL = /* glsl */ `
#define GD_ANCHOR 320.0
uniform float uGdStrength;
varying vec2 vGdP;
varying vec3 vGdRel;
`;

const VERTEX_GLSL = /* glsl */ `
{
  vec4 gdWorld = modelMatrix * vec4( transformed, 1.0 );
  vGdP = gdWorld.xz - floor( cameraPosition.xz / GD_ANCHOR ) * GD_ANCHOR;
  vGdRel = gdWorld.xyz - cameraPosition;
}
`;

const FRAGMENT_PARS_GLSL = /* glsl */ `
uint gdHash( ivec2 c, uint seed ) {
  uvec2 q = uvec2( c );
  uint h = ( q.x * 0x8da6b343u ) ^ ( q.y * 0xd8163841u ) ^ ( seed * 0xcb1ab31fu );
  h ^= h >> 16; h *= 0x7feb352du; h ^= h >> 15; h *= 0x846ca68bu; h ^= h >> 16;
  return h;
}
float gdRand( ivec2 c, uint seed ) { return float( gdHash( c, seed ) >> 8 ) * ( 1.0 / 16777216.0 ); }

// Value-шум с аналитическими производными: x — значение в [-1,1], yz — градиент по q.
vec3 gdNoise( vec2 q, ivec2 base, uint seed ) {
  vec2 fl = floor( q );
  vec2 f = q - fl;
  ivec2 i = ivec2( fl ) + base;
  float a = gdRand( i, seed );
  float b = gdRand( i + ivec2( 1, 0 ), seed );
  float c = gdRand( i + ivec2( 0, 1 ), seed );
  float d = gdRand( i + ivec2( 1, 1 ), seed );
  vec2 u = f * f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 );
  vec2 du = 30.0 * f * f * ( f * ( f - 2.0 ) + 1.0 );
  float k1 = b - a, k2 = c - a, k4 = a - b - c + d;
  float v = a + k1 * u.x + k2 * u.y + k4 * u.x * u.y;
  return vec3( 2.0 * v - 1.0, 2.0 * du * vec2( k1 + k4 * u.y, k2 + k4 * u.x ) );
}

// Октава: поворот R = [[rx,-ry],[ry,rx]]/5 (rx²+ry²=25), затем частоты freq (1/м, кратны 1/64).
// Возвращает значение и градиент по метрам локальных координат.
vec3 gdOctave( vec2 p, ivec2 aIdx, vec2 freq, int rx, int ry, uint seed ) {
  mat2 R = mat2( float( rx ), float( ry ), float( -ry ), float( rx ) ) * 0.2;
  vec2 q = ( R * p ) * freq;
  ivec2 m = ivec2( GD_ANCHOR * freq * 0.2 + 0.5 );
  ivec2 base = ivec2( rx * aIdx.x - ry * aIdx.y, ry * aIdx.x + rx * aIdx.y ) * m;
  vec3 n = gdNoise( q, base, seed );
  return vec3( n.x, transpose( R ) * ( freq * n.yz ) );
}

// Разреженные камешки: в ячейке cellM не больше одного купола радиусом rMin..rMax.
// Возвращает (яркость, dh/dx, dh/dz). pix — размер пикселя на грунте, м.
vec3 gdPebbles( vec2 p, ivec2 aIdx, float cellM, float density, float rMin, float rMax, float pix, uint seed ) {
  vec2 q = p / cellM;
  vec2 fl = floor( q );
  ivec2 cell = ivec2( fl ) + aIdx * int( GD_ANCHOR / cellM + 0.5 );
  if ( gdRand( cell, seed ) > density ) return vec3( 0.0 );
  float r = mix( rMin, rMax, pow( gdRand( cell, seed + 1u ), 2.0 ) );
  float aa = smoothstep( 0.8, 2.5, r / pix );
  if ( aa <= 0.0 ) return vec3( 0.0 );
  float span = max( cellM - 2.7 * r, 0.0 );
  vec2 c = vec2( gdRand( cell, seed + 2u ), gdRand( cell, seed + 3u ) ) * span + 1.35 * r;
  vec2 d = ( q - fl ) * cellM - c;
  float d2 = dot( d, d ) / ( r * r );
  float tone = mix( -0.9, 0.6, gdRand( cell, seed + 4u ) );
  if ( d2 < 1.0 ) {
    float s = 1.0 - d2;
    // h = H·(1-d²)², H = 0,45 r → dh/dp = -4H(1-d²)·d/r²
    vec2 g = -4.0 * 0.45 * s * d / r;
    return vec3( tone * ( 0.6 + 0.4 * s ), g ) * aa;
  }
  // Мягкое затенение в «лунке» вокруг камня.
  float ring = 1.0 - smoothstep( 1.0, 1.8, d2 );
  return vec3( -0.35 * ring, 0.0, 0.0 ) * aa;
}
`;

const FRAGMENT_MAP_GLSL = /* glsl */ `
vec2 gdGrad = vec2( 0.0 );
{
  vec2 gdFw = fwidth( vGdP );
  float gdPix = max( length( gdFw ), 1e-5 );
  float gdW = uGdStrength * ( 1.0 - smoothstep( ${GD_FULL_M.toFixed(1)}, ${GD_ZERO_M.toFixed(1)}, length( vGdRel ) ) );
  if ( gdW > 0.001 ) {
    ivec2 aIdx = ivec2( floor( cameraPosition.xz / GD_ANCHOR ) );
    vec2 p = vGdP;
    float bright = 0.0;
    vec3 o;
    float a;
    // Неровности 25–45 см и вытянутая рябь ~15 см (амплитуда — наклон, м/м).
    a = 1.0 - smoothstep( 0.3, 0.6, gdPix * 2.5 );
    if ( a > 0.0 ) { o = gdOctave( p, aIdx, vec2( 2.5, 2.5 ), 5, 0, 11u ); gdGrad += 0.025 * o.yz * a; bright += 0.25 * o.x * a; }
    a = 1.0 - smoothstep( 0.3, 0.6, gdPix * 6.5 );
    if ( a > 0.0 ) { o = gdOctave( p, aIdx, vec2( 2.0, 6.5 ), 3, 4, 12u ); gdGrad += 0.012 * o.yz * a; bright += 0.2 * o.x * a; }
    a = 1.0 - smoothstep( 0.3, 0.6, gdPix * 9.0 );
    if ( a > 0.0 ) { o = gdOctave( p, aIdx, vec2( 9.0, 9.0 ), 4, -3, 13u ); gdGrad += 0.006 * o.yz * a; bright += 0.2 * o.x * a; }
    // Песок и мелкий гравий 1–5 см.
    a = 1.0 - smoothstep( 0.3, 0.6, gdPix * 26.0 );
    if ( a > 0.0 ) { o = gdOctave( p, aIdx, vec2( 26.0, 26.0 ), 3, -4, 14u ); gdGrad += 0.0028 * o.yz * a; bright += 0.3 * o.x * a; }
    a = 1.0 - smoothstep( 0.3, 0.6, gdPix * 61.0 );
    if ( a > 0.0 ) { o = gdOctave( p, aIdx, vec2( 61.0, 61.0 ), 4, 3, 15u ); gdGrad += 0.0012 * o.yz * a; bright += 0.3 * o.x * a; }
    // Разреженные камешки 3–15 см в поперечнике.
    // Камешки не считаются, когда даже самый крупный меньше ~0,8 пикселя (gdPebbles вернул бы 0).
    if ( 0.045 > 0.8 * gdPix ) { o = gdPebbles( p, aIdx, 0.5, 0.22, 0.015, 0.045, gdPix, 21u ); gdGrad += o.yz; bright += o.x; }
    if ( 0.075 > 0.8 * gdPix ) { o = gdPebbles( p, aIdx, 1.25, 0.18, 0.04, 0.075, gdPix, 31u ); gdGrad += o.yz; bright += o.x; }
    gdGrad *= gdW;
    diffuseColor.rgb *= 1.0 + 0.13 * gdW * clamp( bright, -1.0, 1.0 );
  }
}
`;

const FRAGMENT_NORMAL_GLSL = /* glsl */ `
if ( gdGrad.x != 0.0 || gdGrad.y != 0.0 ) {
  vec3 gdN = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
  vec3 gdT = vec3( gdGrad.x, 0.0, gdGrad.y );
  gdN = normalize( gdN - ( gdT - gdN * dot( gdN, gdT ) ) );
  normal = normalize( mat3( viewMatrix ) * gdN );
}
`;

/** Маркер вставки: строка в исходнике шейдера и куда ставить код — после неё или перед ней. */
export type Marker = string | { before: string };

/** Вставляет code у первого найденного маркера; бросает ошибку, если ни одного нет. */
export function insertAtMarker(src: string, markers: Marker[], code: string): string {
  for (const m of markers) {
    const key = typeof m === 'string' ? m : m.before;
    const i = src.indexOf(key);
    if (i < 0) continue;
    const at = typeof m === 'string' ? i + key.length : i;
    return `${src.slice(0, at)}\n${code}\n${src.slice(at)}`;
  }
  const names = markers.map((m) => (typeof m === 'string' ? m : m.before));
  throw new Error(`terrainDetail: ни один маркер не найден: ${names.join(', ')}`);
}

/** Применяет шейдерные вставки к уже собранным (возможно, другим патчем) исходникам. */
export function patchGroundDetailShader(shader: { vertexShader: string; fragmentShader: string }): void {
  let v = shader.vertexShader;
  v = insertAtMarker(v, ['#include <common>'], COMMON_GLSL);
  v = insertAtMarker(v, ['#include <project_vertex>', { before: '#include <worldpos_vertex>' }], VERTEX_GLSL);
  let f = shader.fragmentShader;
  f = insertAtMarker(f, ['#include <common>'], COMMON_GLSL + FRAGMENT_PARS_GLSL);
  // Фактура модулирует уже итоговый снимок: вставка перед color_fragment, то есть после
  // map_fragment и всех вставок, которые другие патчи (детальный снимок) поставили за ним.
  f = insertAtMarker(
    f,
    [{ before: '#include <color_fragment>' }, { before: '#include <normal_fragment_begin>' }, '#include <map_fragment>'],
    FRAGMENT_MAP_GLSL,
  );
  f = insertAtMarker(f, ['#include <normal_fragment_maps>', { before: '#include <emissivemap_fragment>' }], FRAGMENT_NORMAL_GLSL);
  shader.vertexShader = v;
  shader.fragmentShader = f;
}

export function applyGroundDetail(material: THREE.MeshLambertMaterial, enabled = true): GroundDetail {
  const uStrength = { value: enabled ? 1 : 0 };
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey;
  const hook: THREE.Material['onBeforeCompile'] = function (this: THREE.Material, shader, renderer) {
    prev.call(this, shader, renderer);
    shader.uniforms.uGdStrength = uStrength;
    patchGroundDetailShader(shader);
  };
  material.onBeforeCompile = hook;
  material.customProgramCacheKey = function (this: THREE.Material) {
    return `${prevKey.call(this)}|${KEY}`;
  };
  material.needsUpdate = true;

  return {
    setEnabled(on: boolean) {
      uStrength.value = on ? 1 : 0;
    },
    get enabled() {
      return uStrength.value > 0;
    },
    dispose() {
      uStrength.value = 0;
      if (material.onBeforeCompile === hook) {
        material.onBeforeCompile = prev;
        material.customProgramCacheKey = prevKey;
        material.needsUpdate = true;
      }
    },
  };
}
