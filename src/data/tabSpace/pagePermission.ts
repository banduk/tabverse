/** Opt-in host access, requested only when the user activates a page action. */
export function pageReadOriginPattern(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.protocol}//${u.hostname}/*`;
  } catch {
    return null;
  }
}

export async function requestPageReadPermission(url: string): Promise<boolean> {
  const origin = pageReadOriginPattern(url);
  if (!origin) return false;
  try {
    return await chrome.permissions.request({ origins: [origin] });
  } catch {
    return false;
  }
}
