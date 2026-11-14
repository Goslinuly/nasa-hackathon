// Точка входа: один экран с шаром; старые адреса /planner и /atlas ведут на режимы.
import React from 'react';
import ReactDOM from 'react-dom/client';

import { legacyRedirect } from '@/app/routes';
import { installStaleBuildRecovery } from '@/app/staleBuild';
import { Shell } from '@/app/Shell';
import '@/app/styles.css';

installStaleBuildRecovery();

const redirect = legacyRedirect(window.location.pathname);
if (redirect) window.history.replaceState(null, '', redirect);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Shell />
  </React.StrictMode>,
);
