const REDIRECT_BASE = "https://vong.invalid";

export function safeInternalRedirect(value: string | undefined): string {
  if (!value) return "/";

  try {
    const resolved = new URL(value, REDIRECT_BASE);
    if (resolved.origin !== REDIRECT_BASE) return "/";
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return "/";
  }
}
