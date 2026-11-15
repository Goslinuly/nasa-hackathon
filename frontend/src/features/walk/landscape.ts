// Телефон: прогулка от первого лица удобнее горизонтально.

type LockableOrientation = ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void };

export function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false);
}

export function isPortrait(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.('(orientation: portrait)').matches ?? false);
}

let entered = false;

/** Внутри жеста пользователя: полный экран и горизонтальная ориентация. Ошибки (iOS Safari) — молча. */
export function enterLandscape(): void {
  if (!isTouchDevice() || !isPortrait()) return;
  entered = true;
  const lock = () => {
    try {
      const o = screen.orientation as LockableOrientation | undefined;
      void o?.lock?.('landscape')?.catch(() => undefined);
    } catch {
      // Блокировка ориентации не поддерживается.
    }
  };
  try {
    const p = document.documentElement.requestFullscreen?.();
    if (p && typeof p.then === 'function') p.then(lock, lock);
    else lock();
  } catch {
    lock();
  }
}

/** Выход из прогулки: снять блокировку и выйти из полного экрана, если входили сами. */
export function exitLandscape(): void {
  if (!entered) return;
  entered = false;
  try {
    (screen.orientation as LockableOrientation | undefined)?.unlock?.();
  } catch {
    // Нечего снимать.
  }
  try {
    if (document.fullscreenElement) void document.exitFullscreen?.()?.catch(() => undefined);
  } catch {
    // Полный экран уже закрыт.
  }
}
