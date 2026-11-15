// Телефон в вертикальном положении: просим повернуть его горизонтально.

import { useEffect, useState } from 'react';
import { useT } from '@/shared/i18n/lang';

function usePortrait(): boolean {
  const [portrait, setPortrait] = useState(() => window.matchMedia?.('(orientation: portrait)').matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.('(orientation: landscape)');
    if (!mq) return;
    const on = () => setPortrait(!mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return portrait;
}

export function LandscapeGate() {
  const t = useT();
  const portrait = usePortrait();
  const [dismissed, setDismissed] = useState(false);
  if (!portrait || dismissed) return null;
  return (
    <div className="walk-rotate" role="dialog" aria-modal="true" aria-labelledby="walk-rotate-title">
      <svg className="walk-rotate-icon" viewBox="0 0 64 64" width="72" height="72" aria-hidden="true">
        <rect x="22" y="8" width="20" height="36" rx="3" fill="none" stroke="currentColor" strokeWidth="3" />
        <circle cx="32" cy="39" r="1.8" fill="currentColor" />
        <path d="M14 50 A22 22 0 0 0 50 50" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path d="M50 50 l-7 -1 M50 50 l1 -7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <p id="walk-rotate-title">{t('Поверните телефон горизонтально', 'Rotate your phone to landscape')}</p>
      <button type="button" className="walk-link" onClick={() => setDismissed(true)}>
        {t('Продолжить вертикально', 'Continue in portrait')}
      </button>
    </div>
  );
}
