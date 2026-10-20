import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NightChoiceScreen } from './NightChoiceScreen';
import type { PrivateChoiceControlsProps } from './PrivateChoiceControls';

const controls: PrivateChoiceControlsProps = {
  choices: [{ id: 'seat-a', name: 'Alex' }],
  selected: '',
  confirmChoice: false,
  isPending: false,
  hasToken: true,
  commandMessage: '',
  onSelect: () => {},
  onReview: () => {},
  onConfirm: () => {},
  onChooseAgain: () => {},
};

describe('NightChoiceScreen', () => {
  it('keeps the current choice, four status lines and tap controls together', () => {
    const html = renderToString(
      <NightChoiceScreen
        {...controls}
        taskInstruction="Complete tonight's task."
        slotLabel="First choice"
        prompt="Who will the Traitors take tonight?"
        statusLines={[
          'You picked: Alex',
          'Blair picked: Casey',
          'Waiting for Drew',
          'You can change your pick until the night ends.',
        ]}
      />,
    );
    const statusMarkup = html.match(
      /data-testid="shadow-status"[^>]*>([\s\S]*?)<\/div>/,
    )?.[1];

    expect(html).toContain('data-testid="shadow-slot-label"');
    expect(html).toContain('First choice');
    expect(html).toContain('Who will the Traitors take tonight?');
    expect(html).toContain('Complete tonight&#x27;s task.');
    expect(statusMarkup).toBeDefined();
    expect(statusMarkup?.match(/<p(?:\s|>)/g)).toHaveLength(4);
    expect(html).toContain('data-testid="private-choice-list"');
    expect(html).toContain('Alex');
    expect(html).not.toContain('Shield your screen');
    expect(html).not.toContain('rehearsal-explanation-copy');
    expect(html).not.toContain('button-hold-reveal');
  });

  it('keeps the keep-or-change confirmation inline with the active choice', () => {
    const html = renderToString(
      <NightChoiceScreen
        {...controls}
        selected="seat-a"
        confirmChoice
        slotLabel="Second choice"
        prompt="Who will the Traitors take tonight?"
        statusLines={['First pick: Alex', 'Waiting for everyone', '', '']}
      />,
    );

    expect(html).toContain('Your pick: Alex');
    expect(html).toContain('Confirm this choice?');
    expect(html).toContain('Confirm');
    expect(html).toContain('Choose again');
    expect(html.match(/class="enter"/g)).toHaveLength(1);
    expect(html).not.toContain('<dialog');
  });

  it('keeps submitted night picks changeable without repeat controls for either role', () => {
    const roleViews = [
      {
        prompt: 'Who will the Traitors take tonight?',
        statusLines: [
          'You picked: Alex',
          'Blair picked: Casey',
          'Waiting for Drew',
          'You can change your pick until the night ends.',
        ],
      },
      {
        prompt: 'Who do you think the Traitors will take tonight?',
        statusLines: [
          'Your guess: Alex',
          'Guesses stay secret until the end.',
          'Think about who the Traitors fear most.',
          'You can change your guess until the night ends.',
        ],
      },
    ];

    for (const roleView of roleViews) {
      const html = renderToString(
        <NightChoiceScreen
          {...controls}
          selected="seat-a"
          actionDone
          slotLabel="First choice"
          prompt={roleView.prompt}
          statusLines={roleView.statusLines}
        />,
      );

      expect(html).toContain(roleView.statusLines[0]!);
      expect(html).toContain('data-testid="private-choice-list"');
      expect(html).toContain('data-testid="selected-choice"');
      expect(html).not.toContain('Review this choice');
      expect(html).not.toContain('Confirm');
    }
  });

  it('uses the same fixed four-line status area for Traitor and Faithful prompts', () => {
    const renderNight = (prompt: string, statusLines: string[]) =>
      renderToString(
        <NightChoiceScreen
          {...controls}
          slotLabel="First choice"
          prompt={prompt}
          statusLines={statusLines}
        />,
      );
    const traitorHtml = renderNight('Who will the Traitors take tonight?', [
      "You haven't picked yet",
      'Waiting for Sam',
      '',
      'You can change your pick until the night ends.',
    ]);
    const faithfulHtml = renderNight(
      'Who do you think the Traitors will take tonight?',
      [
        "You haven't guessed yet",
        'Guesses stay secret until the end.',
        'Think about who the Traitors fear most.',
        'You can change your guess until the night ends.',
      ],
    );
    const statusMarkup = (html: string) =>
      html.match(/data-testid="shadow-status"[^>]*>([\s\S]*?)<\/div>/)?.[1];

    const traitorStatus = statusMarkup(traitorHtml);
    const faithfulStatus = statusMarkup(faithfulHtml);
    expect(traitorHtml).toContain('h-20 grid-rows-4');
    expect(faithfulHtml).toContain('h-20 grid-rows-4');
    expect(traitorStatus?.match(/<p(?:\s|>)/g)).toHaveLength(4);
    expect(faithfulStatus?.match(/<p(?:\s|>)/g)).toHaveLength(4);
    expect(
      traitorHtml.match(/data-testid="private-choice-list"/g),
    ).toHaveLength(1);
    expect(
      faithfulHtml.match(/data-testid="private-choice-list"/g),
    ).toHaveLength(1);
  });
});
