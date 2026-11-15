// Компактная раскладка прогулки: телефон или низкий экран (телефон боком внутри браузера).
import { useEffect, useState } from 'react';

export const COMPACT_QUERY = '(max-width: 760px), (max-height: 500px)';

/** Следующее ускорение по кругу: ×1 → ×10 → ×60 → ×600 → ×1. */
export function nextTimeScale(scales: readonly number[], current: number): number {
  const i = scales.indexOf(current);
  return scales[(i + 1) % scales.length] ?? scales[0];
}

export function useCompact(): boolean {
  const [compact, setCompact] = useState(() => window.matchMedia?.(COMPACT_QUERY).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(COMPACT_QUERY);
    if (!mq) return;
    const on = () => setCompact(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return compact;
}
