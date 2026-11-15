// Пиксели без данных (прозрачные в PNG Trek) закрашиваем приглушённым запасным слоем, а не чёрным.

// Насколько обесцвечен и затемнён запасной слой: видно, что это не данные текущего слоя.
export const FALLBACK_SATURATION = 0.35;
export const FALLBACK_BRIGHTNESS = 0.7;

const LUMA = [0.2126, 0.7152, 0.0722] as const;

export type Rgb = [number, number, number];

export function muteFallback(rgb: Rgb): Rgb {
  const luma = rgb[0] * LUMA[0] + rgb[1] * LUMA[1] + rgb[2] * LUMA[2];
  return rgb.map((c) => (luma + (c - luma) * FALLBACK_SATURATION) * FALLBACK_BRIGHTNESS) as Rgb;
}

/**
 * Цвет тайла после текстуры: у прозрачных пикселей Trek RGB = 0, поэтому после
 * фильтрации цвет уже умножен на альфу, и остаток (1 − a) добираем запасным слоем.
 * strength = 0, пока запасной тайл не загрузился.
 */
export function composeNoData(color: Rgb, alpha: number, fallback: Rgb, strength: number): Rgb {
  const muted = muteFallback(fallback);
  const rest = (1 - Math.min(1, Math.max(0, alpha))) * strength;
  return color.map((c, i) => c + muted[i] * rest) as Rgb;
}

const f = (n: number) => n.toFixed(4);

// Тот же расчёт в шейдере, вставляется сразу после #include <map_fragment>.
export const NO_DATA_GLSL = `
  {
    vec3 fb = texture2D(uFallbackMap, vTileUv * uFallbackRect.z + uFallbackRect.xy).rgb;
    float luma = dot(fb, vec3(${f(LUMA[0])}, ${f(LUMA[1])}, ${f(LUMA[2])}));
    fb = (vec3(luma) + (fb - vec3(luma)) * ${f(FALLBACK_SATURATION)}) * ${f(FALLBACK_BRIGHTNESS)};
    diffuseColor.rgb += fb * (1.0 - clamp(diffuseColor.a, 0.0, 1.0)) * uFallbackStrength;
    diffuseColor.a = 1.0;
  }`;
