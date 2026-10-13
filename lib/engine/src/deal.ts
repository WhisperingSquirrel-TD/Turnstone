import { createHash } from 'node:crypto';
import { recommended } from '../../shared/src/index';
import { alive, type Context, type Role, type State } from './model';

export function commitment(
  id: string,
  roles: Record<string, Role>,
  salt: string,
  sleeper: string | null = null,
): string {
  const ordered = Object.keys(roles)
    .sort()
    .map((key) => [key, roles[key]]);
  return createHash('sha256')
    .update(JSON.stringify({ id, roles: ordered, sleeper, salt }))
    .digest('hex');
}

export function roleDeal(state: State, ctx: Context, redeal: boolean) {
  const living = [...alive(state)];
  for (let i = living.length - 1; i > 0; i--) {
    const pick = ctx.random.int(i + 1);
    if (!Number.isInteger(pick) || pick < 0 || pick > i)
      throw new Error('Invalid random source');
    [living[i], living[pick]] = [living[pick]!, living[i]!];
  }
  const count =
    state.config.traitors.number === 'auto'
      ? recommended(living.length).traitors
      : state.config.traitors.number;
  const roles = Object.fromEntries(
    living.map((seat, index) => [
      seat.id,
      index < count ? 'traitor' : 'faithful',
    ]),
  ) as Record<string, Role>;
  const bytes = ctx.random.bytes(32);
  if (bytes.length !== 32) throw new Error('Invalid injected entropy length');
  const salt = Buffer.from(bytes).toString('hex');
  const setting = state.config.traitors.sleeper;
  const window = state.config.schedule.window;
  const enabled =
    setting === 'auto'
      ? window
        ? Date.parse(window.end) - Date.parse(window.start) > 3 * 60 * 60 * 1000
        : state.config.schedule.format !== 'quick'
      : setting;
  const candidates = living.filter((seat) => roles[seat.id] === 'faithful');
  let sleeper: string | null = null;
  if (enabled) {
    const index = ctx.random.int(candidates.length);
    if (!Number.isInteger(index) || index < 0 || index >= candidates.length)
      throw new Error('Invalid injected random source');
    sleeper = candidates[index]!.id;
  }
  return {
    roles,
    salt,
    commitment: commitment(state.id, roles, salt, sleeper),
    sleeper,
    redeal,
  };
}
