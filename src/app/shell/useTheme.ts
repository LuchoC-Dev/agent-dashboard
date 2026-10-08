import { useEffect, useState } from "react";
import type { Provider } from "../../bindings/Provider";
import { DEFAULT_ACCENT, type Accent } from "../../lib/accents";

export type Theme = "system" | "light" | "dark";

/** Theme is view state (not persisted); "system" follows the OS preference via CSS. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    document.documentElement.dataset.theme = theme === "system" ? "" : theme;
  }, [theme]);
  return [theme, setTheme] as const;
}

/**
 * The app accent preset (`data-accent`, see theme.css), kept exactly like the theme: shell
 * view state that lives across navigation, not written anywhere.
 */
export function useAccent() {
  const [accent, setAccent] = useState<Accent>(DEFAULT_ACCENT);
  useEffect(() => {
    document.documentElement.dataset.accent = accent;
  }, [accent]);
  return [accent, setAccent] as const;
}

/**
 * Brand colors (`--brand-*`) follow the screen's provider, or the neutral app palette ("all")
 * when the screen mixes providers.
 */
export function useProviderTheme(provider: Provider | "all") {
  useEffect(() => {
    document.documentElement.dataset.provider = provider;
  }, [provider]);
}
