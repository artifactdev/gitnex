/**
 * GitVolt kept its UI preferences (theme mirror, densities, WIP drafts, list prefs, …) in
 * `localStorage` under `gitvolt.*`. The app is GitNex now and reads `gitnex.*`; copy the old
 * keys once, before any store reads them. Old keys stay, so a downgrade still finds them.
 */
export function migrateLegacyStoreKeys(): void {
  try {
    const old: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('gitvolt.')) old.push(key);
    }
    for (const key of old) {
      const next = `gitnex.${key.slice('gitvolt.'.length)}`;
      if (localStorage.getItem(next) === null) {
        const value = localStorage.getItem(key);
        if (value !== null) localStorage.setItem(next, value);
      }
    }
  } catch {
    /* storage unavailable: the defaults apply */
  }
}

migrateLegacyStoreKeys();
