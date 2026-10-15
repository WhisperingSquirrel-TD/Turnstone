import type { FullView, PrivateView } from '@workspace/api-client-react';
import { en } from './locale/en-GB';

type NotesScreenProps = {
  privateView: PrivateView;
  seats: FullView['seats'];
  notesDraft: string;
  notesStatus: string;
  saving: boolean;
  onDraftChange: (value: string) => void;
  onSave: () => void;
};

export function NotesScreen({
  privateView,
  seats,
  notesDraft,
  notesStatus,
  saving,
  onDraftChange,
  onSave,
}: NotesScreenProps) {
  return (
    <div className="enter" data-testid="private-notes-content">
      <h2 className="display text-2xl">{en.game.notesHeading}</h2>
      <p className="mt-2 text-sm text-ash">{en.game.notesPrivateIntro}</p>
      <div
        className="mt-4 whitespace-pre-wrap border-y border-stone py-3 text-sm text-ash"
        aria-live={privateView.role === 'traitor' ? 'polite' : undefined}
        aria-hidden={privateView.role !== 'traitor'}
      >
        {privateView.role === 'traitor'
          ? privateView.chat
              .slice()
              .sort((a, b) => a.seq - b.seq)
              .map((message) => {
                const author = seats.find(
                  (seat) => seat.id === message.seatId,
                )?.name;
                return author ? `${author}: ${message.text}` : message.text;
              })
              .join('\n') || en.game.notesTeamEmpty
          : '\u00a0'}
      </div>
      <label className="mt-4 block text-sm text-ash">
        <span>{en.game.notesLabel}</span>
        <textarea
          className="mt-2 min-h-24 w-full resize-y border border-stone bg-hearth p-3 text-base text-candle"
          aria-label={en.game.notesLabel}
          maxLength={500}
          value={notesDraft}
          onChange={(event) => onDraftChange(event.target.value)}
        />
      </label>
      <button
        className="primary-action mt-4 w-full"
        type="button"
        disabled={!notesDraft.trim() || saving}
        onClick={onSave}
      >
        {privateView.role === 'traitor' ? en.game.notesSend : en.game.notesSave}
      </button>
      {notesStatus && (
        <p role="status" className="mt-3 text-sm text-ash">
          {notesStatus}
        </p>
      )}
    </div>
  );
}
