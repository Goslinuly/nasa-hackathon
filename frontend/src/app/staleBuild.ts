// После деплоя у открытой вкладки остаются ссылки на файлы прошлой сборки: ленивый режим
// (прогулка, роверы…) получает 404 и падает с «Режим не загрузился». В этом случае один раз
// перезагружаем страницу — браузер возьмёт новую сборку. Повтор не чаще раза в минуту.

const KEY = 'martian-map:stale-reload-at';
const MIN_INTERVAL_MS = 60_000;

const STALE_CHUNK = /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError/i;

export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return STALE_CHUNK.test(message);
}

/** true — перезагрузка запущена; false — недавно уже перезагружали, показываем ошибку. */
export function reloadForNewBuild(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < MIN_INTERVAL_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // Хранилище недоступно (приватный режим): перезагружаем без защиты от повтора нельзя.
    return false;
  }
  window.location.reload();
  return true;
}

export function installStaleBuildRecovery(): void {
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadForNewBuild()) event.preventDefault();
  });
}
