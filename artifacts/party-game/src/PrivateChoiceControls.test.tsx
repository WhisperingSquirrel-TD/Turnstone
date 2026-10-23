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
});
