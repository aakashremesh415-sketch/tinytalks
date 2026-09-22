import { FAQ_ITEMS } from './faq.js';

const SITE_URL = 'https://tinytalks.live';

// Combined structured data for the homepage: WebSite + Organization +
// WebApplication + FAQPage, all in one @graph so search engines and AI
// answer engines can resolve the entity relationships between them. Kept
// as a plain builder function (rather than static JSON) so it always
// reads FAQ_ITEMS from the same file the visible FAQ section renders
// from — see content/faq.js.
export function buildLandingJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: 'tinytalks.live',
        description:
          'A free, anonymous, end-to-end encrypted random chat app for talking to strangers.',
      },
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: 'tinytalks.live',
        url: SITE_URL,
        logo: `${SITE_URL}/favicon.svg`,
      },
      {
        '@type': 'WebApplication',
        '@id': `${SITE_URL}/#webapplication`,
        name: 'tinytalks',
        url: SITE_URL,
        applicationCategory: 'SocialNetworkingApplication',
        operatingSystem: 'Any (web browser)',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
        description:
          'A free random chat app for anonymous, end-to-end encrypted conversations with strangers. No account required to start.',
      },
      {
        '@type': 'FAQPage',
        '@id': `${SITE_URL}/#faq`,
        mainEntity: FAQ_ITEMS.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.answer,
          },
        })),
      },
    ],
  };
}
