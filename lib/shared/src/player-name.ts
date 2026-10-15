export function normalizeSeatName(name: string): string {
  return name
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('en-GB');
}

export function isReservedPracticeName(name: string): boolean {
  return /^practice player \d+$/.test(normalizeSeatName(name));
}
