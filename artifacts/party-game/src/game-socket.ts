import { gameViewResponseSchema } from '@workspace/shared';

type Listener = (payload?: unknown) => void;

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
): () => void {
  const watch = () => socket.emit('game:watch', { gameId });
  const receiveView: Listener = (payload) => {
    const parsed = gameViewResponseSchema.safeParse(payload);
    if (!parsed.success) return;
    if ('private' in parsed.data.view && parsed.data.view.private !== null) {
      return;
    }
    onView(parsed.data);
  };

  socket.on('connect', watch);
  socket.on('game:view', receiveView);
  if (socket.connected) watch();

  return () => {
    socket.off('connect', watch);
    socket.off('game:view', receiveView);
  };
}
