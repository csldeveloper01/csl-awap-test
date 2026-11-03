/**
 * Utility for automatic sanitized unique code generation from entity titles.
 * Handles collision avoidance, character cleanup, and casing.
 */

export function generateCodeFromTitle(title: string, maxLength = 24): string {
  if (!title) return '';

  const cleaned = title
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

  return cleaned.slice(0, maxLength);
}

export function generateInvitationCode(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
