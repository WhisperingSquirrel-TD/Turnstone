export const PRIVATE_CHOICE_DRAFT_PREFIX = 'oathstone:choice-draft:';

export type PrivateChoiceDraftWindow = {
  gameId: string;
  seatId: string;
  phase: string;
  cycle: number;
  slot: number;
};

type ChoiceDraftStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'
>;

export function createPrivateChoiceDraftKey({
  gameId,
  seatId,
  phase,
  cycle,
  slot,
}: PrivateChoiceDraftWindow) {
  return `${PRIVATE_CHOICE_DRAFT_PREFIX}${encodeURIComponent(gameId)}:${encodeURIComponent(seatId)}:${phase}:${cycle}:${slot}`;
}

export function readPrivateChoiceDraft(
  storage: Pick<Storage, 'getItem'>,
  key: string,
) {
  return storage.getItem(key);
}

export function writePrivateChoiceDraft(
  storage: Pick<Storage, 'setItem'>,
  key: string,
  choiceId: string,
) {
  storage.setItem(key, choiceId);
}

export function clearPrivateChoiceDraft(
  storage: Pick<Storage, 'removeItem'>,
  key: string,
) {
  storage.removeItem(key);
}

export function clearStalePrivateChoiceDrafts(
  storage: ChoiceDraftStorage,
  activeKey: string | null,
) {
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key?.startsWith(PRIVATE_CHOICE_DRAFT_PREFIX) && key !== activeKey) {
      storage.removeItem(key);
    }
  }
}
