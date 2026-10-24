import { en } from '@/locale/en-GB';
import type { GameConnectionState } from './game-socket';

export function GameConnectionStatus({
  status,
}: {
  status: GameConnectionState | 'offline';
}) {
  const isOnline = status === 'online';
  const label = isOnline
    ? en.app.online
    : status === 'offline'
      ? en.app.offline
      : en.app.reconnecting;

  return (
    <span
      role="status"
      data-testid="game-connection-state"
      aria-label={`${en.app.connectionStatus}: ${label}`}
      className={`game-connection-state${isOnline ? ' game-connection-state--live' : ''}`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${isOnline ? 'bg-gilt' : 'bg-ash'}`}
      />
      <span
        className={
          isOnline
            ? 'game-connection-label game-connection-label--visually-hidden'
            : 'game-connection-label'
        }
      >
        {label}
      </span>
    </span>
  );
}
