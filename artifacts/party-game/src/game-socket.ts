import { gameViewResponseSchema } from '@workspace/shared';

type Listener = (payload?: unknown) => void;

export type GameConnectionState = 'reconnecting' | 'online';

export interface GameRealtimeSocket {
  connected: boolean;
  on(event: string, listener: Listener): unknown;
  off(event: string, listener: Listener): unknown;
  emit(event: string, payload: unknown): unknown;
}

export function attachGameView(
  socket: GameRealtimeSocket,
  gameId: string,
  onView: (response: ReturnType<typeof gameViewResponseSchema.parse>) => void,
  onStatus: (status: GameConnectionState) => void = () => {},
): () => void {
  const watch = () => {
    onStatus('reconnecting');
    socket.emit('game:watch', { gameId });
  };
  const disconnected = () => onStatus('reconnecting');
  const receiveView: Listener = (payload) => {
    const parsed = gameViewResponseSchema.safeParse(payload);
    if (!parsed.success) return;
    if ('private' in parsed.data.view && parsed.data.view.private !== null) {
      return;
    }
    onView(parsed.data);
    onStatus('online');
  };

  onStatus('reconnecting');
  socket.on('connect', watch);
  socket.on('disconnect', disconnected);
  socket.on('connect_error', disconnected);
  socket.on('game:view', receiveView);
  if (socket.connected) watch();

  return () => {
    socket.off('connect', watch);
    socket.off('disconnect', disconnected);
    socket.off('connect_error', disconnected);
    socket.off('game:view', receiveView);
  };
}
