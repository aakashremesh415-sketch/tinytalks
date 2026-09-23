// Single source of truth for the FAQ shown on the landing page AND the
// FAQPage JSON-LD structured data (client/src/content/seoJsonLd.js) — kept
// in one file so the two can never drift apart, which matters because
// Google's FAQ rich-result guidelines require the structured data to
// match what's actually visible on the page. Every answer here is a
// factual description of something the app actually does — written for
// both humans and AI answer engines to be able to lift verbatim.
export const FAQ_ITEMS = [
  {
    question: 'What is tinytalks?',
    answer:
      'tinytalks is a free random chat app that connects you with a real stranger for a private, one-on-one conversation. There is no account required to start — you can begin chatting as a guest in seconds.',
  },
  {
    question: 'Is tinytalks free to use?',
    answer:
      'Yes. Starting a random chat, sending text messages, and using the gender-preference matching filter are all free.',
  },
  {
    question: 'Is tinytalks anonymous?',
    answer:
      'Yes. You can chat as a guest with no email, phone number, or real name required — guests are given a random display name automatically. Guest accounts and their data are permanently deleted after 2 days.',
  },
  {
    question: 'Are messages on tinytalks private?',
    answer:
      "Messages are only ever visible to you and the person you're chatting with, plus our moderation team in the specific case where one of you submits a report — reviewing reported content is what lets us actually act on abuse instead of operating as a black box.",
  },
  {
    question: 'Can I choose who I match with?',
    answer:
      'Yes. You can set a gender-matching preference (anyone, men, women, or non-binary) and add optional location tags or interests, which tinytalks uses as a soft preference when finding your next chat partner.',
  },
  {
    question: 'Can I send photos on tinytalks?',
    answer:
      'Yes, after a quick, free, ID-free verification step. Photos self-destruct after a one-time view or a short timer, so they are not kept around after your chat.',
  },
  {
    question: 'Can I add someone as a friend and talk to them again?',
    answer:
      "Yes. If you enjoy a conversation, you can send a friend request from that chat. Once accepted, you can start a new conversation with that person any time, separately from tinytalks' random matching.",
  },
  {
    question: 'How do I stay safe while chatting with strangers?',
    answer:
      'tinytalks lets you block anyone instantly — they will never be matched with you again — and report a conversation to a real, human-reviewed moderation queue. Never share personal information like your address, financial details, or passwords with someone you have just met.',
  },
];
