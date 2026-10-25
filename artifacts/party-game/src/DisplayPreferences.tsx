import { en } from '@/locale/en-GB';
import { PlayerTile } from './GameChrome';
import type { DisplayPreference } from './game-theme';

export function DisplayPreferences({
  value,
  onChange,
}: {
  value: DisplayPreference;
  onChange: (value: DisplayPreference) => void;
}) {
  const options: { id: DisplayPreference; label: string }[] = [
    { id: 'system', label: en.app.matchPhone },
    { id: 'light', label: en.app.light },
    { id: 'dark', label: en.app.dark },
  ];
  return (
    <fieldset
      className="game-display-settings"
      data-testid="display-preferences"
    >
      <legend>{en.app.display}</legend>
      {options.map((option) => (
        <PlayerTile
          key={option.id}
          name={option.label}
          state={value === option.id ? 'selected' : 'available'}
          dataChoiceId={option.id}
          onSelect={() => onChange(option.id)}
        />
      ))}
    </fieldset>
  );
}
