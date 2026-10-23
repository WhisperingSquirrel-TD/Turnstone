import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoordinatorTakeoverPanel } from './CoordinatorTakeoverPanel';
import { en } from './locale/en-GB';

// Exercise the component's polling and mutation effects without a browser.
const hooks = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effects: [] as Array<{
    deps: unknown[];
    cleanup?: () => void;
  }>,
  pending: [] as Array<() => void>,
  effectCursor: 0,
}));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = initial;
    return [
      hooks.slots[index],
      (value: unknown) => {
        hooks.slots[index] = value;
      },
    ];
  },
  useRef(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
  useEffect(effect: () => (() => void) | void, deps: unknown[]) {
    const index = hooks.effectCursor++;
    const previous = hooks.effects[index];
    if (
      previous &&
      deps.every((dep, position) => Object.is(dep, previous.deps[position]))
    )
      return;
    previous?.cleanup?.();
    hooks.effects[index] = { deps };
    hooks.pending.push(() => {
      hooks.effects[index].cleanup = effect() || undefined;
    });
  },
}));

const selected = {
  eligible: true,
  mode: 'co-coordinator',
  canRequest: false,
  canVote: false,
  canClaim: true,
  request: null,
};
const request = {
  id: 'request-1',
  requesterName: 'Alex',
  status: 'approved',
  yesVotes: 3,
  noVotes: 0,
  requiredVotes: 3,
  expiresAt: 1_900_000_000_000,
  viewerVote: true,
};
let props: Parameters<typeof CoordinatorTakeoverPanel>[0];
let fetchMock: ReturnType<typeof vi.fn>;
let serverStatus: object;
let claimResponse: () => Promise<Response>;
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });

function render() {
  hooks.cursor = 0;
  hooks.effectCursor = 0;
  const panel = CoordinatorTakeoverPanel(props);
  hooks.pending.splice(0).forEach((effect) => effect());
  return renderToStaticMarkup(panel);
}

async function settle() {
  for (let index = 0; index < 20; index++) await Promise.resolve();
  return render();
}

function claims() {
  return fetchMock.mock.calls.filter(([path]) =>
    String(path).endsWith('/takeover/claim'),
  );
}

function clickButton(label: string) {
  hooks.cursor = 0;
  hooks.effectCursor = 0;
  const panel = CoordinatorTakeoverPanel(props);
  function visit(node: unknown): boolean {
    if (!node || typeof node !== 'object') return false;
    if (Array.isArray(node)) return node.some(visit);
    const element = node as {
      type?: string;
      props?: { children?: unknown; onClick?: () => void };
    };
    if (element.type === 'button' && element.props?.children === label) {
      element.props.onClick?.();
      return true;
    }
    return visit(element.props?.children);
  }
  expect(visit(panel)).toBe(true);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  hooks.slots = [];
  hooks.effects = [];
  hooks.pending = [];
  props = {
    gameId: 'game-1',
    csrfToken: 'csrf-token',
    hidden: false,
    onTransferred: vi.fn(),
  };
  serverStatus = selected;
  claimResponse = async () => json({ status: 'transferred' });
  fetchMock = vi.fn(async (path: string) =>
    path.endsWith('/claim') ? claimResponse() : json(serverStatus),
  );
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('window', {
    setInterval,
    clearInterval,
  });
});

