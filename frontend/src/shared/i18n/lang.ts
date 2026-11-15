// Язык интерфейса: русский или английский.
//
// Строки пишутся парой прямо в коде: t('Слои', 'Layers'). Так перевод лежит рядом с текстом,
// и его не нужно искать по словарю ключей.
//
// В компонентах: const t = useT(); — хук подписывает компонент на смену языка.
// Вне React (движок шара, сцена прогулки, форматирование): tr('…', '…') — берёт текущий язык,
// новый текст появится при следующем обновлении подписи.
//
// Выбор хранится в браузере; без выбора — язык браузера (ru* → русский, иначе английский).

import { useCallback, useSyncExternalStore } from 'react';

export type Lang = 'ru' | 'en';

const KEY = 'martian-map-lang';
const listeners = new Set<() => void>();

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'ru' || saved === 'en') return saved;
  } catch {
    // Хранилище недоступно (приватный режим) — берём язык браузера.
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language || '' : '';
  return nav.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

let current: Lang = initialLang();
applyDocumentLang(current);

function applyDocumentLang(lang: Lang): void {
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // Не сохранилось — язык всё равно сменится до перезагрузки.
  }
  applyDocumentLang(lang);
  listeners.forEach((fn) => fn());
}

export function subscribeLang(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Перевод вне React: текущий язык. */
export function tr(ru: string, en: string): string {
  return current === 'en' ? en : ru;
}

/** Текущий язык в компоненте; компонент перерисуется при смене. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribeLang, getLang, getLang);
}

/** Функция перевода для компонента: const t = useT(); t('Слои', 'Layers'). */
export function useT(): (ru: string, en: string) => string {
  const lang = useLang();
  return useCallback((ru: string, en: string) => (lang === 'en' ? en : ru), [lang]);
}

/** Локаль для toLocaleString / Intl: 'ru-RU' или 'en-US'. */
export function locale(lang: Lang = current): string {
  return lang === 'en' ? 'en-US' : 'ru-RU';
}

/** Выбор поля данных по языку: pick(item.title, item.title_en). Без английского — русское. */
export function pick(ru: string, en?: string | null): string {
  return current === 'en' && en ? en : ru;
}
