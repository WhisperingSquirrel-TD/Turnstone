import type { entryFailureMessages } from '@workspace/shared';

export type EntryFailureMessage =
  (typeof entryFailureMessages)[keyof typeof entryFailureMessages];

export class EntryActionError extends Error {
  constructor(message: EntryFailureMessage) {
    super(message);
    this.name = 'EntryActionError';
  }
}
