import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PrivateChoiceControls } from './PrivateChoiceControls';

describe('PrivateChoiceControls waiting state', () => {
  it('shows the shared Waiting to send notice and Resend instead of duplicate confirmation copy', () => {
    const markup = renderToStaticMarkup(
      <PrivateChoiceControls
        choices={[{ id: 'seat-2', name: 'Alex' }]}
        selected="seat-2"
        confirmChoice
        choiceSelectionLocked
        choiceSubmitted={false}
        isPending={false}
        waitingToSend
        hasToken
        commandMessage="uncertain response"
        onSelect={() => {}}
        onReview={() => {}}
        onConfirm={() => {}}
        onChooseAgain={() => {}}
        onResend={vi.fn()}
      />,
    );

    expect(markup).toContain(
      'Waiting to send. Your action has not been confirmed.',
    );
    expect(markup).toContain('>Resend</button>');
    expect(markup).not.toContain('uncertain response');
    expect(markup).not.toContain('Choose again');
  });

  it('hides progress labels on unselected vote rows and marks the viewer as You', () => {
    const markup = renderToStaticMarkup(
      <PrivateChoiceControls
        choices={[
          { id: 'seat-alex', name: 'Alex' },
          { id: 'seat-blair', name: 'Blair' },
        ]}
        selected="seat-alex"
        confirmChoice={false}
        isPending={false}
        voteProgressRows={[
          { id: 'seat-alex', name: 'Alex', hasVoted: false },
          { id: 'seat-blair', name: 'Blair', hasVoted: true },
          { id: 'seat-viewer', name: 'Morgan', hasVoted: false },
        ]}
        viewerSeatId="seat-viewer"
        hasToken
        commandMessage=""
        onSelect={() => {}}
        onReview={() => {}}
        onConfirm={() => {}}
        onChooseAgain={() => {}}
      />,
    );

    expect(markup).toMatch(
      /data-testid="vote-self-status"[\s\S]*?>You<\/span>/,
    );
    expect(markup).not.toContain('>Waiting</span>');
    expect(markup).not.toContain('>Voted</span>');
    expect(markup).toContain('>Selected</span>');
  });
});
