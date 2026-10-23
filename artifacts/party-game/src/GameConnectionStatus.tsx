import { en } from '@/locale/en-GB';
import type { GameConnectionState } from './game-socket';

export function GameConnectionStatus({
  status,
}: {
  status: GameConnectionState | 'offline';
}) {
  const isOnline = status === 'online';

  return (
    <span
      role="status"
      aria-label={en.app.connectionStatus}
      className="game-connection-state"
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${isOnline ? 'bg-gilt' : 'bg-ash'}`}
      />
      {isOnline
        ? en.app.online
        : status === 'offline'
          ? en.app.offline
          : en.app.reconnecting}
    </span>
  );
}
