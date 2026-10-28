import { config } from './config';
import { en } from './locale/en-GB';

const missionFaqSentence =
  'Players complete missions, build the prize pot, discuss suspicions and vote together.';
const missionStep =
  'Complete missions, build the prize pot, discuss suspicions and vote together.';
const missionQuickFormat =
  'A fast game for one gathering, with short discussions and simple missions.';

/**
 * The single source of public copy (D27, D66). While missions are switched
 * off (D119) it drops every mention of missions and the prize pot and adds
 * one line saying missions are coming soon.
 */
export function publicSiteCopy(
  missionsAvailable: boolean = config.missionsAvailable,
) {
  const site = en.publicSite;
  if (missionsAvailable) return { ...site, missionsNotice: null };
  return {
    ...site,
    faq: site.faq.map((item) => ({
      ...item,
      answer: item.answer.replace(missionFaqSentence, site.betaFaqGroupPlay),
    })),
    howItWorks: site.howItWorks.map((step) =>
      step.body === missionStep ? { ...step, body: site.betaGroupPlay } : step,
    ),
    formats: site.formats.map((format) =>
      format.description === missionQuickFormat
        ? { ...format, description: site.betaQuickFormat }
        : format,
    ),
    missionsNotice: site.missionsComingSoon as string | null,
  };
}
