# DollarSeeds — Launch Checklist

**Target launch date:** Friday, July 24, 2026
**Today:** July 8, 2026 — **16 days out**
**Owner:** Lucas Fracasso Custodio

Two lists below: (1) everything that must be **done before launch**, grouped by the five areas, and (2) everything that should be **happening on a recurring basis** from now through launch. Items you already named are marked ✅ *(you listed this)*. Items I added from auditing the code + past sessions are marked 🔎 *(gap I found)*.

---

## ⚠️ Critical path — the 3 things most likely to slip July 24

1. **Onboarding + checking-balance capture** — this is net-new UI *and* backend wiring, not a tweak. It's the biggest dev risk to the date. Build + test it first.
2. **Igor's Gratitude mini-series** — records Saturday (Jul 11), then needs edit + upload before it can ship in-app. Tight but doable.
3. **Production builds + store review** — Apple review can take 1–3 days (sometimes longer for a finance app on first submission). You must submit the final build by ~**Jul 20–21** to safely hit Jul 24. Google is usually faster but first-time reviews can also take days.

Everything else is parallelizable around these three.

---

# LIST 1 — Complete Before Launch

## 1. App Development

- [ ] ✅ **Onboarding flow** — first-run screens after signup. *(No onboarding screen exists in the code yet — only a `BudgetTypeSelector` component references it. This is a build-from-scratch item.)*
- [ ] ✅ **Checking-account balance capture** — ask new users their current checking balance; deposit it into general savings on first run.
  - 🔎 Needs backend wiring: there's no "starting balance" endpoint today. Either add one or seed it through the existing `POST /savings/transaction/`. Decide and implement.
  - 🔎 Add clear copy: "This is the amount in your bank app — not money already in a savings/retirement account (e.g. Roth IRA)." Matches your intended scope.
- [ ] ✅ **Igor's Generosity mini-series** — record (Sat Jul 11) → edit → upload to the lessons storage bucket → verify it plays in the Lessons tab.
- [ ] 🔎 **Final production builds (EAS)** for iOS + Android with the new features. Bump `version` (currently `1.0.0`) and build number.
- [ ] 🔎 **iOS 26 SDK check** — since Apr 28, 2026 every App Store submission must be built with the iOS 26 SDK. Confirm your Expo SDK 54 / EAS build targets it (it should, but verify before submitting).
- [x] ✅ **Render backend always-on** — on a paid Render instance (no cold starts / downtime). No action needed.
- [ ] 🔎 **Full QA pass** — test onboarding → add income/expense → savings transfer → rollover → lessons on a real iOS and a real Android device. Promote to TestFlight + Play internal testing and have a few people run through it before you promote to production.
- [ ] 🔎 **Verify analytics + crash reporting in production** — confirm PostHog events fire and Sentry catches errors in the production build (both are wired in per the last commit).
- [ ] 🔎 **Push-notification reminders** — `expo-notifications` is configured but I found no scheduling code. Either implement the daily reminder or drop the "sends daily reminders" claim from the app.json usage string so it matches reality. *(Optional for launch — decide.)*

## 2. App Store & Google Play Listing

- [ ] 🔎 **Store screenshots** — required sizes for iPhone (6.9"/6.7") and, because `supportsTablet: true`, **iPad** screenshots too. Either produce iPad shots or set `supportsTablet: false` to avoid the requirement. Android needs phone screenshots + feature graphic (1024×500).
- [ ] 🔎 **Listing copy** — app name, subtitle, description, keywords (ASO), promotional text, support URL, marketing URL. Privacy Policy URL is ready (deployed).
- [ ] 🔎 **Apple App Privacy labels** — fill in App Store Connect. Per your privacy work: "No" to tracking/IDFA; declare Contact Info + Identifiers (app functionality) and Usage/Diagnostics (analytics).
- [ ] 🔎 **Google Play Data Safety form** — same substance as above; declare that financial data is never sold or shared with analytics/advertisers.
- [ ] 🔎 **Age rating questionnaire (both stores)** — confirm **13+**, not child-directed / made-for-kids. Set Google Play "Target audience & content" to **13 and older**. (You flagged this earlier — close it out here.)
- [ ] 🔎 **Category = Finance**, pricing = Free, content rating (Google IARC) questionnaire completed.
- [ ] 🔎 **Promote to production** — move from TestFlight/Play internal testing to a production release and **submit for review** (aim: submit by Jul 20–21).

