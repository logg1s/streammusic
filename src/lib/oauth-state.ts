/** Tên cookie giữ `state` chống CSRF giữa bước authorize và callback. */
export function stateCookieName(provider: string): string {
  return `sm_oauth_state_${provider}`;
}
