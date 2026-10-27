import { createContext, useContext } from 'react';
import { config } from '@/config';
import { en } from '@/locale/en-GB';

export const BrandSurfaceContext = createContext<'light' | 'dark'>('dark');

interface BrandFooterProps {
  context: 'public' | 'game';
  surface?: 'light' | 'dark';
  className?: string;
  testId?: string;
  /** Adds the Report an issue email link beside the credit. */
  reportLink?: boolean;
}

export function BrandFooter({
  context,
  surface,
  className = '',
  testId,
  reportLink = false,
}: BrandFooterProps) {
  const opensInNewTab = context === 'game';
  const inheritedSurface = useContext(BrandSurfaceContext);
  const iconSurface = surface ?? inheritedSurface;
  const iconPath =
    iconSurface === 'light'
      ? config.stackstoneIcons.onLight
      : config.stackstoneIcons.onDark;
  const classes = ['brand-credit', className].filter(Boolean).join(' ');

  return (
    <footer className={classes} data-testid={testId}>
      <a
        className="brand-credit-link"
        href={config.organisation.url}
        target={opensInNewTab ? '_blank' : undefined}
        rel={opensInNewTab ? 'noopener noreferrer' : undefined}
        aria-label={en.app.brandLink}
        data-testid="brand-footer-link"
      >
        <small>{config.byline}</small>
        <img
          className="brand-mark-small"
          src={`${import.meta.env.BASE_URL}${iconPath}`}
          alt="Stackstone Consulting"
          width="24"
          height="24"
        />
      </a>
      {reportLink && (
        <a
          className="brand-report-link"
          href={config.feedbackMailto}
          data-testid="report-issue-link"
        >
          {en.app.reportIssue}
        </a>
      )}
    </footer>
  );
}