## 3. Legal

- [ ] ✅/🔎 **Lawyer skim** of the liability + governing-law clauses (Florida) — you said you'd do this. A finance app makes it worth it; schedule it this week so it's not the thing holding up submission.
- [ ] 🔎 **Confirm Privacy + Terms are live** at `/privacy` and `/terms` (Apple/Google fetch these during review) and that both are linked in-app (Settings). Account-deletion button already exists ✅.
- [ ] 🔎 **App Store Accountability / age-verification laws (Jan 1, 2026 — TX, UT, LA)** — new state laws require age signals + parental consent for minors via Apple's Declared Age Range API and Google's Play Age Signals API. Since you're 13+ and collect data, confirm whether you must integrate these signals or can rely on the 13+ gate. Worth a direct question to Apple/Google or your lawyer.
- [ ] 🔎 **COPPA** — stay out of the under-13 bucket (your PostHog analytics isn't child-safe-certified). Keeping target audience at 13+ handles this.
- [ ] 🔎 **Trademark quick-check** — make sure "DollarSeeds" isn't already trademarked in the finance/app space before you put marketing money behind the name. Consider filing.
- [ ] 🔎 **Confirm disclaimers are present** — "not financial/investment/tax advice" and the faith-content disclaimer (both already in your Terms ✅).

## 4. Social Media (pre-launch setup)

- [ ] ✅ **Launch-date announcement video** — produce and post across channels.
- [ ] ✅ **Start the DollarSeeds YouTube channel** — set up today; brand it (banner, avatar, about, links).
- [ ] 🔎 **Lock profiles/handles** on every platform (YouTube, Instagram, TikTok, LinkedIn) with consistent name, logo, bio, and a link to the store listing / landing page.
- [ ] 🔎 **Prepare launch-day content in advance** — schedule the announcement + first feature post to go out July 24 so launch day isn't scramble.

## 5. Marketing & Outreach

- [ ] ✅ **Church partnerships** — Pastor (contacted ✅). Next: Atitude Church pastor, Coastal Community Church youth group, your church's youth group, and your dad's accountant/realtor contacts.
- [ ] 🔎 **Landing page ready for launch** — ensure store "Download" buttons/links are wired and live the moment the app is approved; add an email capture if not already there.
- [ ] 🔎 **Warm list / soft launch** — line up the friends & church contacts who'll download + review on day one (early ratings matter for store ranking).

---

# LIST 2 — Recurring (now through launch and beyond)

## Content cadence (weekly)

- [ ] ✅ **Weekly feature video**
- [ ] ✅ **Weekly verse post**
- [ ] ✅ **Weekly carousel post**
- [ ] ✅ **LinkedIn — 2 posts / week**
- [ ] ✅ **YouTube channel** — publish on a regular cadence (repurpose feature videos + verse content)
- [ ] 🔎 **Countdown posts** — leading up to Jul 24 (e.g. "1 week out," "3 days," "tomorrow," "we're live")

## One-time-but-scheduled

- [ ] ✅ **Launch-date announcement video** (post once, then boost)

## Outreach (ongoing)

- [ ] ✅ **Church & partner outreach** — work the list steadily: Atitude Church → Coastal youth group → your youth group → accountants/realtors. Track who's contacted, who replied, next step.

## Ops / dev (ongoing through launch)

- [ ] 🔎 **Monitor Sentry** for crashes as testers and early users come on
- [ ] 🔎 **Watch PostHog** for onboarding drop-off once real users arrive
- [ ] 🔎 **Watch the Render backend logs** on launch day (paid instance — no cold-start concern)

---

## Anything you might have missed (my short list)

The biggest **non-obvious gaps** I'd make sure you don't overlook: the **onboarding backend wiring** (there's no starting-balance endpoint yet), **iPad screenshots** (your build declares tablet support), the two **store privacy forms** (Apple App Privacy + Google Data Safety), and the **2026 age-verification laws** — none of these are on your original list but each can block or degrade launch.

---

*Sources for the 2026 store requirements: [Apple age ratings update](https://developer.apple.com/news/?id=ks775ehf) · [Apple upcoming requirements](https://developer.apple.com/news/upcoming-requirements/?id=07242025a) · [Google Play target audience](https://support.google.com/googleplay/android-developer/answer/9867159?hl=en) · [Google Play Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en) · [Google Play 2026 app-store law changes](https://support.google.com/googleplay/android-developer/answer/16569691?hl=en)*
