import type { Page } from '@playwright/test';
import type { FullView } from '../../lib/shared/src/contracts';

/** Protocol fixture only: the actual application still subscribes through its socket client. */
export async function installLiveSocketViewFixture(
  page: Page,
  getView: () => { serverNow: number; version: number; view: FullView },
): Promise<void> {
  let sequence = 0;
  const pendingPolls = new Map<string, (packet: string) => void>();
  const queuedPackets = new Map<string, string[]>();
  const replyToPoll = (sid: string, packet: string) => {
    const waiting = pendingPolls.get(sid);
    if (waiting) {
      pendingPolls.delete(sid);
      waiting(packet);
      return;
    }
    queuedPackets.set(sid, [...(queuedPackets.get(sid) ?? []), packet]);
  };
  page.on('close', () => {
    for (const resolve of pendingPolls.values()) resolve('6');
    pendingPolls.clear();
  });
  await page.route('**/socket.io**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const sid = url.searchParams.get('sid');
    if (request.method() === 'GET' && !sid) {
      for (const resolve of pendingPolls.values()) resolve('6');
      pendingPolls.clear();
      const nextSid = `round-7-live-${++sequence}`;
      queuedPackets.set(nextSid, []);
      await route.fulfill({
        contentType: 'text/plain; charset=UTF-8',
        body: `0${JSON.stringify({ sid: nextSid, upgrades: [], pingInterval: 600_000, pingTimeout: 60_000, maxPayload: 1_000_000 })}`,
      });
      return;
    }
    if (!sid) {
      await route.fulfill({ status: 400, body: 'Missing session.' });
      return;
    }
    if (request.method() === 'GET') {
      const packet = queuedPackets.get(sid)?.shift();
      if (packet) {
        await route.fulfill({
          contentType: 'text/plain; charset=UTF-8',
          body: packet,
        });
        return;
      }
      const nextPacket = await new Promise<string>((resolve) =>
        pendingPolls.set(sid, resolve),
      );
      await route
        .fulfill({ contentType: 'text/plain; charset=UTF-8', body: nextPacket })
        .catch(() => {});
      return;
    }
    const body = (request.postData() ?? '').replace(/^\d+:/, '');
    if (body.startsWith('40')) {
      replyToPoll(sid, `40${JSON.stringify({ sid: `${sid}-namespace` })}`);
    } else if (body.startsWith('42')) {
      const [eventName] = JSON.parse(body.slice(2)) as [string, unknown];
      if (eventName === 'game:watch')
        replyToPoll(sid, `42${JSON.stringify(['game:view', getView()])}`);
    }
    await route.fulfill({
      contentType: 'text/plain; charset=UTF-8',
      body: 'ok',
    });
  });
}
