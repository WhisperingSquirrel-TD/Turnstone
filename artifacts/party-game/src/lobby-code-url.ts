const lobbyCodePattern = /^[A-HJ-NP-Z2-9]{6}$/;

export function lobbyCodeJoinUrl(input: {
  origin: string;
  joinPath: string;
  code: string;
}): string {
  const code = input.code.toUpperCase();
  if (!lobbyCodePattern.test(code)) throw new Error('Invalid lobby code');

  const base = new URL(input.origin);
  const url = new URL(input.joinPath, base);
  if (url.origin !== base.origin) throw new Error('Invalid join path');
  url.hash = `code=${code}`;
  return url.toString();
}

export function parseLobbyCodeFragment(fragment: string): string | null {
  const match = /^#?code=([A-HJ-NP-Z2-9]{6})$/i.exec(fragment);
  return match?.[1]?.toUpperCase() ?? null;
}
