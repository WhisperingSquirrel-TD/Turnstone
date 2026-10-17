import type { Server } from 'node:http';

export async function startHttpService(
  server: Server,
  port: number,
  onReady: () => void,
  onFailure: (error: unknown) => Promise<void>,
): Promise<boolean> {
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '0.0.0.0', () => {
        server.off('error', reject);
        resolve();
      });
    });
    onReady();
    return true;
  } catch (error) {
    await onFailure(error);
    return false;
  }
}
