import { useEffect, useRef, useState } from 'react';
import { en } from '@/locale/en-GB';
import './VotingCircleScreen.css';

type VoteSeat = { id: string; name: string };

type VotingCircleScreenProps = {
  speakerSeatId: string | null;
  viewerSeatId: string | null;
  ownVoteTargetName: string | null;
  ballots: Record<string, string>;
  seats: VoteSeat[];
  onReveal: () => void;
  isPending: boolean;
};

export function fitVoteCardNameFontSize(
  name: string,
  viewportWidth: number,
  viewportHeight: number,
): number {
  const width = Math.max(1, viewportWidth - 48);
  const shortestSide = Math.max(1, Math.min(viewportWidth, viewportHeight));
  const characterCount = Math.max(1, Array.from(name.trim()).length);
  const viewportFit = shortestSide * 0.2;
  const widthFit = width / (characterCount * 0.62);
  return Math.floor(Math.max(16, Math.min(192, viewportFit, widthFit)));
}

export function VotingCircleScreen({
  speakerSeatId,
  viewerSeatId,
  ownVoteTargetName,
  ballots,
  seats,
  onReveal,
  isPending,
}: VotingCircleScreenProps) {
  const speaker = seats.find((seat) => seat.id === speakerSeatId);
  const viewerHasRevealed =
    viewerSeatId !== null && ballots[viewerSeatId] !== undefined;
  const isMyTurn = speakerSeatId !== null && speakerSeatId === viewerSeatId;
  const [showingFullScreenCard, setShowingFullScreenCard] = useState(false);
  const closeVoteCardButton = useRef<HTMLButtonElement>(null);
  const presenter = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const tally = new Map<string, { name: string; count: number }>();
  const canShowVoteCard =
    Boolean(ownVoteTargetName) && isMyTurn && !viewerHasRevealed;
  const nameFontSize =
    viewportSize.width > 0 && viewportSize.height > 0 && ownVoteTargetName
      ? fitVoteCardNameFontSize(
          ownVoteTargetName,
          viewportSize.width,
          viewportSize.height,
        )
      : undefined;

  useEffect(() => {
    const updateViewport = () => {
      const viewport = window.visualViewport;
      setViewportSize({
        width: viewport?.width ?? window.innerWidth,
        height: viewport?.height ?? window.innerHeight,
      });
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);
    window.visualViewport?.addEventListener('resize', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
      window.visualViewport?.removeEventListener('resize', updateViewport);
    };
  }, []);

  useEffect(() => {
    if (!showingFullScreenCard) return;

    closeVoteCardButton.current?.focus();
    const inerted: Array<{
      element: HTMLElement;
      wasInert: boolean;
      previousAriaHidden: string | null;
    }> = [];
    let branch: HTMLElement | null = presenter.current;
    const dialogParent = presenter.current?.parentElement;
    while (branch?.parentElement) {
      const parent = branch.parentElement;
      if (parent !== dialogParent) {
        for (const child of Array.from(parent.children)) {
          if (!(child instanceof HTMLElement) || child === branch) continue;
          inerted.push({
            element: child,
            wasInert: child.inert,
            previousAriaHidden: child.getAttribute('aria-hidden'),
          });
          child.inert = true;
          child.setAttribute('aria-hidden', 'true');
        }
      }
      if (parent === document.body) break;
      branch = parent;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeFullScreenCard();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        closeVoteCardButton.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      for (const item of inerted) {
        item.element.inert = item.wasInert;
        if (item.previousAriaHidden === null) {
          item.element.removeAttribute('aria-hidden');
        } else {
          item.element.setAttribute('aria-hidden', item.previousAriaHidden);
        }
      }
    };
  }, [showingFullScreenCard]);

  async function openFullScreenCard() {
    setShowingFullScreenCard(true);
    const root = document.documentElement;
    try {
      if (
        !document.fullscreenElement &&
        typeof root.requestFullscreen === 'function'
      ) {
        await root.requestFullscreen();
      }
    } catch {
      // The overlay remains usable when fullscreen is unavailable.
    }
    try {
      const orientation = window.screen.orientation as unknown as {
        lock?: (value: 'landscape') => Promise<void>;
      };
      await orientation?.lock?.('landscape');
    } catch {
      // iOS Safari and some browser states do not permit orientation locking.
    }
  }

  function closeFullScreenCard() {
    setShowingFullScreenCard(false);
    if (
      document.fullscreenElement &&
      typeof document.exitFullscreen === 'function'
    ) {
      void document.exitFullscreen().catch(() => undefined);
    }
    try {
      const orientation = window.screen.orientation as unknown as {
        unlock?: () => void;
      };
      orientation?.unlock?.();
    } catch {
      // Unlocking is optional and unsupported on some devices.
    }
  }

  for (const targetId of Object.values(ballots)) {
    const target = seats.find((seat) => seat.id === targetId);
    if (!target) continue;
    const current = tally.get(target.id);
    tally.set(target.id, {
      name: target.name,
      count: (current?.count ?? 0) + 1,
    });
  }

  return (
    <section
      className="voting-circle mt-6"
      aria-labelledby="voting-circle-heading"
      data-testid="voting-circle"
    >
      <div aria-hidden={showingFullScreenCard} inert={showingFullScreenCard}>
        <h2
          id="voting-circle-heading"
          className="display text-2xl text-candle sm:text-3xl"
        >
          {en.game.voteCircleHeading}
        </h2>
        <p className="mt-2 text-base text-ash">
          {en.game.voteCircleInstruction}
        </p>

        {ownVoteTargetName &&
          (canShowVoteCard ? (
            <button
              className="vote-circle-card"
              type="button"
              aria-label={`${en.game.voteCircleCardLabel} ${ownVoteTargetName}. ${en.game.voteCircleFullScreen}`}
              data-testid="vote-circle-card"
              onClick={() => void openFullScreenCard()}
            >
              <span className="text-base">{en.game.voteCircleCardLabel}</span>
              <strong className="display">{ownVoteTargetName}</strong>
              <span className="vote-circle-card__action">
                {en.game.voteCircleFullScreen}
              </span>
            </button>
          ) : (
            <div
              className="vote-circle-card"
              aria-label={`${en.game.voteCircleCardLabel} ${ownVoteTargetName}`}
              data-testid="vote-circle-card"
            >
              <span className="text-base">{en.game.voteCircleCardLabel}</span>
              <strong className="display">{ownVoteTargetName}</strong>
            </div>
          ))}

        <p className="mt-4 text-base text-ash" role="status" aria-live="polite">
          {isMyTurn
            ? en.game.voteCircleYourTurn
            : speaker
              ? en.game.voteCircleWaitingFor(speaker.name)
              : en.game.voteCircleEveryoneDone}
        </p>

        {isMyTurn && !viewerHasRevealed && (
          <button
            className="primary-action mt-4 min-h-11 w-full"
            type="button"
            onClick={onReveal}
            disabled={isPending}
          >
            {en.game.voteCircleRevealButton}
          </button>
        )}

        <section className="mt-6" aria-label={en.game.voteCircleTally}>
          <h3 className="text-lg text-candle">{en.game.voteCircleTally}</h3>
          {tally.size ? (
            <ul className="mt-2 grid gap-2">
              {[...tally.values()]
                .sort((left, right) => left.name.localeCompare(right.name))
                .map(({ name, count }) => (
                  <li
                    className="border-b border-stone py-2 text-base text-ash"
                    key={name}
                  >
                    {en.game.voteTally(count, name)}
                  </li>
                ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-ash">
              {en.game.voteCircleNoVotesYet}
            </p>
          )}
        </section>
      </div>

      {showingFullScreenCard && ownVoteTargetName && (
        <div
          ref={presenter}
          className="vote-circle-presenter"
          role="dialog"
          aria-modal="true"
          aria-labelledby="vote-circle-presenter-name"
          data-testid="vote-circle-fullscreen"
        >
          <button
            ref={closeVoteCardButton}
            className="vote-circle-presenter__close"
            type="button"
            onClick={closeFullScreenCard}
          >
            {en.game.voteCircleCloseCard}
          </button>
          <div className="vote-circle-presenter__content">
            <p>{en.game.voteCircleCardLabel}</p>
            <h2
              className="display"
              id="vote-circle-presenter-name"
              data-testid="vote-circle-fullscreen-name"
              style={
                nameFontSize ? { fontSize: `${nameFontSize}px` } : undefined
              }
            >
              {ownVoteTargetName}
            </h2>
            <p
              className="vote-circle-presenter__orientation-hint"
              data-testid="vote-circle-orientation-hint"
            >
              {en.game.voteCircleOrientationHint}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
