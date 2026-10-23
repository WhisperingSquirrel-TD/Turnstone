import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PendingCommandNotice } from './PendingCommandNotice';

describe('PendingCommandNotice', () => {
  it('shows the same waiting copy and Resend action regardless of role', () => {
    const onResend = vi.fn();
    const markup = renderToStaticMarkup(
      <PendingCommandNotice onResend={onResend} />,
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain(
      'Waiting to send. Your action has not been confirmed.',
    );
    expect(markup).toContain('>Resend</button>');
    expect(onResend).not.toHaveBeenCalled();
  });

  it('disables Resend while the original request is still in flight', () => {
    const markup = renderToStaticMarkup(
      <PendingCommandNotice disabled onResend={() => {}} />,
    );

    expect(markup).toContain('disabled=""');
  });
});
