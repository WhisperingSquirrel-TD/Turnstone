export function canPromote(
  ranges: readonly { start: string; end: string }[],
  commitMessage: string,
  today: string,
): boolean;