afterEach(() => {
  hooks.effects.forEach((effect) => effect.cleanup?.());
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('automatic organiser handover client', () => {
  it('claims the server-selected recipient without a button or role input', async () => {
    render();
    await settle();
    expect(claims()).toHaveLength(1);
    expect(claims()[0][1]).toMatchObject({
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRF-Token': 'csrf-token' },
    });
    expect(claims()[0][1].body).toBeUndefined();
    expect(props.onTransferred).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(45_000);
    await settle();
    expect(claims()).toHaveLength(1);
    expect(props.onTransferred).toHaveBeenCalledOnce();
  });

  it.each([
    { ...selected, eligible: false, mode: null, canClaim: false },
    { ...selected, canClaim: false },
    { ...selected, mode: 'majority', request },
    { ...selected, request },
  ])(
    'does not automatically claim other/manual statuses: %j',
    async (status) => {
      serverStatus = status;
      render();
      await settle();
      await vi.advanceTimersByTimeAsync(30_000);
      await settle();
      expect(claims()).toHaveLength(0);
      expect(props.onTransferred).not.toHaveBeenCalled();
    },
  );

  it('preserves the explicit approved-majority claim button', async () => {
    serverStatus = { ...selected, mode: 'majority', request };
    render();
    const html = await settle();
    expect(html).toContain('Take over');
    expect(claims()).toHaveLength(0);
    clickButton(en.coordinator.takeoverClaim);
    await settle();
    expect(claims()).toHaveLength(1);
    expect(claims()[0][1].body).toBe(JSON.stringify({ requestId: request.id }));
  });

  it('preserves manual majority requesting and approval', async () => {
    serverStatus = {
      ...selected,
      mode: 'majority',
      canRequest: true,
      canClaim: false,
    };
    render();
    await settle();
    clickButton(en.coordinator.takeoverRequest);
    await settle();
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === 'POST'),
    ).toBe(true);
    expect(claims()).toHaveLength(0);
    serverStatus = {
      ...selected,
      mode: 'majority',
      canClaim: false,
      canVote: true,
      request: { ...request, status: 'pending', viewerVote: null },
    };
    await vi.advanceTimersByTimeAsync(15_000);
    await settle();
    clickButton('Approve');
    await settle();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/takeover/vote'),
      expect.objectContaining({
        body: JSON.stringify({ requestId: request.id, approve: true }),
      }),
    );
    expect(claims()).toHaveLength(0);
  });

  it('waits for CSRF and a fresh status when leaving a private screen', async () => {
    props.hidden = true;
    render();
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    props.hidden = false;
    props.csrfToken = null;
    render();
    await settle();
    expect(claims()).toHaveLength(0);
    props.csrfToken = 'csrf-token';
    render();
    await settle();
    expect(claims()).toHaveLength(1);
  });

  it('does not claim a status response that arrives after hiding', async () => {
    let resolve!: (value: Response) => void;
    fetchMock.mockImplementationOnce(
      () => new Promise<Response>((done) => (resolve = done)),
    );
    render();
    props.hidden = true;
    render();
    resolve(json(selected));
    await settle();
    expect(claims()).toHaveLength(0);
  });

  it.each(['Faithful', 'Traitor'])(
    'uses identical role-neutral claim input even if an unknown %s field is returned',
    async (role) => {
      serverStatus = { ...selected, role };
      render();
      const html = await settle();
      expect(claims()).toHaveLength(1);
      expect(claims()[0][1].body).toBeUndefined();
      expect(html).not.toContain(role);
      expect(
        fetchMock.mock.calls.every(
          ([path]) =>
            String(path).endsWith('/takeover') ||
            String(path).endsWith('/takeover/claim'),
        ),
      ).toBe(true);
    },
  );

  it('does not reuse a revoked automatic selection on retry', async () => {
    claimResponse = async () => json({ error: 'No longer selected' }, 409);
    render();
    await settle();
    serverStatus = {
      ...selected,
      eligible: false,
      mode: null,
      canClaim: false,
    };
    await vi.advanceTimersByTimeAsync(15_000);
    await settle();
    expect(claims()).toHaveLength(1);
    expect(props.onTransferred).not.toHaveBeenCalled();
  });

  it('does not notify after unmount', async () => {
    let resolve!: (value: Response) => void;
    claimResponse = () => new Promise<Response>((done) => (resolve = done));
    render();
    await settle();
    hooks.effects.forEach((effect) => effect.cleanup?.());
    resolve(json({ status: 'transferred' }));
    await settle();
    expect(props.onTransferred).not.toHaveBeenCalled();
  });

  it('does not transfer a different game when an old claim completes', async () => {
    let resolve!: (value: Response) => void;
    claimResponse = () => new Promise<Response>((done) => (resolve = done));
    render();
    await settle();
    props.gameId = 'game-2';
    serverStatus = {
      ...selected,
      eligible: false,
      canClaim: false,
      mode: null,
    };
    render();
    resolve(json({ status: 'transferred' }));
    await settle();
    expect(props.onTransferred).not.toHaveBeenCalled();
    expect(claims()).toHaveLength(1);
  });

  it('retries invalid success responses at poll cadence, not in an effect loop', async () => {
    claimResponse = async () => json({ status: 'unexpected' });
    render();
    const html = await settle();
    expect(html).toContain('role="alert"');
    expect(props.onTransferred).not.toHaveBeenCalled();
    expect(claims()).toHaveLength(1);
    await settle();
    expect(claims()).toHaveLength(1);
  });

  it('retries a failed claim only on the next status poll', async () => {
    claimResponse = async () => json({ error: 'Unavailable' }, 503);
    render();
    const html = await settle();
    expect(claims()).toHaveLength(1);
    expect(html).toContain('role="alert"');
    for (let index = 0; index < 5; index++) await settle();
    expect(claims()).toHaveLength(1);
    claimResponse = async () => json({ status: 'transferred' });
    await vi.advanceTimersByTimeAsync(15_000);
    await settle();
    expect(claims()).toHaveLength(2);
    expect(props.onTransferred).toHaveBeenCalledOnce();
  });

  it('honours Retry-After before polling takeover status again', async () => {
    serverStatus = { ...selected, canClaim: false };
    let rateLimited = true;
    fetchMock.mockImplementation(async (path: string) =>
      path.endsWith('/claim')
        ? claimResponse()
        : rateLimited
          ? new Response(JSON.stringify({ error: 'Unavailable' }), {
              status: 429,
              headers: { 'Retry-After': '60' },
            })
          : json(serverStatus),
    );

    render();
    await settle();
    const statusPolls = () =>
      fetchMock.mock.calls.filter(([path]) =>
        String(path).endsWith('/takeover'),
      ).length;
    expect(statusPolls()).toBe(1);

    rateLimited = false;
    await vi.advanceTimersByTimeAsync(62_499);
    await settle();
    expect(statusPolls()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(statusPolls()).toBe(2);
  });

  it('backs off an automatic claim retry after a 429 Retry-After response', async () => {
    let rateLimited = true;
    claimResponse = async () =>
      rateLimited
        ? new Response(JSON.stringify({ error: 'Unavailable' }), {
            status: 429,
            headers: { 'Retry-After': '60' },
          })
        : json({ status: 'transferred' });

    render();
    await settle();
    expect(claims()).toHaveLength(1);
    expect(props.onTransferred).not.toHaveBeenCalled();

    rateLimited = false;
    await vi.advanceTimersByTimeAsync(62_499);
    await settle();
    expect(claims()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(claims()).toHaveLength(2);
    expect(props.onTransferred).toHaveBeenCalledOnce();
  });

  it('does not overlap claims on repeated effects and defers navigation while hidden', async () => {
    let resolve!: (value: Response) => void;
    claimResponse = () => new Promise<Response>((done) => (resolve = done));
    render();
    await settle();
    props.onTransferred = vi.fn();
    props.hidden = true;
    render();
    props.hidden = false;
    render();
    await settle();
    expect(claims()).toHaveLength(1);
    props.hidden = true;
    render();
    resolve(json({ status: 'transferred' }));
    await settle();
    expect(props.onTransferred).not.toHaveBeenCalled();
    props.hidden = false;
    render();
    await settle();
    expect(props.onTransferred).toHaveBeenCalledOnce();
    expect(claims()).toHaveLength(1);
  });
});
