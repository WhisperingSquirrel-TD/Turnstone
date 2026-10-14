import { describe, expect, it } from 'vitest';
import { config } from '../artifacts/party-game/src/config';
import {
  getPublicFacts,
  getPublicTitle,
  renderPublicHomeHtml,
  structuredPublicData,
} from '../artifacts/party-game/src/public-site-content';

describe('public-site shared content', () => {
  it('uses one facts source for the prerendered home page', () => {
    const facts = getPublicFacts();
    const html = renderPublicHomeHtml();
    for (const fact of facts) {
      expect(html).toContain(fact.label);
      expect(html).toContain(fact.value);
    }
    expect(facts.map((fact) => fact.value)).toEqual([
      '5 to 40 players',
      'One hour to two weeks',
      'Any modern phone or tablet browser',
      'Free',
      'Privacy shield designed for private reveals',
      config.builder,
    ]);
  });

  it('contains the exact answer-first copy and all required FAQ questions', () => {
    const html = renderPublicHomeHtml();
    expect(html).toContain(
      'Turnstone is a free game of traitors and faithful for 5 to 40 players, played on everyone’s own phone, where the host plays too.',
    );
    for (const question of [
      'How do we play a traitor game at home with 15 people?',
      'Is there a traitor game where nobody has to host?',
      'What is a good game for a big family gathering?',
      'Is there a party game where everyone gets a secret role on their phone?',
      'Is there a team-building game like this for 30 or 40 people?',
      'Is there a free alternative to boxed traitor games that takes more players?',
      'Can children and grandparents play?',
      'How long does a game take?',
    ]) {
      expect(html).toContain(question);
    }
    expect(html).toContain('How it works');
    expect(html).toContain('Quick');
    expect(html).toContain('Multi-day');
  });

  it('builds the required title and WebApplication and Game structured data', () => {
    expect(getPublicTitle()).toBe(
      'Turnstone: a free game of traitors and faithful for 5 to 40 players',
    );
    expect(structuredPublicData()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          '@type': 'WebApplication',
          name: config.appName,
          applicationCategory: 'GameApplication',
          operatingSystem: 'Any modern web browser',
        }),
        expect.objectContaining({
          '@type': 'Game',
          numberOfPlayers: expect.objectContaining({
            minValue: 5,
            maxValue: 40,
          }),
        }),
      ]),
    );
  });
});
