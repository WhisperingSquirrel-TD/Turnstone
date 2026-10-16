export function requiresPrivacyShield(
  phase: string,
  notesOpen: boolean,
): boolean {
  return !notesOpen && ['DEAL', 'SHADOW'].includes(phase);
}
