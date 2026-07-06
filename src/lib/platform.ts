interface UANavigator extends Navigator {
  userAgentData?: { platform?: string };
}

function detectMac(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as UANavigator;
  const platform = nav.userAgentData?.platform ?? nav.platform ?? "";
  return /mac/i.test(platform) || /mac/i.test(nav.userAgent);
}

export const isMac = detectMac();

const MAC_KEYS: Record<string, string> = {
  Mod: "⌘",
  Shift: "⇧",
  Alt: "⌥",
  Ctrl: "⌃",
  Enter: "↵",
};

const WIN_KEYS: Record<string, string> = {
  Mod: "Ctrl",
  Shift: "Shift",
  Alt: "Alt",
  Ctrl: "Ctrl",
  Enter: "Enter",
};

/** Render a canonical shortcut ("Mod+Shift+L") for the current platform. */
export function formatShortcut(canonical: string): string {
  const map = isMac ? MAC_KEYS : WIN_KEYS;
  const parts = canonical.split("+").map((token) => map[token] ?? token);
  return isMac ? parts.join("") : parts.join("+");
}
