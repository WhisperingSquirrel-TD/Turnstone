import { describe, expect, it } from 'vitest';
import { config } from '../artifacts/party-game/src/config';
import {
  getPublicFacts,
  getPublicTitle,
  renderLlmsTxt,
  renderPublicCompareHtml,
  renderPublicFaqHtml,
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

  it('includes visible hold text in the public role demo accessible name', () => {
    const html = renderPublicHomeHtml();
    expect(html).toContain(
      'aria-labelledby="home-demo-heading home-demo-seal-label"',
    );
    expect(html).toContain('id="home-demo-seal-label"');
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

  it('uses the exact approved additional FAQs on every public content surface', () => {
    const additionalFaqs = [
      {
        question: 'Is there a free alternative to the WhatsApp traitors game?',
        answer:
          'Yes. Chat versions play out as messages over a week, charge per player and limit numbers. Turnstone is different: it is free for everyone, with no per-player tickets; it takes up to 40 players, and families with children can play together; you play face to face in one room, with phones used only for secrets; there are no phone numbers or group chats, just a code and a first name; secrets stay secret with hold-to-reveal and identical screens for every role; and it works anywhere, for an hour or a fortnight.',
      },
      {
        question: 'Is Turnstone the official game from the TV show?',
        answer:
          'No. Turnstone is an independent game made by Stackstone Consulting. It is not affiliated with, or endorsed by, any TV programme or its producers.',
      },
      {
        question: 'Do I need WhatsApp or an app?',
        answer:
          'No. Turnstone runs in any modern phone or tablet browser. You can add it to your Home Screen if you like, but you never have to.',
      },
    ];
    const html = renderPublicHomeHtml();
    const faqHtml = renderPublicFaqHtml();
    const compareHtml = renderPublicCompareHtml();
    const llmsText = renderLlmsTxt();
    const faqPage = structuredPublicData({ includeFaqPage: true }).find(
      (item) => item['@type'] === 'FAQPage',
    );
    for (const faq of additionalFaqs) {
      expect(html).toContain(faq.question);
      expect(html).toContain(faq.answer);
      expect(faqHtml).toContain(faq.question);
      expect(faqHtml).toContain(faq.answer);
      expect(compareHtml).toContain(faq.question);
      expect(compareHtml).toContain(faq.answer);
      expect(llmsText).toContain(faq.question);
      expect(llmsText).toContain(faq.answer);
      expect(faqPage?.mainEntity).toContainEqual({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: { '@type': 'Answer', text: faq.answer },
      });
    }
  });

  it('renders all three public entry choices in the prerendered home page', () => {
    const html = renderPublicHomeHtml();
    expect(html).toContain('Start a new game');
    expect(html).toContain('Join a game');
    expect(html).toContain('Practise alone first');
  });
});
