import { config } from '@/config';
import { en } from '@/locale/en-GB';

interface BrandFooterProps {
  context: 'public' | 'game';
  className?: string;
  testId?: string;
}

export function BrandFooter({
  context,
  className = '',
  testId,
}: BrandFooterProps) {
  const opensInNewTab = context === 'game';
  const classes = ['brand-credit', className].filter(Boolean).join(' ');

  return (
    <footer className={classes} data-testid={testId}>
      <small>{config.byline}</small>
      <a
        className="brand-credit-link"
        href={config.organisation.url}
        target={opensInNewTab ? '_blank' : undefined}
        rel={opensInNewTab ? 'noopener noreferrer' : undefined}
        aria-label={en.app.brandLink}
        data-testid="brand-footer-link"
      >
        <img
          className="brand-mark-small"
          src={`${import.meta.env.BASE_URL}${config.appIconPath}`}
          alt=""
          width="24"
          height="24"
        />
      </a>
    </footer>
  );
}
