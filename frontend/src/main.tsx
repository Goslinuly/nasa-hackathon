// Точка входа: один экран с шаром; старые адреса /planner и /atlas ведут на режимы.
import React from 'react';
import ReactDOM from 'react-dom/client';

import { legacyRedirect } from '@/app/routes';
import { installStaleBuildRecovery } from '@/app/staleBuild';
import { Shell } from '@/app/Shell';
import '@/app/styles.css';
import { subscribeLang, tr } from '@/shared/i18n/lang';

installStaleBuildRecovery();

// Заголовок вкладки и описание страницы — на выбранном языке.
function applyDocumentMeta(): void {
  document.title = 'Martian Map';
  const description = tr(
    'Шар Марса по открытым данным NASA: рельеф, маршруты роверов, 2D-атлас и прогулка от первого лица.',
    'A Mars globe built from open NASA data: terrain, rover routes, a 2D atlas and a first-person walk.',
  );
  document.querySelector('meta[name="description"]')?.setAttribute('content', description);
}
applyDocumentMeta();
subscribeLang(applyDocumentMeta);

const redirect = legacyRedirect(window.location.pathname);
if (redirect) window.history.replaceState(null, '', redirect);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Shell />
  </React.StrictMode>,
);
