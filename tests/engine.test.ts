import { describe, expect, it } from 'vitest';
import {
  decide,
  evolve,
  replay,
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
  it('counts only living acknowledgements, never leaking private names in progress', () => {
    const game = fixture(8);
    command(game, { type: 'StartGame' });
    for (const seat of game.state.seats)
      command(game, { type: 'AcknowledgePrivate' }, true, {
        kind: 'player',
        seatId: seat.id,
      });
    const faithful = game.state.seats.find((seat) => seat.role === 'faithful')!;
    command(game, { type: 'MarkDeparted', seatId: faithful.id });
    expect(viewFor({ kind: 'coordinator' }, game.state).progress).toEqual({
      done: 7,
      total: 7,
    });
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
    expect(viewFor({ kind: 'coordinator' }, game.state).private).toBeNull();
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
    const game = fixture(12, { tasks: { enabled: true } });
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

    expect(game.state.phase).toBe('DAWN');
    expect(
      game.state.seats.filter((seat) => seat.status === 'murdered'),
    ).toHaveLength(0);
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
