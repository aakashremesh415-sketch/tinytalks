import { FAQ_ITEMS } from './faq.js';

// The crawlable marketing copy for the homepage — deliberately a plain,
// stateless, hook-free component (no router, no auth context) so it can
// be rendered two ways from the exact same source: normally, inside
// Landing.jsx for real visitors, and separately at build time via
// react-dom/server in scripts/prerender.mjs, which bakes this same
// markup into dist/index.html so crawlers and link-preview bots that
// don't execute JavaScript (most social-media unfurlers, some AI answer
// engines) still see real text instead of an empty <div id="root">.
// Because both call sites render this one component, the live page and
// the prerendered snapshot can never drift out of sync with each other.
export default function LandingSeoContent() {
  return (
    <div className="prose-seo">
      <h1 className="font-display text-4xl sm:text-5xl font-extrabold leading-tight text-slate-900 dark:text-slate-100">
        Talk to someone new.
        <span className="block bg-brand-gradient bg-clip-text text-transparent">
          Encrypted. Anonymous. Real.
        </span>
      </h1>
      <p className="mt-5 text-slate-500 dark:text-slate-400 text-lg max-w-xl">
        tinytalks.live is a free <strong>random chat app</strong> that pairs you with a
        real stranger for a private, one-on-one conversation — no account, no phone
        number, and no email required to start. Every message is{' '}
        <strong>end-to-end encrypted</strong> on your device, so not even tinytalks can
        read what you send.
      </p>

      <h2 className="mt-10 font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
        How tinytalks works
      </h2>
      <ol className="mt-4 space-y-3 text-slate-500 dark:text-slate-400 list-decimal list-inside marker:text-violet-400 marker:font-semibold">
        <li>
          Confirm you're 18 or older and start chatting instantly as a guest — you'll
          get a random display name automatically — or create a free account to keep
          your chat history and friends across visits.
        </li>
        <li>
          Pick who you'd like to be matched with — anyone, men, women, or non-binary —
          and optionally add interests or a general location so tinytalks can prefer
          similar matches.
        </li>
        <li>
          Get paired with a real person in seconds and start an{' '}
          <strong>end-to-end encrypted</strong> text conversation.
        </li>
        <li>
          Like talking to someone? Add them as a friend to chat again later, or move on
          to a new random match any time.
        </li>
      </ol>

      <h2 className="mt-10 font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
        Why people choose tinytalks
      </h2>
      <ul className="mt-4 space-y-3 text-slate-500 dark:text-slate-400 list-disc list-inside marker:text-violet-400">
        <li>
          <strong className="text-slate-900 dark:text-slate-100">Real end-to-end encryption</strong> — messages
          are encrypted on your device before they're ever sent; tinytalks' own servers
          only see ciphertext.
        </li>
        <li>
          <strong className="text-slate-900 dark:text-slate-100">No account required</strong> — start an
          anonymous chat with strangers as a guest; guest data is permanently deleted
          after 2 days.
        </li>
        <li>
          <strong className="text-slate-900 dark:text-slate-100">Gender and interest matching</strong> — free
          filters to match with the gender you prefer, plus optional interests and
          location tags for better matches.
        </li>
        <li>
          <strong className="text-slate-900 dark:text-slate-100">Safer photo sharing</strong> —
          self-destructing, encrypted image sharing unlocked only after a quick,
          ID-free verification step.
        </li>
        <li>
          <strong className="text-slate-900 dark:text-slate-100">Real moderation</strong> — instant one-way
          blocking plus a human-reviewed report queue, not a black box.
        </li>
      </ul>

      <h2 className="mt-10 font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
        Frequently asked questions
      </h2>
      <dl className="mt-4 space-y-5">
        {FAQ_ITEMS.map((item) => (
          <div key={item.question}>
            <dt className="font-display font-semibold text-slate-900 dark:text-slate-100">
              {item.question}
            </dt>
            <dd className="mt-1 text-sm text-slate-500 dark:text-slate-400">{item.answer}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
