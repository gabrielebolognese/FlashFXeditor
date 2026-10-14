// Canvas views redraw their backing stores at devicePixelRatio; this tells them when it changes.

/** Calls `onChange` whenever devicePixelRatio changes (window moved to another screen, browser zoom). */
export function watchDevicePixelRatio(win: Window | null, onChange: () => void): () => void {
  if (!win?.matchMedia) return () => {};
  let query: MediaQueryList | null = null;
  const listen = () => {
    query?.removeEventListener("change", changed);
    query = win.matchMedia(`(resolution: ${win.devicePixelRatio}dppx)`);
    query.addEventListener("change", changed);
  };
  const changed = () => {
    listen();
    onChange();
  };
  listen();
  return () => query?.removeEventListener("change", changed);
}
