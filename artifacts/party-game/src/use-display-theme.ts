import { useEffect, useState } from 'react';
import {
  displayPreferenceKey,
  gameThemeForPhase,
  readDisplayPreference,
  type DisplayPreference,
} from './game-theme';

function readDevice(): DisplayPreference {
  try {
    return typeof window === 'undefined'
      ? 'system'
      : readDisplayPreference(window.localStorage);
  } catch {
    return 'system';
  }
}

/** Device preference is shared by entry and play; a public night overrides it. */
export function useDisplayTheme(phase?: string) {
  const [displayPreference, setDisplayPreference] =
    useState<DisplayPreference>(readDevice);
  const [phoneDark, setPhoneDark] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const updatePhone = () => setPhoneDark(query.matches);
    const updatePreference = () => setDisplayPreference(readDevice());
    updatePhone();
    query.addEventListener('change', updatePhone);
    window.addEventListener('storage', updatePreference);
    return () => {
      query.removeEventListener('change', updatePhone);
      window.removeEventListener('storage', updatePreference);
    };
  }, []);
  const chooseDisplayPreference = (value: DisplayPreference) => {
    setDisplayPreference(value);
    try {
      window.localStorage.setItem(displayPreferenceKey, value);
    } catch {
      // Keep the current device view usable when storage is unavailable.
    }
  };
  return {
    displayPreference,
    chooseDisplayPreference,
    theme: gameThemeForPhase(phase, displayPreference, phoneDark),
  };
}
