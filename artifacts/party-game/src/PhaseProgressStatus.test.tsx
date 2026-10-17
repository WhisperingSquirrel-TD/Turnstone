import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { PhaseProgressStatus } from './PhaseProgressStatus';

it('renders progress at normal commentary size without absolute positioning', () => {
  const html = renderToStaticMarkup(
    <PhaseProgressStatus
      phase="DEAL"
      paused={false}
      done={0}
      total={6}
      compact
    />,
  );
  expect(html).toContain('0 of 6 are ready');
  expect(html).not.toContain('private-phase-progress');
  expect(html).not.toContain('text-sm');
});

it('does not show night progress or a counter on public announcements', () => {
  for (const phase of ['SHADOW', 'DEBATE', 'VERDICT', 'DAWN', 'FINISHED']) {
    expect(
      renderToStaticMarkup(
        <PhaseProgressStatus phase={phase} paused={false} done={6} total={6} />,
      ),
    ).toBe('');
  }
});
