export const CODE_RE = /^[A-Z0-9-]{2,8}$/;

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}
