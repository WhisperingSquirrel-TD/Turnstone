import { gameViewResponseSchema } from '@workspace/shared';

type Listener = (payload?: unknown) => void;

export type GameConnectionState = 'connecting' | 'reconnecting' | 'online';

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
  let connectedBefore = socket.connected;
  let reconnecting = false;
  const watch = () => {
    connectedBefore = true;
    onStatus(reconnecting ? 'reconnecting' : 'connecting');
    socket.emit('game:watch', { gameId });
  };
  const disconnected = () => {
    reconnecting = connectedBefore;
    onStatus(reconnecting ? 'reconnecting' : 'connecting');
  };
  const receiveView: Listener = (payload) => {
    const parsed = gameViewResponseSchema.safeParse(payload);
    if (!parsed.success) return;
    if ('private' in parsed.data.view && parsed.data.view.private !== null) {
      return;
    }
    onView(parsed.data);
    onStatus('online');
  };

  onStatus('connecting');
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
