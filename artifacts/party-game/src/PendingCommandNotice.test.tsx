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

  it('shows the Retry-After countdown and keeps Resend disabled until then', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    try {
      const markup = renderToStaticMarkup(
        <PendingCommandNotice retryAfterUntil={61_000} onResend={() => {}} />,
      );

      expect(markup).toContain('Available to resend in 60 seconds.');
      expect(markup).toContain('disabled=""');
    } finally {
      vi.restoreAllMocks();
    }
  });
});
