// Переключатель языка RU | EN. Ставится в шапку каждого экрана.
import { setLang, useLang } from './lang';
import './langSwitch.css';

export function LangSwitch({ className = '' }: { className?: string }) {
  const lang = useLang();
  return (
    <div className={`lang-switch ${className}`} role="group" aria-label={lang === 'en' ? 'Language' : 'Язык'}>
      <button type="button" aria-pressed={lang === 'ru'} onClick={() => setLang('ru')} lang="ru">
        RU
      </button>
      <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')} lang="en">
        EN
      </button>
    </div>
  );
}
