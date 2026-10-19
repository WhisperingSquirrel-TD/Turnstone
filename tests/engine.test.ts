import { describe, expect, it } from 'vitest';
import {
  decide,
  evolve,
  replay,
  replayFrom,
  viewFor,
  commitment,
} from '../lib/engine/src/index';
import { gameConfigSchema } from '../lib/shared/src/index';
import { fixture, command, advance } from './support/engine';

describe('Milestone 1 deterministic engine', () => {
  it('binds the secret sleeper selection into the published deal commitment', () => {
    const roles = { a: 'traitor', b: 'faithful', c: 'faithful' } as const;
    expect(commitment('g', roles, 'salt', 'b')).not.toBe(
      commitment('g', roles, 'salt', 'c'),
    );
  });
  it('announces schedule extensions in every public game view', () => {
    const game = fixture(5);
    command(game, { type: 'StartGame' });
    command(game, { type: 'ExtendPhase', minutes: 5 }, true, {
      kind: 'coordinator',
    });
    const extension = game.events.find(
      (event) => event.type === 'DeadlineExtended',
    );
    expect(extension).toBeDefined();
    if (extension?.type !== 'DeadlineExtended')
      throw new Error('The schedule extension event is missing.');
    const expected = {
      seq: extension.seq,
      at: extension.at,
      action: 'schedule_shift',
      minutes: 5,
    };

    expect(viewFor({ kind: 'presenter' }, game.state).publicLog).toContainEqual(
      expected,
    );
    expect(
      viewFor({ kind: 'player', seatId: game.state.seats[0]!.id }, game.state)
        .publicLog,
    ).toContainEqual(expected);
  });
  it('has validated owner defaults and rejects removed/Could/unsafe settings', () => {
    const config = gameConfigSchema.parse({});
    expect(config.basics.labels).toEqual({
      traitor: 'Traitor',
      faithful: 'Faithful',
    });
    expect(config.tasks.enabled).toBe(false);
    expect(config.players.lateRole).toBe('faithful');
    expect(() => gameConfigSchema.parse({ players: { count: 4 } })).toThrow();
    expect(() =>
      gameConfigSchema.parse({ players: { lateRole: 'reserve' } }),
    ).toThrow();
    expect(() =>
      gameConfigSchema.parse({
        missions: { shields: 'secret', allocation: 'coordinator' },
      }),
    ).toThrow();
    expect(() =>
      gameConfigSchema.parse({ missions: { seer: true } }),
    ).toThrow();
    expect(() =>
      gameConfigSchema.parse({ basics: { unexpected: 'secret' } }),
    ).toThrow();
  });
  it('keeps rehearsal phases player-paced regardless of the selected speed', () => {
    const botSeatIds = Array.from({ length: 4 }, (_, index) => `bot-${index}`);
    const normalConfig = gameConfigSchema.parse({
      players: { count: 5 },
      rehearsal: { enabled: true, botSeatIds },
    });
    expect(normalConfig.rehearsal.speed).toBe('normal');

    const fast = fixture(5, {
      privacy: { holdMs: 500, shieldSeconds: 3 },
      rehearsal: { enabled: true, botSeatIds, speed: 'fast' },
    });
    command(fast, { type: 'StartGame' });
    expect(fast.state.phase).toBe('DEAL');
    expect(fast.state.deadline).toBeNull();

    advance(fast, 'SHADOW');
    expect(fast.state.deadline).toBeNull();
    expect(fast.state.shadowEndAt).toBeNull();
    fast.context.now =
      fast.state.phaseStarted +
      fast.state.config.privacy.shieldSeconds * 1_000 +
      fast.state.config.privacy.holdMs +
      1;
    command(fast, { type: 'AdvancePhase' });
    expect(fast.state.phase).toBe('SHADOW');
    expect(fast.state.shadowRound).toBe(2);
    expect(fast.state.deadline).toBeNull();

    const longerShield = fixture(5, {
      privacy: { holdMs: 1_000, shieldSeconds: 10 },
      rehearsal: { enabled: true, botSeatIds, speed: 'fast' },
    });
    command(longerShield, { type: 'StartGame' });
    expect(longerShield.state.deadline).toBeNull();
    advance(longerShield, 'SHADOW');
    expect(longerShield.state.deadline).toBeNull();
    expect(longerShield.state.shadowEndAt).toBeNull();
  });
  it('deals the exact configured number, publishes only the commitment and replays exactly', () => {
    const game = fixture(15);
    command(game, { type: 'StartGame' });
    expect(game.state.phase).toBe('DEAL');
    expect(game.state.seats.filter((s) => s.role === 'traitor')).toHaveLength(
      3,
    );
    expect(game.state.seats.every((s) => s.role !== null)).toBe(true);
    expect(game.state.deal?.commitment).toMatch(/^[a-f0-9]{64}$/);
    expect(replay(game.events)).toEqual(game.state);
    expect(viewFor({ kind: 'presenter' }, game.state).private).toBeNull();
    expect(
      JSON.stringify(viewFor({ kind: 'admin', reveal: true }, game.state)),
    ).not.toContain(game.state.deal?.salt);
  });
  it('is immutable and validates the command/version/actor at its boundary', () => {
    const game = fixture(5);
    const before = JSON.stringify(game.state);
    const result = decide(
      game.state,
      { type: 'StartGame', idempotencyKey: 'x', expectedVersion: 0 },
      game.context,
    );
    expect(result).toMatchObject({ ok: false, code: 'STALE_VERSION' });
    expect(JSON.stringify(game.state)).toBe(before);
    expect(
      decide(
        game.state,
        {
          type: 'StartGame',
          idempotencyKey: 'x',
          expectedVersion: game.state.version,
        },
        { ...game.context, actor: { kind: 'player', seatId: 's0' } },
      ),
    ).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(
      decide(
        game.state,
        { type: 'StartGame', idempotencyKey: 'x', extra: 1 },
        game.context,
      ),
    ).toMatchObject({ ok: false, code: 'INVALID_COMMAND' });
    expect(() => evolve(game.state, { ...game.events[0], seq: 999 })).toThrow();
  });
  it('shares unchanged event-state branches without mutating the prior state', () => {
    const game = fixture(5);
    const previous = game.state;
    const result = decide(
      previous,
      {
        type: 'StartGame',
        idempotencyKey: 'deal',
        expectedVersion: previous.version,
      },
      game.context,
    );
    if (!result.ok) throw new Error(result.code);

    const next = evolve(previous, result.events[0]!);

    expect(next.config).toBe(previous.config);
    expect(previous.seats.every((seat) => seat.role === null)).toBe(true);
    expect(next.seats).not.toBe(previous.seats);
  });
  it('blocks fewer than five seats, duplicates and excess seats', () => {
    const game = fixture(5, {}, 4);
    expect(command(game, { type: 'StartGame' }, false)).toMatchObject({
      ok: false,
      code: 'TOO_FEW_PLAYERS',
    });
    expect(
      command(
        game,
        { type: 'JoinGame', seatId: 'other', name: 'Player 0' },
        false,
        { kind: 'player', seatId: 'other' },
      ),
    ).toMatchObject({ ok: false, code: 'DUPLICATE_NAME' });
  });
  it('normalizes duplicate names and reserves rehearsal bot names', () => {
    const game = fixture(5, {}, 4);
    for (const name of [' PLAYER 0 ', 'Player  0', 'Ｐｌａｙｅｒ 0']) {
      expect(
        command(
          game,
          { type: 'JoinGame', seatId: `duplicate-${name}`, name },
          false,
          { kind: 'player', seatId: `duplicate-${name}` },
        ),
      ).toMatchObject({ ok: false, code: 'DUPLICATE_NAME' });
    }
    expect(
      command(
        game,
        {
          type: 'JoinGame',
          seatId: 'reserved-bot-name',
          name: 'Ｐｒａｃｔｉｃｅ　player　1',
        },
        false,
        { kind: 'player', seatId: 'reserved-bot-name' },
      ),
    ).toMatchObject({ ok: false, code: 'RESERVED_NAME' });
  });
  it('allows reserved names for configured rehearsal bot seats', () => {
    const game = fixture(
      5,
      {
        rehearsal: {
          enabled: true,
          botSeatIds: ['configured-bot', 'bot-2', 'bot-3', 'bot-4'],
        },
      },
      0,
    );
    expect(
      command(
        game,
        {
          type: 'JoinGame',
          seatId: 'configured-bot',
          name: 'Practice player 1',
        },
        false,
        { kind: 'player', seatId: 'configured-bot' },
      ),
    ).toMatchObject({ ok: true });
  });
  it('acknowledges the deal and permits one anonymously announced redeal before shadow', () => {
    const game = fixture(5);
    command(game, { type: 'StartGame' });
    const first = game.state.deal?.commitment;
    command(game, { type: 'AcknowledgePrivate' }, true, {
      kind: 'player',
      seatId: 's0',
    });
    command(game, { type: 'RequestRedeal' }, true, {
      kind: 'player',
      seatId: 's0',
    });
    expect(game.state.deal?.commitment).not.toBe(first);
    expect(game.state.acks).toEqual([]);
    expect(
      command(game, { type: 'RequestRedeal' }, false, {
        kind: 'player',
        seatId: 's1',
      }),
    ).toMatchObject({ ok: false, code: 'REDEAL_UNAVAILABLE' });
  });
  it('hides secrets outside reveal and projects only legitimate team knowledge', () => {
    const game = fixture(15);
    command(game, { type: 'StartGame' });
    const traitor = game.state.seats.find((s) => s.role === 'traitor')!;
    const faithful = game.state.seats.find((s) => s.role === 'faithful')!;
    expect(
      viewFor({ kind: 'player', seatId: faithful.id }, game.state).private,
    ).toBeNull();
    const f = viewFor(
      { kind: 'player', seatId: faithful.id, reveal: true },
      game.state,
    );
    const t = viewFor(
      { kind: 'player', seatId: traitor.id, reveal: true },
      game.state,
    );
    expect(f.private?.team).toEqual([]);
    expect(t.private?.team).toHaveLength(3);
    expect(t.private?.options).toHaveLength(f.private?.options.length ?? 0);
    expect(t.private?.minimumDurationMs).toBe(f.private?.minimumDurationMs);
    expect(
      viewFor(
        { kind: 'coordinator', seatId: traitor.id, reveal: true },
        game.state,
      ).private,
    ).toBeNull();
    expect(
      viewFor({ kind: 'host', reveal: true }, game.state).private,
    ).toBeNull();
  });
  it('identifies a living player only in that seat’s own view', () => {
    const game = fixture(5);
    command(game, { type: 'StartGame' });
    const own = game.state.seats[0]!;
    expect(
      viewFor({ kind: 'player', seatId: own.id }, game.state).viewerSeatId,
    ).toBe(own.id);
    command(game, { type: 'MarkDeparted', seatId: own.id });
    expect(
      viewFor({ kind: 'ghost', seatId: own.id }, game.state).viewerSeatId,
    ).toBe(own.id);
    expect(viewFor({ kind: 'coordinator' }, game.state)).not.toHaveProperty(
      'viewerSeatId',
    );
    expect(viewFor({ kind: 'presenter' }, game.state)).not.toHaveProperty(
      'viewerSeatId',
    );
    expect(viewFor({ kind: 'visitor' }, game.state)).not.toHaveProperty(
      'viewerSeatId',
    );
  });
  it('exposes move-on permission only to the human seat in a rehearsal', () => {
    const game = fixture(6, {
      rehearsal: {
        enabled: true,
        botSeatIds: ['s1', 's2', 's3', 's4', 's5'],
      },
    });
    command(game, { type: 'StartGame' });

    expect(
      viewFor({ kind: 'player', seatId: 's0' }, game.state).canAdvancePhase,
    ).toBe(true);
    expect(
      viewFor({ kind: 'player', seatId: 's1' }, game.state).canAdvancePhase,
    ).toBe(false);
    expect(viewFor({ kind: 'coordinator' }, game.state).canAdvancePhase).toBe(
      false,
    );
    expect(viewFor({ kind: 'visitor' }, game.state)).not.toHaveProperty(
      'canAdvancePhase',
    );
  });
  it('keeps the human rehearsal organiser able to move on as a ghost', () => {
    const game = fixture(6, {
      rehearsal: {
        enabled: true,
        botSeatIds: ['s1', 's2', 's3', 's4', 's5'],
      },
    });
    command(game, { type: 'StartGame' });
    game.state.seats[0]!.status = 'banished';

    expect(
      viewFor({ kind: 'ghost', seatId: 's0' }, game.state).canAdvancePhase,
    ).toBe(true);
  });
  it('supports announced all-seeing hosts but never unfinished admin secrets', () => {
    const game = fixture(5, { basics: { coordinatorPlays: false } });
    command(game, { type: 'StartGame' });
    expect(
      viewFor({ kind: 'host', reveal: true }, game.state).private?.team,
    ).toHaveLength(5);
    expect(
      viewFor({ kind: 'admin', reveal: true }, game.state).private,
    ).toBeNull();
  });
  it('rejects self-votes and out seats; latest vote wins; unrevealed ballots stay secret', () => {
    const game = fixture(15);
    command(game, { type: 'StartGame' });
    advance(game, 'VOTE');
    expect(
      command(game, { type: 'SubmitVote', target: 's0' }, false, {
        kind: 'player',
        seatId: 's0',
      }),
    ).toMatchObject({ ok: false, code: 'INVALID_TARGET' });
    command(game, { type: 'SubmitVote', target: 's1' }, true, {
      kind: 'player',
      seatId: 's0',
    });
    command(game, { type: 'SubmitVote', target: 's2' }, true, {
      kind: 'player',
      seatId: 's0',
    });
    expect(game.state.votes.s0).toBe('s2');
    expect(viewFor({ kind: 'presenter' }, game.state).ballots).toEqual({});
    advance(game, 'VERDICT');
    expect(viewFor({ kind: 'presenter' }, game.state).ballots).toEqual({});
    command(game, { type: 'AdvancePhase' });
    expect(viewFor({ kind: 'presenter' }, game.state).ballots).toEqual({
      s0: 's2',
    });
  });
  it('counts submitted votes without exposing ballot targets', () => {
    const game = fixture(6);
    command(game, { type: 'StartGame' });
    advance(game, 'VOTE');
    const target = game.state.seats[5]!.id;
    for (const seat of game.state.seats.slice(0, 4))
      command(game, { type: 'SubmitVote', target }, true, {
        kind: 'player',
        seatId: seat.id,
      });

    const view = viewFor({ kind: 'presenter' }, game.state);
    expect(view.progress).toEqual({ done: 4, total: 6 });
    expect(view.ballots).toEqual({});
  });
  it('publishes anonymous tallies without publishing voter identifiers', () => {
    const game = fixture(15, {
      roundTable: { revealStyle: 'anonymous' },
    });
    command(game, { type: 'StartGame' });
    advance(game, 'VOTE');

    command(game, { type: 'SubmitVote', target: 's1' }, true, {
      kind: 'player',
      seatId: 's0',
    });
    advance(game, 'VERDICT');

    command(game, { type: 'AdvancePhase' });
    const voters = new Set(game.state.seats.map((seat) => seat.id));
    const viewers = [
      ...game.state.seats.map((seat) => ({
        kind: 'player' as const,
        seatId: seat.id,
      })),
      { kind: 'coordinator' as const },
      { kind: 'presenter' as const },
      { kind: 'admin' as const },
      { kind: 'host' as const, reveal: true },
      { kind: 'ghost' as const, seatId: 's0' },
    ];

    expect(game.state.votes).toEqual({ s0: 's1' });
    expect(game.state.revealed).toContain('s0');
    for (const view of viewers) {
      const projected = viewFor(view, game.state);
      expect(projected.ballots).toEqual({ 'anonymous-vote-1': 's1' });
      expect(
        Object.keys(projected.ballots).some((key) => voters.has(key)),
      ).toBe(false);
    }
  });
  it('requires the shield acknowledgement during private voting', () => {
    const game = fixture(15);
    command(game, { type: 'StartGame' });
    advance(game, 'VOTE');
    const player = game.state.seats.find((seat) => seat.status === 'alive')!;
    expect(
      command(game, { type: 'AcknowledgePrivate' }, true, {
        kind: 'player',
        seatId: player.id,
      }),
    ).toMatchObject({ ok: true });
    expect(game.state.acks).toContain(player.id);
  });
  it('replays new shadow choices from legacy snapshots without shadowPicks', () => {
    const game = fixture(15);
    command(game, { type: 'StartGame' });
    advance(game, 'SHADOW');
    const traitor = game.state.seats.find((seat) => seat.role === 'traitor')!;
    const target = game.state.seats.find((seat) => seat.role === 'faithful')!;
    const legacySnapshot = structuredClone(game.state);
    Reflect.deleteProperty(legacySnapshot, 'shadowPicks');

    const eventIndex = game.events.length;
    command(game, { type: 'SubmitShadowChoice', choice: target.id }, true, {
      kind: 'player',
      seatId: traitor.id,
    });
    const choiceEvent = game.events[eventIndex];
    if (!choiceEvent) throw new Error('The shadow choice event is missing.');

    const replayed = replayFrom(legacySnapshot, [choiceEvent]);

    expect(replayed.shadowPicks).toContainEqual({
      cycle: legacySnapshot.cycle,
      slot: 1,
      round: 1,
      seatId: traitor.id,
      choice: target.id,
      seq: choiceEvent.seq,
    });
  });
  it('uses the same shadow command shape for decoys and murders, rejects friendly fire and protection', () => {
    const game = fixture(15, {
      missions: {
        enabled: false,
        shields: 'public',
        allocation: 'coordinator',
      },
    });
    command(game, { type: 'StartGame' });
    advance(game, 'SHADOW');
    const t = game.state.seats.filter((s) => s.role === 'traitor');
    const f = game.state.seats.find((s) => s.role === 'faithful')!;
    expect(
      command(game, { type: 'SubmitShadowChoice', choice: t[1]!.id }, false, {
        kind: 'player',
        seatId: t[0]!.id,
      }),
    ).toMatchObject({ ok: false, code: 'INVALID_TARGET' });
    command(game, { type: 'SubmitShadowChoice', choice: f.id }, true, {
      kind: 'player',
      seatId: t[0]!.id,
    });
    command(game, { type: 'SubmitShadowChoice', choice: t[0]!.id }, true, {
      kind: 'player',
      seatId: f.id,
    });
    expect(game.state.shadow[f.id]).toBe(t[0]!.id);
    expect(
      viewFor({ kind: 'player', seatId: f.id, reveal: true }, game.state)
        .private?.choices,
    ).toEqual({});
    command(game, { type: 'AllocatePower', holders: [f.id] });
    advance(game, 'DAWN');
    expect(game.state.seats.find((s) => s.id === f.id)?.status).toBe('alive');
    expect(game.state.shields).toEqual([]);
  });
  it('uses two hidden shadow choice windows for every role and resolves a split unanimous re-vote via timeout rule', () => {
    const game = fixture(15, {
      missions: { enabled: false, shields: 'off' },
      schedule: { format: 'quick' },
      traitors: {
        number: 3,
        sleeper: false,
        recruitment: 'off',
        victimDecision: 'unanimous',
        timeoutChoice: 'leading',
      },
    });
    command(game, { type: 'StartGame' });
    advance(game, 'VOTE');
    const initialFaithful = game.state.seats.filter(
      (seat) => seat.role === 'faithful',
    );
    const voteTarget = initialFaithful[11]!;
    const alternate = initialFaithful[10]!;
    for (const seat of game.state.seats.filter(
      (candidate) => candidate.status === 'alive',
    ))
      command(
        game,
        {
          type: 'SubmitVote',
          target: seat.id === voteTarget.id ? alternate.id : voteTarget.id,
        },
        true,
        { kind: 'player', seatId: seat.id },
      );
    advance(game, 'SHADOW');
    expect(
      game.events.filter((event) => event.type === 'VoteClosed').at(-1),
    ).toMatchObject({ target: voteTarget.id });
    const shadowStarted = game.state.phaseStarted;
    const midpoint = game.state.deadline!;
    const shadowEnd = shadowStarted + 120_000;
    const traitors = game.state.seats.filter(
      (seat) => seat.role === 'traitor' && seat.status === 'alive',
    );
    const faithful = game.state.seats.filter(
      (seat) => seat.role === 'faithful' && seat.status === 'alive',
    );
    const firstTraitor = traitors[0]!;
    const secondTraitor = traitors[1]!;
    const firstTarget = faithful[0]!;
    const secondTarget = faithful[1]!;

    expect(traitors.length).toBeGreaterThanOrEqual(2);
    expect(midpoint).toBe(shadowStarted + 60_000);
    command(
      game,
      { type: 'SubmitShadowChoice', choice: firstTarget.id },
      true,
      { kind: 'player', seatId: firstTraitor.id },
    );
    command(
      game,
      { type: 'SubmitShadowChoice', choice: secondTarget.id },
      true,
      { kind: 'player', seatId: secondTraitor.id },
    );
    expect(
      viewFor(
        { kind: 'player', seatId: firstTraitor.id, reveal: true },
        game.state,
      ).private?.choices,
    ).toEqual({
      [firstTraitor.id]: firstTarget.id,
      [secondTraitor.id]: secondTarget.id,
    });
    const faithfulView = viewFor(
      { kind: 'player', seatId: faithful[2]!.id, reveal: true },
      game.state,
    );
    expect(faithfulView.deadline).toBe(shadowEnd);
    expect(faithfulView.private?.choices).toEqual({});
    expect(
      viewFor({ kind: 'player', seatId: firstTraitor.id }, game.state),
    ).toHaveProperty('shadowRound', 1);
    expect(viewFor({ kind: 'visitor' }, game.state)).not.toHaveProperty(
      'shadowRound',
    );

    game.context.now = midpoint + 1;
    command(game, { type: 'AdvancePhase' });
    expect(game.state.phase).toBe('SHADOW');
    expect(game.state.shadowRound).toBe(2);
    expect(game.state.deadline).toBe(shadowEnd);
    expect(game.state.shadow).toEqual({});
    expect(
      viewFor({ kind: 'player', seatId: firstTraitor.id }, game.state),
    ).toHaveProperty('shadowRound', 2);

    command(
      game,
      { type: 'SubmitShadowChoice', choice: firstTarget.id },
      true,
      { kind: 'player', seatId: firstTraitor.id },
    );
    command(
      game,
      { type: 'SubmitShadowChoice', choice: secondTarget.id },
      true,
      { kind: 'player', seatId: secondTraitor.id },
    );
    game.context.now =
      shadowStarted +
      game.state.config.privacy.shieldSeconds * 1000 +
      game.state.config.privacy.holdMs +
      1;
    expect(command(game, { type: 'AdvancePhase' }, false)).toMatchObject({
      ok: false,
      code: 'SHADOW_WINDOW_NOT_DUE',
    });
    game.context.now = shadowEnd + 1;
    command(game, { type: 'AdvancePhase' });

    const dawnEvent = game.events.find(
      (event) => event.type === 'DawnResolved',
    );
    expect(dawnEvent).toMatchObject({ victims: expect.any(Array) });
    if (dawnEvent?.type !== 'DawnResolved')
      throw new Error('The shadow step did not produce a dawn event.');
    expect(
      viewFor({ kind: 'presenter' }, game.state).publicLog.find(
        (entry) => entry.action === 'dawn',
      ),
    ).toEqual({
      seq: dawnEvent.seq,
      at: dawnEvent.at,
      action: 'dawn',
      victims: dawnEvent.victims.map((id) => ({
        id,
        name: game.state.seats.find((seat) => seat.id === id)!.name,
      })),
    });
    expect(
      game.events.find(
        (event) =>
          event.type === 'RandomChoiceRecorded' &&
          event.purpose === 'murder-target',
      ),
    ).toMatchObject({
      candidates: [firstTarget.id, secondTarget.id].sort(),
    });
    expect(
      game.events.filter((event) => event.type === 'ShadowRoundAdvanced'),
    ).toHaveLength(1);
  });
  it('does not invent a second murder when no additional Traitor pick exists', () => {
    const game = fixture(5, {
      missions: { enabled: false, shields: 'off' },
      traitors: {
        number: 1,
        sleeper: false,
        recruitment: 'off',
        murders: 2,
        victimDecision: 'majority',
        timeoutChoice: 'none',
      },
    });
    command(game, { type: 'StartGame' });
    advance(game, 'SHADOW');

    const traitor = game.state.seats.find((seat) => seat.role === 'traitor')!;
    const target = game.state.seats.find((seat) => seat.role === 'faithful')!;
    command(game, { type: 'SubmitShadowChoice', choice: target.id }, true, {
      kind: 'player',
      seatId: traitor.id,
    });
    game.context.now = game.state.deadline! + 1;
    command(game, { type: 'AdvancePhase' });
    command(game, { type: 'SubmitShadowChoice', choice: target.id }, true, {
      kind: 'player',
      seatId: traitor.id,
    });
    game.context.now = game.state.deadline! + 1;
    command(game, { type: 'AdvancePhase' });
    expect(game.state).toHaveProperty('shadowSlot', 2);
    game.context.now = game.state.deadline! + 1;
    command(game, { type: 'AdvancePhase' });
    game.context.now = game.state.deadline! + 1;
    command(game, { type: 'AdvancePhase' });
    expect(
      game.events.find((event) => event.type === 'DawnResolved'),
    ).toMatchObject({ victims: [target.id] });
    expect(
      game.events.filter(
        (event) =>
          event.type === 'RandomChoiceRecorded' &&
          event.purpose === 'murder-target',
      ),
    ).toHaveLength(1);
  });
  it('skips the second murder slot when the first murder ends the game', () => {
    const game = fixture(5, {
      missions: { enabled: false, shields: 'off' },
      traitors: {
        number: 2,
        sleeper: false,
        recruitment: 'off',
        murders: 2,
        victimDecision: 'first',
        timeoutChoice: 'none',
      },
      endgame: { size: 3, parity: true },
    });
    command(game, { type: 'StartGame' });
    advance(game, 'SHADOW');

    const traitors = game.state.seats.filter(
      (seat) => seat.status === 'alive' && seat.role === 'traitor',
    );
    const target = game.state.seats.find(
      (seat) => seat.status === 'alive' && seat.role === 'faithful',
    )!;
    const submitFirstSlot = () => {
      for (const traitor of traitors)
        command(
          game,
          {
            type: 'SubmitShadowChoice',
            slot: 1,
            choice: target.id,
          },
          true,
          { kind: 'player', seatId: traitor.id },
        );
    };
    const finishPrivateWindow = () => {
      game.context.now = game.state.deadline! + 1;
      command(game, { type: 'AdvancePhase' });
    };

    submitFirstSlot();
    finishPrivateWindow();
    submitFirstSlot();
    finishPrivateWindow();

    const resolutions = game.events.filter(
      (event) => event.type === 'MurderSlotResolved',
    );
    expect(resolutions).toMatchObject([
      { slot: 1, chosen: target.id, outcome: 'murdered' },
      { slot: 2, picks: [], chosen: null, outcome: 'game-ended' },
    ]);
    expect(
      game.events.filter((event) => event.type === 'ShadowSlotAdvanced'),
    ).toHaveLength(0);
    expect(
      game.events.find((event) => event.type === 'DawnResolved'),
    ).toMatchObject({ victims: [target.id] });
    expect(game.state.phase).toBe('FINISHED');
  });
  it('stores Faithful night predictions by cycle and exposes each only to its owner', () => {
    const game = fixture(6);
    command(game, { type: 'StartGame' });
    advance(game, 'SHADOW');

    const traitor = game.state.seats.find(
      (seat) => seat.status === 'alive' && seat.role === 'traitor',
    )!;
    const faithful = game.state.seats.filter(
      (seat) => seat.status === 'alive' && seat.role === 'faithful',
    );
    const faithfulOwner = faithful[0]!;
    const otherFaithful = faithful[1]!;
    const faithfulTarget = faithful[2]!;
    const traitorTarget = faithful[3]!;

    command(
      game,
      { type: 'SubmitShadowChoice', choice: faithfulTarget.id },
      true,
      { kind: 'player', seatId: faithfulOwner.id },
    );
    command(
      game,
      { type: 'SubmitShadowChoice', choice: traitorTarget.id },
      true,
      { kind: 'player', seatId: traitor.id },
    );

    expect(game.state.shadowPicks).toContainEqual(
      expect.objectContaining({
        cycle: 1,
        slot: 1,
        round: 1,
        seatId: faithfulOwner.id,
        choice: faithfulTarget.id,
      }),
    );

    const faithfulView = viewFor(
      { kind: 'player', seatId: faithfulOwner.id, reveal: true },
      game.state,
    );
    expect(faithfulView.private?.choiceSlots).toContainEqual({
      slot: 1,
      round: 1,
      picks: [{ seatId: faithfulOwner.id, choice: faithfulTarget.id }],
    });
    expect(JSON.stringify(faithfulView.private?.choiceSlots)).not.toContain(
      traitorTarget.id,
    );

    const otherFaithfulView = viewFor(
      { kind: 'player', seatId: otherFaithful.id, reveal: true },
      game.state,
    );
    expect(
      JSON.stringify(otherFaithfulView.private?.choiceSlots),
    ).not.toContain(faithfulTarget.id);

    const traitorView = viewFor(
      { kind: 'player', seatId: traitor.id, reveal: true },
      game.state,
    );
    expect(JSON.stringify(traitorView.private?.choiceSlots)).not.toContain(
      faithfulTarget.id,
    );
    expect(JSON.stringify(traitorView.private?.choiceSlots)).toContain(
      traitorTarget.id,
    );
    expect(
      JSON.stringify(viewFor({ kind: 'visitor' }, game.state)),
    ).not.toContain(faithfulTarget.id);
    const coordinatorView = viewFor(
      { kind: 'coordinator', seatId: faithfulOwner.id, reveal: true },
      game.state,
    );
    expect(coordinatorView.private).toBeNull();
  });
  it('updates the private Traitor choice view as fellow Traitors pick', () => {
    const game = fixture(8, {
      missions: { enabled: false, shields: 'off' },
      traitors: {
        number: 2,
        sleeper: false,
        recruitment: 'off',
        murders: 1,
        victimDecision: 'first',
        timeoutChoice: 'none',
      },
    });
    command(game, { type: 'StartGame' });
    advance(game, 'SHADOW');

    const traitors = game.state.seats.filter(
      (seat) => seat.status === 'alive' && seat.role === 'traitor',
    );
    const faithful = game.state.seats.filter(
      (seat) => seat.status === 'alive' && seat.role === 'faithful',
    );
    const firstTarget = faithful[0]!;
    const secondTarget = faithful[1]!;
    command(
      game,
      { type: 'SubmitShadowChoice', choice: firstTarget.id },
      true,
      { kind: 'player', seatId: traitors[0]!.id },
    );

    const partnerViewBeforeChoosing = viewFor(
      { kind: 'player', seatId: traitors[1]!.id, reveal: true },
      game.state,
    );
    expect(
      partnerViewBeforeChoosing.private?.choiceSlots.find(
        (entry) => entry.slot === 1 && entry.round === 1,
      )?.picks,
    ).toEqual([{ seatId: traitors[0]!.id, choice: firstTarget.id }]);

    command(
      game,
      { type: 'SubmitShadowChoice', choice: secondTarget.id },
      true,
      { kind: 'player', seatId: traitors[1]!.id },
    );
    const updatedPartnerView = viewFor(
      { kind: 'player', seatId: traitors[0]!.id, reveal: true },
      game.state,
    );
    expect(
      updatedPartnerView.private?.choiceSlots.find(
        (entry) => entry.slot === 1 && entry.round === 1,
      )?.picks,
    ).toEqual([
      { seatId: traitors[0]!.id, choice: firstTarget.id },
      { seatId: traitors[1]!.id, choice: secondTarget.id },
    ]);
  });
  it('resolves a double-murder night from separate first- and second-slot picks', () => {
    const game = fixture(8, {
      missions: { enabled: false, shields: 'off' },
      traitors: {
        number: 2,
        sleeper: false,
        recruitment: 'off',
        murders: 2,
        victimDecision: 'first',
        timeoutChoice: 'none',
      },
    });
    command(game, { type: 'StartGame' });
    advance(game, 'SHADOW');

    const traitors = game.state.seats.filter(
      (seat) => seat.status === 'alive' && seat.role === 'traitor',
    );
    const faithful = game.state.seats.filter(
      (seat) => seat.status === 'alive' && seat.role === 'faithful',
    );
    const firstTarget = faithful[0]!;
    const secondTarget = faithful[1]!;
    const chooseForSlot = (slot: 1 | 2, target: string) => {
      for (const traitor of traitors)
        command(
          game,
          { type: 'SubmitShadowChoice', slot, choice: target },
          true,
          { kind: 'player', seatId: traitor.id },
        );
    };
    const finishHiddenRound = () => {
      game.context.now = game.state.deadline! + 1;
      command(game, { type: 'AdvancePhase' });
    };

    chooseForSlot(1, firstTarget.id);
    finishHiddenRound();
    expect(game.state.shadowRound).toBe(2);
    chooseForSlot(1, firstTarget.id);
    finishHiddenRound();

    expect(game.state.phase).toBe('SHADOW');
    expect(game.state).toHaveProperty('shadowSlot', 2);
    chooseForSlot(2, secondTarget.id);
    const liveTraitorView = viewFor(
      { kind: 'player', seatId: traitors[0]!.id, reveal: true },
      game.state,
    );
    expect(
      liveTraitorView.private?.choiceSlots.some(
        (entry) =>
          entry.slot === 1 &&
          entry.round === 2 &&
          entry.picks.some(
            (pick) =>
              pick.seatId === traitors[0]!.id && pick.choice === firstTarget.id,
          ),
      ),
    ).toBe(true);
    expect(
      liveTraitorView.private?.choiceSlots.some(
        (entry) =>
          entry.slot === 2 &&
          entry.round === 1 &&
          entry.picks.some(
            (pick) =>
              pick.seatId === traitors[0]!.id &&
              pick.choice === secondTarget.id,
          ),
      ),
    ).toBe(true);
    finishHiddenRound();
    expect(game.state.shadowRound).toBe(2);
    chooseForSlot(2, secondTarget.id);
    finishHiddenRound();

    expect(game.state.phase).toBe('DAWN');
    expect(
      game.events.find((event) => event.type === 'DawnResolved'),
    ).toMatchObject({ victims: [firstTarget.id, secondTarget.id] });
    expect(game.events.map((event) => event.type)).toContain(
      'MurderSlotResolved',
    );
  });
  it('uses only the leading second-slot picks for a split unanimous decision', () => {
    const game = fixture(8, {
      missions: { enabled: false, shields: 'off' },
      traitors: {
        number: 2,
        sleeper: false,
        recruitment: 'off',
        murders: 2,
        victimDecision: 'unanimous',
        timeoutChoice: 'random',
      },
    });
    command(game, { type: 'StartGame' });
    advance(game, 'SHADOW');

    const traitors = game.state.seats.filter(
      (seat) => seat.status === 'alive' && seat.role === 'traitor',
    );
    const faithful = game.state.seats.filter(
      (seat) => seat.status === 'alive' && seat.role === 'faithful',
    );
    const submitRound = (slot: 1 | 2, targets: string[]) => {
      for (const [index, traitor] of traitors.entries())
        command(
          game,
          { type: 'SubmitShadowChoice', slot, choice: targets[index]! },
          true,
          { kind: 'player', seatId: traitor.id },
        );
      game.context.now = game.state.deadline! + 1;
      command(game, { type: 'AdvancePhase' });
    };

    submitRound(
      1,
      traitors.map(() => faithful[0]!.id),
    );
    submitRound(
      1,
      traitors.map(() => faithful[0]!.id),
    );
    submitRound(
      2,
      traitors.map((_, index) => faithful[index + 1]!.id),
    );
    submitRound(
      2,
      traitors.map((_, index) => faithful[index + 1]!.id),
    );

    const secondSlotRandom = game.events.find(
      (event) =>
        event.type === 'RandomChoiceRecorded' &&
        event.purpose === 'murder-target' &&
        event.slot === 2,
    );
    expect(secondSlotRandom).toMatchObject({
      candidates: [faithful[1]!.id, faithful[2]!.id],
    });
  });
  it('does not treat one still-eligible second-slot pick as unanimous after a protected first target', () => {
    const game = fixture(8, {
      missions: {
        enabled: true,
        shields: 'public',
        allocation: 'coordinator',
      },
      traitors: {
        number: 2,
        sleeper: false,
        recruitment: 'off',
        murders: 2,
        victimDecision: 'unanimous',
        timeoutChoice: 'random',
      },
    });
    command(game, { type: 'StartGame' });
    advance(game, 'SHADOW');

    const traitors = game.state.seats.filter(
      (seat) => seat.status === 'alive' && seat.role === 'traitor',
    );
    const faithful = game.state.seats.filter(
      (seat) => seat.status === 'alive' && seat.role === 'faithful',
    );
    const submit = (
      traitor: (typeof traitors)[number],
      slot: 1 | 2,
      choice: string,
    ) =>
      command(game, { type: 'SubmitShadowChoice', slot, choice }, true, {
        kind: 'player',
        seatId: traitor.id,
      });
    const advanceShadowWindow = () => {
      game.context.now = game.state.deadline! + 1;
      command(game, { type: 'AdvancePhase' });
    };

    submit(traitors[0]!, 1, faithful[0]!.id);
    submit(traitors[1]!, 1, faithful[1]!.id);
    advanceShadowWindow();

    submit(traitors[0]!, 1, faithful[0]!.id);
    command(game, { type: 'AllocatePower', holders: [faithful[0]!.id] });
    advanceShadowWindow();

    expect(game.events).toContainEqual(
      expect.objectContaining({
        type: 'MurderSlotResolved',
        slot: 1,
        chosen: faithful[0]!.id,
        outcome: 'protected',
      }),
    );

    submit(traitors[0]!, 2, faithful[2]!.id);
    submit(traitors[1]!, 2, faithful[0]!.id);
    advanceShadowWindow();
    submit(traitors[0]!, 2, faithful[2]!.id);
    submit(traitors[1]!, 2, faithful[0]!.id);
    advanceShadowWindow();

    expect(game.events).toContainEqual(
      expect.objectContaining({
        type: 'RandomChoiceRecorded',
        purpose: 'murder-target',
        slot: 2,
        candidates: [faithful[2]!.id],
        chosen: faithful[2]!.id,
      }),
    );
  });
  it('reports only murders completed before a win condition ends the dawn', () => {
    const game = fixture(6, {
      missions: { enabled: false, shields: 'off' },
      traitors: {
        number: 2,
        sleeper: false,
        recruitment: 'off',
        murders: 2,
        victimDecision: 'majority',
        timeoutChoice: 'random',
      },
      endgame: { parity: true },
    });
    command(game, { type: 'StartGame' });
    advance(game, 'VOTE');

    const traitors = game.state.seats.filter((seat) => seat.role === 'traitor');
    const faithful = game.state.seats.filter(
      (seat) => seat.role === 'faithful',
    );
    const banished = faithful[0]!;
    const target = faithful[1]!;
    for (const seat of game.state.seats)
      command(
        game,
        {
          type: 'SubmitVote',
          target: seat.id === banished.id ? target.id : banished.id,
        },
        true,
        { kind: 'player', seatId: seat.id },
      );
    advance(game, 'SHADOW');

    for (const traitor of traitors)
      command(game, { type: 'SubmitShadowChoice', choice: target.id }, true, {
        kind: 'player',
        seatId: traitor.id,
      });
    game.context.now = game.state.deadline! + 1;
    command(game, { type: 'AdvancePhase' });
    for (const traitor of traitors)
      command(game, { type: 'SubmitShadowChoice', choice: target.id }, true, {
        kind: 'player',
        seatId: traitor.id,
      });
    game.context.now = game.state.deadline! + 1;
    command(game, { type: 'AdvancePhase' });
    expect(game.state.phase).toBe('FINISHED');
    expect(
      game.events.filter((event) => event.type === 'ShadowSlotAdvanced'),
    ).toHaveLength(0);
    expect(
      game.events.filter((event) => event.type === 'MurderSlotResolved'),
    ).toMatchObject([
      { slot: 1, outcome: 'murdered' },
      { slot: 2, picks: [], chosen: null, outcome: 'game-ended' },
    ]);

    const dawn = game.events.find((event) => event.type === 'DawnResolved');
    const murdered = game.events.flatMap((event) =>
      event.type === 'SeatRemoved' && event.reason === 'murdered'
        ? [event.seatId]
        : [],
    );
    expect(dawn?.type === 'DawnResolved' ? dawn.victims : []).toEqual(murdered);
    expect(murdered).toHaveLength(1);
    expect(game.state.reason).toBe('parity');
  });
  it('treats one living Traitor choice as unanimous even when the timeout rule is no murder', () => {
    const game = fixture(15, {
      missions: { enabled: false, shields: 'off' },
      schedule: { format: 'quick' },
      traitors: {
        number: 1,
        sleeper: false,
        recruitment: 'off',
        victimDecision: 'unanimous',
        timeoutChoice: 'none',
      },
    });
    command(game, { type: 'StartGame' });
    advance(game, 'VOTE');
    const initialFaithful = game.state.seats.filter(
      (seat) => seat.role === 'faithful',
    );
    const voteTarget = initialFaithful[13]!;
    const alternate = initialFaithful[12]!;
    for (const seat of game.state.seats.filter(
      (candidate) => candidate.status === 'alive',
    ))
      command(
        game,
        {
          type: 'SubmitVote',
          target: seat.id === voteTarget.id ? alternate.id : voteTarget.id,
        },
        true,
        { kind: 'player', seatId: seat.id },
      );
    advance(game, 'SHADOW');

    const traitor = game.state.seats.find(
      (seat) => seat.role === 'traitor' && seat.status === 'alive',
    )!;
    const target = game.state.seats.find(
      (seat) => seat.role === 'faithful' && seat.status === 'alive',
    )!;
    game.context.now = game.state.deadline! + 1;
    command(game, { type: 'AdvancePhase' });
    command(game, { type: 'SubmitShadowChoice', choice: target.id }, true, {
      kind: 'player',
      seatId: traitor.id,
    });
    game.context.now = game.state.deadline! + 1;
    command(game, { type: 'AdvancePhase' });

    expect(
      game.events.find((event) => event.type === 'DawnResolved'),
    ).toMatchObject({ victims: [target.id] });
    expect(
      game.events.some(
        (event) =>
          event.type === 'RandomChoiceRecorded' &&
          event.purpose === 'murder-target',
      ),
    ).toBe(false);
  });
  it('pauses absolute deadlines without changing rule-progress steps', () => {
    const game = fixture(5);
    command(game, { type: 'StartGame' });
    const deadline = game.state.deadline!;
    const steps = game.state.steps;
    command(game, { type: 'Pause' });
    game.context.now += 60_000;
    expect(command(game, { type: 'AdvancePhase' }, false)).toMatchObject({
      ok: false,
      code: 'PAUSED',
    });
    command(game, { type: 'Resume' });
    expect(game.state.deadline).toBe(deadline + 60_000);
    expect(game.state.steps).toBe(steps);
  });
  it('finishes immediately when the last Traitor leaves without an eligible sleeper', () => {
    const game = fixture(5, { traitors: { sleeper: false } });
    command(game, { type: 'StartGame' });
    const traitor = game.state.seats.find((s) => s.role === 'traitor')!;
    command(game, { type: 'MarkDeparted', seatId: traitor.id });
    expect(game.state.phase).toBe('FINISHED');
    expect(game.state.winner).toBe('faithful');
    expect(
      commitment(
        game.state.id,
        game.state.deal!.roles,
        game.state.deal!.salt,
        game.state.deal!.sleeper,
      ),
    ).toBe(game.state.deal?.commitment);
  });
  it('activates an eligible sleeper only at the next private moment, before endgame', () => {
    const game = fixture(8, {
      traitors: { number: 1, sleeper: true },
      missions: { enabled: false },
      endgame: { size: 3 },
      roundTable: { tieRule: 'revote-none' },
    });
    command(game, { type: 'StartGame' });
    const sleeper = game.state.deal!.sleeper!;
    const traitor = game.state.seats.find((seat) => seat.role === 'traitor')!;
    command(game, { type: 'MarkDeparted', seatId: traitor.id });
    expect(game.state.phase).not.toBe('FINISHED');
    expect(game.state.pendingSleeper).toBe(true);
    expect(game.state.seats.find((seat) => seat.id === sleeper)?.role).toBe(
      'faithful',
    );
    advance(game, 'SHADOW');
    expect(game.state.seats.find((seat) => seat.id === sleeper)?.role).toBe(
      'traitor',
    );
    expect(game.state.pendingSleeper).toBe(false);
    expect(replay(game.events)).toEqual(game.state);
  });
  it('counts only living completed role views, never leaking private names in progress', () => {
    const game = fixture(8);
    command(game, { type: 'StartGame' });
    for (const seat of game.state.seats)
      command(game, { type: 'AcknowledgePrivate' }, true, {
        kind: 'player',
        seatId: seat.id,
      });
    expect(viewFor({ kind: 'coordinator' }, game.state).progress).toEqual({
      done: 0,
      total: 8,
    });
    for (const seat of game.state.seats)
      command(game, { type: 'AcknowledgePrivate', ready: true }, true, {
        kind: 'player',
        seatId: seat.id,
      });
    expect(viewFor({ kind: 'coordinator' }, game.state).progress).toEqual({
      done: 8,
      total: 8,
    });
    const faithful = game.state.seats.find((seat) => seat.role === 'faithful')!;
    command(game, { type: 'MarkDeparted', seatId: faithful.id });
    expect(viewFor({ kind: 'coordinator' }, game.state).progress).toEqual({
      done: 7,
      total: 7,
    });
    expect(
      Object.keys(viewFor({ kind: 'coordinator' }, game.state).progress).sort(),
    ).toEqual(['done', 'total']);
  });
  it('requires the uniform minimum time before closing a ballot', () => {
    const game = fixture(15);
    command(game, { type: 'StartGame' });
    advance(game, 'VOTE');
    expect(command(game, { type: 'AdvancePhase' }, false)).toMatchObject({
      ok: false,
      code: 'TOO_EARLY',
    });
  });
  it('treats a missing endgame vote as continue, not consent to end', () => {
    const game = fixture(5, {
      endgame: { trigger: 'time', at: '2020-01-01T00:00:00Z' },
    });
    command(game, { type: 'StartGame' });
    advance(game, 'FINAL_VOTE');
    for (const seat of game.state.seats.slice(0, 4))
      command(game, { type: 'SubmitEndgameVote', choice: 'end' }, true, {
        kind: 'player',
        seatId: seat.id,
      });
    game.context.now += 10_000;
    command(game, { type: 'AdvancePhase' });
    expect(game.state.phase).toBe('FINAL_BANISH');
    expect(game.state.winner).toBeNull();
  });
  it('schedules a completed endgame vote for its private minimum', () => {
    const game = fixture(5, {
      privacy: { shieldSeconds: 3, holdMs: 500 },
      endgame: { trigger: 'time', at: '2020-01-01T00:00:00Z' },
    });
    command(game, { type: 'StartGame' });
    advance(game, 'FINAL_VOTE');

    const minimumAt =
      game.state.phaseStarted +
      game.state.config.privacy.shieldSeconds * 1000 +
      game.state.config.privacy.holdMs;
    const originalDeadline = game.state.deadline;
    game.context.now = minimumAt - 1;
    for (const seat of game.state.seats) {
      command(game, { type: 'SubmitEndgameVote', choice: 'continue' }, true, {
        kind: 'player',
        seatId: seat.id,
      });
      command(game, { type: 'AcknowledgePrivate' }, true, {
        kind: 'player',
        seatId: seat.id,
      });
    }

    expect(game.state.phase).toBe('FINAL_VOTE');
    expect(game.state.deadline).toBe(minimumAt);
    expect(game.state.deadline).toBeLessThan(originalDeadline!);
    expect(
      command(game, { type: 'AdvancePhase' }, false, { kind: 'system' }),
    ).toMatchObject({ ok: false, code: 'TOO_EARLY' });

    game.context.now = minimumAt;
    command(game, { type: 'AdvancePhase' }, true, { kind: 'system' });
    expect(game.state.phase).toBe('FINAL_BANISH');
  });
  it('does not wait beyond the last action when the endgame minimum has passed', () => {
    const game = fixture(5, {
      privacy: { shieldSeconds: 3, holdMs: 500 },
      endgame: { trigger: 'time', at: '2020-01-01T00:00:00Z' },
    });
    command(game, { type: 'StartGame' });
    advance(game, 'FINAL_VOTE');

    const minimumAt =
      game.state.phaseStarted +
      game.state.config.privacy.shieldSeconds * 1000 +
      game.state.config.privacy.holdMs;
    game.context.now = minimumAt + 1;
    const lastActionAt = game.context.now;
    for (const seat of game.state.seats) {
      command(game, { type: 'SubmitEndgameVote', choice: 'continue' }, true, {
        kind: 'player',
        seatId: seat.id,
      });
      command(game, { type: 'AcknowledgePrivate' }, true, {
        kind: 'player',
        seatId: seat.id,
      });
    }

    expect(game.state.deadline).toBe(lastActionAt);
  });
  it('keeps the endgame step player-paced in rehearsal', () => {
    const game = fixture(5, {
      privacy: { shieldSeconds: 3, holdMs: 500 },
      endgame: { trigger: 'time', at: '2020-01-01T00:00:00Z' },
      rehearsal: {
        enabled: true,
        botSeatIds: ['bot-0', 'bot-1', 'bot-2', 'bot-3'],
        speed: 'fast',
      },
    });
    command(game, { type: 'StartGame' });
    advance(game, 'FINAL_VOTE');
    game.context.now =
      game.state.phaseStarted +
      game.state.config.privacy.shieldSeconds * 1000 +
      game.state.config.privacy.holdMs +
      1;
    for (const seat of game.state.seats) {
      command(game, { type: 'SubmitEndgameVote', choice: 'continue' }, true, {
        kind: 'player',
        seatId: seat.id,
      });
      command(game, { type: 'AcknowledgePrivate' }, true, {
        kind: 'player',
        seatId: seat.id,
      });
    }
    expect(game.state.phase).toBe('FINAL_VOTE');
    expect(game.state.deadline).toBeNull();
  });
  it('uses the forced re-vote then random rule in ENDGAME and completes each round', () => {
    const game = fixture(5, {
      traitors: { sleeper: false },
      missions: { enabled: false },
      roundTable: { tieRule: 'revote-none' },
      endgame: { trigger: 'time', at: '2020-01-01T00:00:00Z' },
    });
    command(game, { type: 'StartGame' });
    advance(game, 'FINAL_BANISH');

    const minimum =
      game.state.config.privacy.shieldSeconds * 1000 +
      game.state.config.privacy.holdMs;
    const steps = game.state.steps;
    game.context.now = game.state.phaseStarted + minimum;
    command(game, { type: 'AdvancePhase' });
    expect(game.state.revote).toBe(true);
    expect(viewFor({ kind: 'coordinator' }, game.state).revote).toBe(true);
    expect(game.state.steps).toBe(steps);

    game.context.now = game.state.phaseStarted + minimum;
    command(game, { type: 'AdvancePhase' });
    expect(
      game.state.seats.filter((seat) => seat.status === 'alive'),
    ).toHaveLength(4);
    expect(game.state.phase).toBe('FINAL_VOTE');
    expect(game.state.steps).toBe(steps + 1);
  });
  it('fails explicitly when task mode has no validated library', () => {
    const game = fixture(8, { tasks: { enabled: true } });
    const result = command(game, { type: 'StartGame' }, false);
    expect(result).toMatchObject({
      ok: false,
      code: 'TASK_CATALOG_UNAVAILABLE',
    });
  });
  it('assigns a shared task on each acknowledged Traitor deal and projects a same-shaped decoy', () => {
    const game = fixture(8, {
      tasks: { enabled: true, perCycle: 'shared' },
    });
    Reflect.set(game.context, 'taskCatalog', [
      {
        id: 'task-alpha',
        text: 'Move a named object into a different room without drawing attention.',
        tags: ['family', 'seated'],
        minimumAge: 8,
        difficulty: 'easy',
      },
    ]);
    command(game, { type: 'StartGame' });

    const traitors = game.state.seats.filter((seat) => seat.role === 'traitor');
    const faithful = game.state.seats.find((seat) => seat.role === 'faithful')!;
    expect(game.state.taskAssignments).toHaveLength(0);
    command(game, { type: 'AcknowledgePrivate' }, true, {
      kind: 'player',
      seatId: traitors[0]!.id,
    });
    const first = game.state.taskAssignments[0]!;
    command(game, { type: 'AcknowledgePrivate' }, true, {
      kind: 'player',
      seatId: traitors[1]!.id,
    });
    expect(game.state.taskAssignments).toHaveLength(2);
    expect(game.state.taskAssignments.map((task) => task.taskId)).toEqual([
      'task-alpha',
      'task-alpha',
    ]);
    for (const seat of game.state.seats.filter(
      (candidate) => candidate.role === 'faithful',
    )) {
      const version = game.state.version;
      command(game, { type: 'AcknowledgePrivate' }, true, {
        kind: 'player',
        seatId: seat.id,
      });
      expect(game.state.version - version).toBe(2);
    }

    const secret = viewFor(
      { kind: 'player', seatId: traitors[0]!.id, reveal: true },
      game.state,
    );
    const decoy = viewFor(
      { kind: 'player', seatId: faithful.id, reveal: true },
      game.state,
    );
    expect(secret.private?.task).toMatchObject({
      kind: 'task',
      instruction:
        'Move a named object into a different room without drawing attention.',
    });
    expect(decoy.private?.task?.kind).toBe('decoy');
    expect(decoy.private?.task?.instruction).not.toBe(first.text);
    const blindCoordinator = viewFor(
      { kind: 'coordinator', reveal: true },
      game.state,
    );
    expect(blindCoordinator.private).toBeNull();
    expect(blindCoordinator.ballots).toEqual({});
    expect(blindCoordinator.seats.every((seat) => !('role' in seat))).toBe(
      true,
    );
    expect(JSON.stringify(blindCoordinator)).not.toContain(first.text);
    expect(
      JSON.stringify(viewFor({ kind: 'admin', reveal: true }, game.state)),
    ).not.toContain(first.text);
  });
  it('treats a shared task as complete when any living Traitor reports done', () => {
    const game = fixture(12, {
      tasks: { enabled: true, perCycle: 'shared' },
    });
    Reflect.set(game.context, 'taskCatalog', [
      {
        id: 'task-shared',
        text: 'Ask two guests to use a chosen word during an ordinary conversation.',
        tags: ['family', 'seated'],
        minimumAge: 8,
        difficulty: 'easy',
      },
    ]);
    command(game, { type: 'StartGame' });
    for (const seat of game.state.seats)
      command(game, { type: 'AcknowledgePrivate' }, true, {
        kind: 'player',
        seatId: seat.id,
      });
    advance(game, 'SHADOW');
    const living = game.state.seats.filter((seat) => seat.status === 'alive');
    const traitors = living.filter((seat) => seat.role === 'traitor');
    const faithful = living.filter((seat) => seat.role === 'faithful');
    expect(traitors.length).toBeGreaterThan(1);

    for (const [index, seat] of traitors.entries()) {
      command(
        game,
        {
          type: 'SubmitTaskReport',
          answer: index === 0 ? 'done' : 'missed',
        },
        true,
        { kind: 'player', seatId: seat.id },
      );
      command(
        game,
        { type: 'SubmitShadowChoice', choice: faithful[0]!.id },
        true,
        { kind: 'player', seatId: seat.id },
      );
    }
    for (const seat of faithful) {
      command(
        game,
        { type: 'SubmitTaskReport', answer: 'I am keeping watch.' },
        true,
        { kind: 'player', seatId: seat.id },
      );
      command(
        game,
        {
          type: 'SubmitShadowChoice',
          choice: living.find((candidate) => candidate.id !== seat.id)!.id,
        },
        true,
        { kind: 'player', seatId: seat.id },
      );
    }
    game.context.now = game.state.deadline! + 1;
    command(game, { type: 'AdvancePhase' });
    command(game, { type: 'EndGameEarly' });

    const reveal = viewFor(
      { kind: 'player', seatId: traitors[0]!.id },
      game.state,
    ).fairness!;
    expect(reveal.tasks.filter((task) => task.cycle === 1)).not.toHaveLength(0);
    expect(
      reveal.tasks
        .filter((task) => task.cycle === 1)
        .every((task) => task.complete),
    ).toBe(true);
  });
  it('blocks a Traitor shadow choice until the task report is recorded', () => {
    const game = fixture(12, { tasks: { enabled: true } });
    Reflect.set(game.context, 'taskCatalog', [
      {
        id: 'task-beta',
        text: 'Ask two guests to use a chosen word during an ordinary conversation.',
        tags: ['family', 'seated'],
        minimumAge: 8,
        difficulty: 'easy',
      },
    ]);
    command(game, { type: 'StartGame' });
    for (const seat of game.state.seats)
      command(game, { type: 'AcknowledgePrivate' }, true, {
        kind: 'player',
        seatId: seat.id,
      });
    advance(game, 'SHADOW');
    const traitor = game.state.seats.find(
      (seat) => seat.role === 'traitor' && seat.status === 'alive',
    )!;
    const target = game.state.seats.find(
      (seat) => seat.role === 'faithful' && seat.status === 'alive',
    )!;
    expect(
      command(game, { type: 'SubmitShadowChoice', choice: target.id }, false, {
        kind: 'player',
        seatId: traitor.id,
      }),
    ).toMatchObject({ ok: false, code: 'TASK_REPORT_REQUIRED' });
  });
  it('cancels a murder for a missed task without revealing the reason to the coordinator', () => {
    const game = fixture(12, {
      tasks: { enabled: true },
      traitors: { murders: 2 },
    });
    Reflect.set(game.context, 'taskCatalog', [
      {
        id: 'task-gamma',
        text: 'Change seats at the next gathering without drawing attention.',
        tags: ['family', 'seated'],
        minimumAge: 8,
        difficulty: 'easy',
      },
    ]);
    command(game, { type: 'StartGame' });
    for (const seat of game.state.seats)
      command(game, { type: 'AcknowledgePrivate' }, true, {
        kind: 'player',
        seatId: seat.id,
      });
    advance(game, 'SHADOW');
    const living = game.state.seats.filter((seat) => seat.status === 'alive');
    const traitors = living.filter((seat) => seat.role === 'traitor');
    const faithful = living.filter((seat) => seat.role === 'faithful');
    expect(traitors.length).toBeGreaterThan(1);

    for (const [index, seat] of traitors.entries()) {
      const task = game.state.taskAssignments.find(
        (entry) => entry.seatId === seat.id && entry.cycle === game.state.cycle,
      );
      command(
        game,
        {
          type: 'SubmitTaskReport',
          answer:
            task?.taskId && index === 0
              ? 'missed'
              : task?.taskId
                ? 'done'
                : 'I am keeping an eye on things.',
        },
        true,
        { kind: 'player', seatId: seat.id },
      );
      command(
        game,
        { type: 'SubmitShadowChoice', choice: faithful[0]!.id },
        true,
        { kind: 'player', seatId: seat.id },
      );
    }
    for (const seat of faithful) {
      command(
        game,
        { type: 'SubmitTaskReport', answer: 'I suspect another player.' },
        true,
        { kind: 'player', seatId: seat.id },
      );
      command(
        game,
        {
          type: 'SubmitShadowChoice',
          choice: living.find((candidate) => candidate.id !== seat.id)!.id,
        },
        true,
        { kind: 'player', seatId: seat.id },
      );
    }
    game.context.now = game.state.deadline! + 1;
    command(game, { type: 'AdvancePhase' });
    game.context.now = game.state.deadline! + 1;
    command(game, { type: 'AdvancePhase' });
    expect(game.state.shadowSlot).toBe(2);
    game.context.now = game.state.deadline! + 1;
    command(game, { type: 'AdvancePhase' });
    game.context.now = game.state.deadline! + 1;
    command(game, { type: 'AdvancePhase' });

    expect(game.state.phase).toBe('DAWN');
    expect(
      game.state.seats.filter((seat) => seat.status === 'murdered'),
    ).toHaveLength(0);
    expect(
      game.events
        .filter((event) => event.type === 'MurderSlotResolved')
        .map((event) => event.type === 'MurderSlotResolved' && event.outcome),
    ).toEqual(['cancelled', 'cancelled']);
    const dawnEvent = game.events.find(
      (event) => event.type === 'DawnResolved',
    );
    expect(dawnEvent).toMatchObject({ victims: [] });
    if (dawnEvent?.type !== 'DawnResolved')
      throw new Error('The cancelled murder did not produce a dawn event.');
    expect(
      viewFor({ kind: 'presenter' }, game.state).publicLog.find(
        (entry) => entry.action === 'dawn',
      ),
    ).toEqual({
      seq: dawnEvent.seq,
      at: dawnEvent.at,
      action: 'dawn',
      victims: [],
    });
    expect(game.state.taskMurderCancelledCycles).toContainEqual(
      expect.objectContaining({ cycle: 1, cancelled: true }),
    );
    const notifiedTraitor = traitors.find((seat) => seat.status === 'alive')!;
    const uninformedFaithful = game.state.seats.find(
      (seat) => seat.role === 'faithful' && seat.status === 'alive',
    )!;
    expect(
      viewFor(
        { kind: 'player', seatId: notifiedTraitor.id, reveal: true },
        game.state,
      ).private?.task?.murderLost,
    ).toBe(true);
    expect(
      viewFor(
        { kind: 'player', seatId: uninformedFaithful.id, reveal: true },
        game.state,
      ).private?.task?.murderLost,
    ).toBe(false);
    expect(
      viewFor({ kind: 'coordinator', reveal: true }, game.state).private,
    ).toBeNull();
  });
  it('counts missing Traitor reports as missed only at the shadow deadline', () => {
    const game = fixture(12, { tasks: { enabled: true } });
    Reflect.set(game.context, 'taskCatalog', [
      {
        id: 'task-delta',
        text: 'Ask two guests to use a chosen word during an ordinary conversation.',
        tags: ['family', 'seated'],
        minimumAge: 8,
        difficulty: 'easy',
      },
    ]);
    command(game, { type: 'StartGame' });
    for (const seat of game.state.seats)
      command(game, { type: 'AcknowledgePrivate' }, true, {
        kind: 'player',
        seatId: seat.id,
      });
    advance(game, 'SHADOW');
    game.context.now =
      game.state.phaseStarted +
      game.state.config.privacy.shieldSeconds * 1000 +
      game.state.config.privacy.holdMs;
    const early = command(game, { type: 'AdvancePhase' }, false);
    expect(early).toMatchObject({
      ok: false,
      code: 'TASK_REPORTS_PENDING',
    });
    const livingFaithful = game.state.seats.filter(
      (seat) => seat.status === 'alive' && seat.role === 'faithful',
    );
    game.context.now = game.state.deadline! + 1;
    command(game, { type: 'AdvancePhase' });

    for (const seat of game.state.seats.filter(
      (candidate) =>
        candidate.status === 'alive' && candidate.role === 'traitor',
    ))
      expect(
        game.state.taskAssignments.find(
          (task) => task.seatId === seat.id && task.cycle === game.state.cycle,
        )?.status,
      ).toBe('missed');
    expect(
      game.state.taskReports
        .filter((report) => report.cycle === 1)
        .map((report) => report.seatId)
        .sort(),
    ).toEqual(livingFaithful.map((seat) => seat.id).sort());
    game.context.now = game.state.deadline! + 1;
    command(game, { type: 'AdvancePhase' });
    expect(
      game.state.taskMurderCancelledCycles.find(
        (resolution) => resolution.cycle === 1,
      )?.cancelled,
    ).toBe(true);
  });
  it('voids a departed Traitor task without applying a task-miss penalty', () => {
    const game = fixture(12, {
      tasks: { enabled: true },
      traitors: { sleeper: false, recruitment: 'off' },
    });
    Reflect.set(game.context, 'taskCatalog', [
      {
        id: 'task-epsilon',
        text: 'Move a named object into a different room without drawing attention.',
        tags: ['family', 'seated'],
        minimumAge: 8,
        difficulty: 'easy',
      },
    ]);
    command(game, { type: 'StartGame' });
    for (const seat of game.state.seats)
      command(game, { type: 'AcknowledgePrivate' }, true, {
        kind: 'player',
        seatId: seat.id,
      });
    const departed = game.state.seats.find((seat) => seat.role === 'traitor')!;
    command(game, { type: 'MarkDeparted', seatId: departed.id });
    expect(
      game.state.taskAssignments.find((task) => task.seatId === departed.id)
        ?.status,
    ).toBe('void');
    advance(game, 'SHADOW');
    const living = game.state.seats.filter((seat) => seat.status === 'alive');
    const faithful = living.find((seat) => seat.role === 'faithful')!;
    for (const seat of living.filter(
      (candidate) => candidate.role === 'traitor',
    )) {
      const task = game.state.taskAssignments.find(
        (item) => item.seatId === seat.id && item.cycle === game.state.cycle,
      );
      if (task?.taskId)
        command(game, { type: 'SubmitTaskReport', answer: 'done' }, true, {
          kind: 'player',
          seatId: seat.id,
        });
      command(game, { type: 'SubmitShadowChoice', choice: faithful.id }, true, {
        kind: 'player',
        seatId: seat.id,
      });
    }
    game.context.now = game.state.deadline! + 1;
    command(game, { type: 'AdvancePhase' });
    game.context.now = game.state.deadline! + 1;
    command(game, { type: 'AdvancePhase' });
    expect(
      game.state.taskMurderCancelledCycles.find(
        (resolution) => resolution.cycle === 1,
      )?.cancelled,
    ).toBe(false);
  });
  it('assigns an activated sleeper a task at the next DAWN, not during the current SHADOW', () => {
    const game = fixture(8, {
      tasks: { enabled: true },
      traitors: {
        number: 1,
        sleeper: true,
        recruitment: 'off',
        timeoutChoice: 'none',
      },
      missions: { enabled: false },
      endgame: { size: 3 },
    });
    Reflect.set(game.context, 'taskCatalog', [
      {
        id: 'task-sleeper',
        text: 'Make someone laugh during an ordinary conversation.',
        tags: ['family', 'seated'],
        minimumAge: 8,
        difficulty: 'easy',
      },
    ]);
    command(game, { type: 'StartGame' });
    const sleeperId = game.state.deal!.sleeper!;
    for (const seat of game.state.seats)
      command(game, { type: 'AcknowledgePrivate' }, true, {
        kind: 'player',
        seatId: seat.id,
      });
    const originalTraitor = game.state.seats.find(
      (seat) => seat.role === 'traitor',
    )!;
    command(game, { type: 'MarkDeparted', seatId: originalTraitor.id });
    advance(game, 'SHADOW');
    expect(game.state.seats.find((seat) => seat.id === sleeperId)?.role).toBe(
      'traitor',
    );
    expect(
      game.state.taskAssignments.find(
        (task) => task.seatId === sleeperId && task.cycle === 1,
      )?.taskId,
    ).toBeNull();
    game.context.now = game.state.deadline! + 1;
    command(game, { type: 'AdvancePhase' });
    game.context.now = game.state.deadline! + 1;
    command(game, { type: 'AdvancePhase' });
    expect(game.state.phase).toBe('DAWN');
    expect(
      game.state.taskAssignments.find(
        (task) => task.seatId === sleeperId && task.cycle === 2,
      )?.taskId,
    ).toBe('task-sleeper');
  });
  it('does not carry a missed-task penalty from a cycle with zero murders', () => {
    const game = fixture(12, {
      tasks: { enabled: true },
      traitors: { murders: 0, sleeper: false },
    });
    Reflect.set(game.context, 'taskCatalog', [
      {
        id: 'task-zero-murders',
        text: 'Ask two guests to use a chosen word during an ordinary conversation.',
        tags: ['family', 'seated'],
        minimumAge: 8,
        difficulty: 'easy',
      },
    ]);
    command(game, { type: 'StartGame' });
    for (const seat of game.state.seats)
      command(game, { type: 'AcknowledgePrivate' }, true, {
        kind: 'player',
        seatId: seat.id,
      });
    advance(game, 'SHADOW');
    game.context.now = game.state.deadline! + 1;
    command(game, { type: 'AdvancePhase' });
    game.context.now = game.state.deadline! + 1;
    command(game, { type: 'AdvancePhase' });
    expect(game.state.phase).toBe('DAWN');
    expect(
      game.state.taskMurderCancelledCycles.find(
        (resolution) => resolution.cycle === 1,
      )?.cancelled,
    ).toBe(false);
    expect(
      game.state.taskAssignments.some(
        (task) =>
          task.cycle === 2 &&
          game.state.seats.find(
            (seat) => seat.id === task.seatId && seat.role === 'traitor',
          ) !== undefined &&
          task.taskId === 'task-zero-murders',
      ),
    ).toBe(true);
    expect(
      viewFor(
        {
          kind: 'player',
          seatId: game.state.seats.find(
            (seat) => seat.role === 'traitor' && seat.status === 'alive',
          )!.id,
          reveal: true,
        },
        game.state,
      ).private?.task?.murderLost,
    ).toBe(false);
  });
  it('does not add an empty mission step when missions are disabled', () => {
    const game = fixture(12, {
      missions: { enabled: false },
      traitors: { sleeper: false },
    });
    command(game, { type: 'StartGame' });
    advance(game, 'SHADOW');
    advance(game, 'DAWN');
    game.context.now = game.state.deadline! + 1;
    command(game, { type: 'AdvancePhase' });
    expect(game.state.phase).toBe('DEBATE');
    expect(
      game.events.some(
        (event) => event.type === 'PhaseChanged' && event.phase === 'MISSION',
      ),
    ).toBe(false);
  });
});
