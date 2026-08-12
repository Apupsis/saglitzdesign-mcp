---
id: privacy-consent-and-tracking
title: "Privacy, Consent & Tracking"
category: security
platform: web
tags: [security, privacy, gdpr, kvkk, consent, cookies, analytics, dark-patterns]
sources: ["https://www.edpb.europa.eu/system/files/2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en_0.pdf", "https://www.edpb.europa.eu/system/files/2023-01/edpb_20230118_report_cookie_banner_taskforce_en.pdf", "https://www.edpb.europa.eu/system/files/documents/files/file1/edpb_guidelines_202005_consent_en.pdf", "https://www.edpb.europa.eu/system/files/2023-12/edpb_letter_out20230098_feedback_on_cookie_pledge_draft_principles_en.pdf", "https://www.edpb.europa.eu/system/files/2021-03/edpb_statement_032021_eprivacy_regulation_en_0.pdf", "https://developer.mozilla.org/en-US/docs/Web/Privacy", "https://www.kvkk.gov.tr/Icerik/2037/Acik-Riza-Alirken-Dikkat-Edilecek-Hususlar", "https://www.kvkk.gov.tr/Icerik/5420/2018-90", "https://www.kvkk.gov.tr/Icerik/5412/Acik-Rizanin-Hizmet-Sartina-Baglanmasi", "https://www.kvkk.gov.tr/Icerik/5382/VERBIS", "https://www.kvkk.gov.tr/Icerik/7997/The-Procedures-And-Principles-For-The-Transfer-Of-Personal-Data-Abroad", "https://www.kvkk.gov.tr/Icerik/2046/Ilgili-Kisiler-Tarafindan-Yapilan-Basvurularin-Cevaplanmasi-Yukumlulugu"]
updated: 2026-08-12
---

# Privacy, Consent & Tracking

**This is engineering and design guidance, not legal advice.** Get a lawyer for your jurisdiction; get this document for the interface.

Consent is the only security control in this category that ships as a *component*. [[web-security-headers]] is a config file, [[auth-and-session-ux]] is a backend contract, [[frontend-attack-surface]] is a code review — but the consent decision is a modal with two buttons, a copy deck, and a load order, and it is designed by whoever had the sprint capacity. That is why the same three defects appear on almost every site: a banner that asks for consent it does not need, a reject path that is one click longer than the accept path, and a tracker that has already run by the time either button appears.

[[ethical-design]] covers deceptive patterns as a class. This document is the consent-specific application: what actually triggers the requirement, what a non-deceptive banner looks like as a build, and where the requirement lands in your bundle rather than in your privacy policy. Every claim below was verified against EDPB documents, KVKK guidance and MDN on 2026-08-12.

## What actually requires consent

The trigger is not "personal data" and it is not "cookies". It is **storing information on, or reading information from, the user's device**, for anything that is not the service they asked for.

EDPB Guidelines 2/2023 quote the operative exemption in Article 5(3) of the ePrivacy Directive verbatim:

> This shall not prevent any technical storage or access for the sole purpose of carrying out the transmission of a communication over an electronic communications network, or as strictly necessary in order for the provider of an information society service explicitly requested by the subscriber or user to provide the service.

Two exemptions, and the EDPB is explicit that there are only two — its feedback on the Commission's cookie pledge warns that the industry term "essential cookies" "may be misunderstood to cover more purposes than the two narrowly defined purposes which are exempt from the obligation to obtain consent pursuant to Article 5(3) ePrivacy Directive," and recommends replacing the word "essential" with "strictly necessary".

So the test for each storage item is a single question: **is this strictly necessary to deliver the thing the user asked for?**

| Item | Consent? | Why |
|---|---|---|
| Session cookie for a logged-in area | No | Strictly necessary for the service requested. Attributes belong to [[auth-and-session-ux]] |
| CSRF token, load-balancer affinity, fraud/security cookie tied to the requested service | No | Same test |
| Cookie remembering a cookie choice, language, or cart | No | The Cookie Banner Taskforce recalls that "cookies allowing website owners to retain the preferences expressed by users, regarding a service, should be deemed essential" |
| First-party analytics | **Yes** | Measures the site *for you*. Not the service the visitor requested |
| A/B testing and personalisation | **Yes** | Same |
| Advertising, retargeting, conversion pixels, ID sync | **Yes** | Same, plus third-party processing |
| Session replay, heatmaps, "product analytics" SDKs | **Yes** | Same, and they usually capture more than they claim |
| Embedded video, map, chat, font CDN that sets storage | **Yes** | It is storage on the device by a party the user did not ask for |

The failure mode is not ignorance, it is classification drift. The EDPB's cookie-pledge letter records it as a finding: "some controllers may incorrectly classify certain cookies and processing operations as 'essential' or 'strictly necessary', which would not be considered as such within the meaning of Article 5(3) ePrivacy Directive, or under GDPR." Whoever configures the consent platform picks the category, nobody reviews the pick, and "essential" quietly becomes the bucket for anything the banner was breaking.

Three scope points that change what you have to build:

- **It is not about cookies.** Article 5(3) is technology-neutral, and the EDPB's 2023 guidelines walk through `localStorage`, cache and `ETag` reads, SDK calls, fingerprinting surfaces, tracking pixels and decorated URLs. "We don't use cookies" is a statement about a storage API, not about the law. [[frontend-attack-surface]] covers the same point from the script-loading side.
- **It is not about personal data.** The ePrivacy trigger is *information* on terminal equipment; the GDPR then governs whatever you do with what you collected. The Cookie Banner Taskforce treats these as two stacked questions — was the read/write lawful, and was the subsequent processing lawful — and a failure at the first collapses the second.
- **The exemption analysis is national.** The EDPB's 2023 guidelines analyse only the *technical scope* and say the exemptions "should be analysed on a case-by-case basis accounting for the relevant member state transposition(s), and guidance issued by national Competent Authorities." Some authorities operate a narrow audience-measurement carve-out; do not assume yours does, and do not assume yours does not.

> **Myth check — "legitimate interest" is not available for the read/write (verified 2026-08-12).** Every consent platform ships a legitimate-interest tab, and for the *placement or reading* of the tag it is not a legal basis at all. The Cookie Banner Taskforce: "the legal basis for the placement/reading of cookies pursuant to Article 5 (3) cannot be the legitimate interests of the controller." The EDPB repeated it to the Commission, agreeing that users should not be shown information "referring to collection of data based on legitimate interest" in the cookie banner, "as this is not a valid legal basis under the ePrivacy directive for access or storage of information (including collection of data) in terminal equipment." If your vendor's default template has forty legitimate-interest toggles under the reject button, that template is the finding.

## Consent UI that is not a dark pattern

The banner is a component with a specification. Here it is.

**Reject is a button, on the first layer, next to accept.** The Cookie Banner Taskforce found that "the absence of refuse/reject/not consent options on any layer with a consent button of the cookie consent banner is not in line with the requirements for a valid consent and thus constitutes an infringement." A "Settings" button is not a reject option; it is a second layer with work in it.

**Reject is not a link in a paragraph.** The taskforce names this one explicitly as not producing valid consent: where "the only alternative action offered (other than granting consent) consists of a link behind wording such as 'refuse' or 'continue without accepting' embedded in a paragraph of text in the cookie banner, in the absence of sufficient visual support to draw an average user's attention to this alternative action" — and likewise when that link sits outside the banner frame entirely. Same element type, same size, same layer.

**Nothing is pre-ticked.** The taskforce: pre-ticked boxes to opt in "do not lead to valid consent," citing GDPR Recital 32, "Silence, pre-ticked boxes or inactivity should not therefore constitute consent." The consent guidelines generalise it past checkboxes: "The GDPR does not allow controllers to offer pre-ticked boxes or opt-out constructions that require an intervention from the data subject to prevent agreement (for example 'opt-out boxes')." Every toggle in your preference centre defaults off.

**Scrolling is not consent, and neither is browsing on.** EDPB: "actions such as scrolling or swiping through a webpage or similar user activity will not under any circumstances satisfy the requirement of a clear and affirmative action," and "merely continuing the ordinary use of a website is not conduct from which one can infer an indication of wishes." The consequence for design is that a dismissible-by-scroll banner has no valid state — it collects nothing while blocking your own layout.

**No cookie wall.** EDPB: "In order for consent to be freely given, access to services and functionalities must not be made conditional on the consent of a user to the storing of information, or gaining of access to information already stored, in the terminal equipment of a user (so called cookie walls)." Their Statement 03/2021 puts the same rule in product language — "take it or leave it" solutions defeat freely-given consent — and on the pay-or-consent variant the EDPB told the Commission that "Asking consumers to read complex cookie banners and only after they did not consent confronting them with a 'pay or leave' ultimatum, could be considered manipulative."

**One purpose, one opt-in.** "a controller that seeks consent for various different purposes should provide a separate opt-in for each purpose, to allow users to give specific consent for specific purposes." Bundling analytics with advertising in one switch fails granularity even if the switch defaults off.

**Withdrawal is permanent furniture.** Three conditions are cumulative and mandatory per the taskforce: "(i) the possibility to withdraw consent, (ii) the ability to withdraw consent at any time, (iii) withdrawal of consent must be as easy as to give consent." Their suggested implementation is a small hovering, permanently visible icon or a link in a visible and standardised place. The consent guidelines set the bar quantitatively: "when consent is obtained via electronic means through only one mouse-click, swipe, or keystroke, data subjects must, in practice, be able to withdraw that consent equally as easily," and withdrawal must be possible "free of charge or without lowering service levels."

**Write the purposes, not the categories.** Informed consent has a minimum content list — the controller's identity, the purpose of each processing operation, what type of data is collected, the existence of the right to withdraw, automated decision-making where relevant, and transfer risks where there is no adequacy decision — and the EDPB is blunt about register: "Controllers cannot use long privacy policies that are difficult to understand or statements full of legal jargon." The guidelines also quote the standard for a purpose being specific enough at all: "a purpose that is vague or general, such as for instance 'improving users' experience', 'marketing purposes', 'IT-security purposes' or 'future research' will - without more detail - usually not meet the criteria of being 'specific'." That sentence is a copy brief. See [[ux-writing]].

> **Myth check — "the buttons must be visually identical" is not what the regulator said (verified 2026-08-12).** The Cookie Banner Taskforce agreed "that a general banner standard concerning colour and/or contrast cannot be imposed on data controllers," and required case-by-case assessment of whether colours and contrast are "obviously misleading". The one example it called manifestly misleading is extreme: a reject button "where the contrast between the text and the button background is so minimal that the text is **unreadable** to virtually any user." So the *legal* floor is lower than the design rule. Ship the design rule anyway — equal weight, equal size, equal prominence — because it is the position CPPA-style symmetry rules and [[ethical-design]] both take, because a case-by-case assessment is a thing you lose slowly and expensively, and because a ghost-button reject fails contrast requirements in [[accessibility]] on its own merits.

**Do not bury objection two layers down.** The taskforce noted that presenting refusal at layer one and a separate legitimate-interest objection at layer two "could be considered as confusing for users who might think they have to refuse twice in order not to have their personal data processed." One decision, one place.

And the thing nobody measures: consent fatigue is a real cost you are imposing. The EDPB frames the ePrivacy reform partly as "addressing the 'consent fatigue'", and its consent guidelines note that "when encountered too many times, the actual warning effect of consent mechanisms is diminishing." The strongest available move is not a better banner. **It is deleting trackers until the banner is unnecessary** — the third-party inventory exercise in [[frontend-attack-surface]] and the measurement plan in [[analytics-experimentation]] usually cut the purpose list in half.

## Script gating

This is the section teams skip, and it is the one that decides compliance.

The EDPB's rule to the Commission is one sentence: "where consent is required, no access or storage of information in terminal equipment must take place before valid consent is obtained." The consent guidelines say the same from the GDPR side: "consent must always be obtained before the controller starts processing personal data for which consent is needed."

**A banner that appears while the tracker has already loaded is non-compliance with extra steps.** It is also the default behaviour of nearly every integration guide, because the guides are written to make the tag fire reliably, and the reliable place to put a tag is the document head.

So gating is a build-and-load-order problem:

```html
<!-- Wrong: the tag has already run, resolved DNS, set an ID and sent a page view -->
<script async src="https://analytics.vendor.example/t.js"></script>
<script>window.__consentBanner.show()</script>
```

```js
// Right: no network request, no storage, until a decision exists
const consent = readStoredDecision();           // strictly-necessary storage, no consent needed
if (consent?.analytics) loadAnalytics();

function loadAnalytics() {
  const s = document.createElement('script');
  s.src = 'https://analytics.vendor.example/t.js';
  s.async = true;
  document.head.append(s);
}
```

The checks that catch the real failures:

- **Test in a clean profile with DevTools open, banner untouched.** Every request in the network panel before you click anything must be one you can justify under the strictly-necessary test. This is the only audit that matters and it takes ninety seconds.
- **Check storage, not just requests.** Application → Cookies, Local Storage, Session Storage, IndexedDB, Cache Storage. A vendor that sets an ID in `localStorage` and syncs later still stored on the device at load.
- **`<link rel="preconnect">` and `dns-prefetch` to a tracker are contact.** They are also usually added by a performance ticket, months after the consent work.
- **A tag manager is an un-gateable hole unless you gate the container itself.** It exists so a non-engineer can deploy JavaScript without review; see [[frontend-attack-surface]]. Gate the container, and treat container publish rights as production deploy rights.
- **Server-rendered markup counts.** A tracking pixel in your Next.js/Astro/Svelte template renders regardless of client-side consent state; conditional rendering must happen where the HTML is produced.
- **The decision must survive navigation without itself being a tracker.** Store the choice under a first-party, strictly-necessary cookie with no identifier in it. A consent record that fingerprints the user to remember they refused fingerprinting is the joke that writes itself.
- **Revocation must unload, not just stop.** On withdrawal, stop firing *and* clear what the vendor stored. MDN: the `Clear-Site-Data` HTTP response header "is very useful for clearing short-lived user data — it instructs the browser to clear out its cache and/or cookies and/or storage." Then reload, because a loaded SDK keeps its handles.

## Data minimisation and retention

MDN reduces the whole ethic to three lines, and they are the right three:

> - Don't collect more data than you need
> - Communicate clearly how you are going to use the data you collect
> - Delete the data once you have finished with it

Made operational:

**A field needs a named use before it exists.** Not a plausible future use — a named consumer, today. "Company size" on a contact form with no downstream reader is a liability with a conversion cost attached; [[conversion-ux]] and the minimisation principle point the same direction, which is the usual sign you are doing this right. Ask for it later, or infer it. MDN's own advice includes preferring anonymous purchases over forced sign-up and using less granular categories where a coarse one answers the question.

**Every data class gets a retention period, written down and enforced by a job.** MDN's privacy-policy list includes "The duration for which you keep the data before it is deleted," which means you cannot write the policy without deciding the number. Set a different number per class — raw event logs, IP addresses, support transcripts, backups, analytics rollups — because a single global TTL is always either too short for finance or too long for everything else. The EDPB applies the same discipline to your *consent records*: proof of consent "should be kept no longer then strictly necessary for compliance with a legal obligation or for the establishment, exercise or defence of legal claims," and while demonstrating consent, controllers "should have enough data to show a link to the processing (to show consent was obtained) but they shouldn't be collecting any more information than necessary."

**Free-text fields are where regulated data arrives unplanned.** A "tell us about your issue" box on a support form, a booking note, a job-application cover letter, a session replay of a form the user typed a diagnosis into. Nobody designed those fields to collect health, biometric, religious or political data, and users put it there anyway — which drags the record into the special-categories regime, where the EDPB notes explicit consent is required where "serious data protection risk emerge" and, if none of the other narrow exceptions apply, "obtaining explicit consent in accordance with the conditions for valid consent in the GDPR remains the only possible lawful exception to process such data." Design responses:

- Replace free text with structured choices wherever the answer is enumerable. Better data, less risk, easier triage.
- Where free text must exist, label the boundary in the field's help text — one line, plain, in the voice of [[ux-writing]] — and mean it.
- Keep free-text fields out of session replay and analytics payload capture by default, along with everything in [[forms-inputs]] that you would not print on a receipt.
- Give free text its own, shorter retention.

**Do not put identifiers in URLs.** MDN documents link decorating — "Including parameters on the URLs of inbound links… that can reveal to the linked site where the link originated from, what marketing campaign it is part of, the email address or other identifier of the user that clicked on it" — and browsers now strip known tracking parameters. A URL is copied into a chat, a support ticket, an analytics log and a `Referer`; treat it as public.

## The rights, as interfaces

Access, correction, export, deletion. These are four screens someone has to design, and they are the part of privacy work that never gets a ticket, because the law is satisfied by an email address in a footer and the design is not.

**A deletion request handled by email is both a design failure and a compliance risk.** Design failure because the user gets no confirmation, no scope, and no timeline. Compliance risk because a human in an inbox is an unlogged, unmeasured, unbounded process that fails silently on holiday. Build:

| Right | The screen | What it must do |
|---|---|---|
| **Access** | "Your data" in account settings | Show categories, purposes, recipients and retention in the same language as the consent copy — not a JSON dump and not the privacy policy |
| **Export** | One button, asynchronous | Machine-readable, emailed as a link, link expires. State the format and the wait |
| **Correction** | Inline edit, everywhere | Anything you display about a user should be editable where it is displayed, not via a form that opens a ticket |
| **Deletion** | Account settings, same depth as sign-up | Explicit scope ("this removes X, we retain Y for Z because…"), a confirmation, a grace period if you offer one, and an email receipt |

Three rules the flows share:

- **Withdrawal is not deletion, and users think it is.** The EDPB: processing that already happened lawfully "remain[s] lawful, however, the controller must stop the processing actions concerned. If there is no other lawful basis justifying the processing (e.g. further storage) of the data, they should be deleted by the controller." So withdrawal has a concrete backend behaviour — stop, then delete unless another basis genuinely covers it — and the UI has to say which of the two the user just got.
- **You cannot swap the legal basis when consent becomes inconvenient.** "the controller cannot swap from consent to other lawful bases," and a change of basis has to be notified to the user. Deciding at collection time, per field, is what makes the deletion screen implementable at all.
- **Tell users how to exercise the rights at the moment they consent**, not only in the policy. The EDPB treats the right to withdraw as part of the minimum information required *before* consent is given.

Instrument the queue like a product surface: request volume, median time to fulfilment, failure rate, and the share arriving by email because your screen was not findable. That last number is the design metric.

## Privacy-preserving analytics

You can measure a website without tracking a person. Most teams do not, because the default install of the market-leading tool is the path of least resistance and nobody re-opened the question.

The ladder, in increasing order of what you have to give up:

1. **Server logs and edge metrics.** Requests, statuses, latency, and referrers you already receive. No device storage, no consent trigger.
2. **Aggregate, cookieless analytics** — no persistent identifier written to or read from the device, no cross-site linkage, retained short, reported only to you.
3. **Consented, full-fidelity analytics** for the subset who agree — with the honest caveat that a consented sample is a biased sample, so do not mix it with (2) in one chart. [[analytics-experimentation]] covers what that does to your inference.

Two claims to stop repeating:

> **Myth check — "cookieless" is not automatically consent-free (verified 2026-08-12).** The Article 5(3) trigger is storage *or* access, and the EDPB's technical-scope guidelines put ordinary "cookieless" mechanics squarely inside it: tracking information added to URLs or pixels "constitutes an instruction to the terminal equipment to send back the targeted information," so collecting identifiers that way "constitutes a 'gaining of access'"; caching alone counts, because Article 5(3) "is applicable, even if this storage is not permanent"; and locally computed values are covered too, because "The fact that this information is being produced locally does not preclude the application of Article 5(3) ePD." Even IP-only tracking is caught unless you can prove the address is not the user's: "Unless the entity can ensure that the IP address does not originate from the terminal equipment of a user or subscriber, it has to take all the steps pursuant to the Article 5(3) ePD." What genuinely helps is *not reading anything device-specific back* — not relabelling the same read as cookieless.

> **Myth check — server-side tagging does not remove the consent requirement (verified 2026-08-12).** Proxying the collection endpoint through your own domain changes who receives the request, not whether the device was read. The EDPB, on unique identifiers: "the entity collecting is instructing the browser (through the distribution of client-side code) to send that information. As such a 'gaining of access' is taking place and Article 5(3) ePD applies." And on IP-based tracking, Article 5(3) "could apply even though the instruction to make the IP available has been made by a different entity than the receiving one." Server-side tagging is a legitimate control for *data leakage* — it stops the vendor seeing raw headers and lets you filter the payload, which is real value against the third-party risks in [[frontend-attack-surface]]. It is not a consent bypass, and it is sold as one.

**If you want a defensible unconsented measurement tier, build to the shape the EDPB described** when it argued the proposed audience-measurement derogation was drafted too broadly. Its limits are a usable specification: "limited to low level analytics necessary for the analysis of the performance of the service requested by the user", "solely limited to providing statistics to the service operator", put in place by the operator or its processors, giving rise to no "singling-out or any profiling of users", collecting no "navigation information related to users across distinct websites/applications", and including "a user-friendly mechanism to opt-out from any data collection". Note carefully what that is: the EDPB's view of a *proposed* exemption, not a statement that one exists under the current Directive. Treat it as the design target and check your national transposition before you rely on it.

One more piece of hygiene that costs nothing: MDN's warning that "a third-party script included directly in your page via a `<script>` element *would* have access to your other scripts and data, whether it was hosted on your site or another site. It would effectively be first-party code." Your analytics vendor's consent posture is your consent posture.

## KVKK notes

Türkiye's Law No. 6698 (KVKK) rhymes with the GDPR and diverges in four places that change what you build. Sourced to kvkk.gov.tr.

**1. Explicit consent (*açık rıza*) is narrower, and blanket consent is void.** The Authority defines it as consent "belirli bir konuya ilişkin, bilgilendirilmeye dayanan ve özgür iradeyle açıklanan rıza" — related to a specific subject, based on information, and expressed with free will. Its guidance rules out general, catch-all consent covering every kind of transaction and every kind of processing, does not require written form (electronic channels are fine), and places the burden of proving consent on the controller. Withdrawal is available at any time, and processing based on consent must stop once the withdrawal reaches the controller.

**2. The notice and the consent must be two separate interactions.** This is the KVKK rule with the most direct UI consequence, and the one imported EU components break. Board decision 2018/90 held that combining the information notice (*aydınlatma*) and explicit consent in a single checkbox is unlawful: the two processes must be carried out separately, fulfilling the duty to inform is not conditional on any approval, and the controller must keep separate mechanisms proving that the notice was read and that consent was given.

```
[ ] I have read the Information Notice on the Processing of Personal Data.        ← acknowledgement
[ ] I give my explicit consent to … for the purpose of … .                        ← consent, separate, unticked
```

One checkbox reading "I accept the privacy notice and consent to processing" is the defect. Two controls, two records, two timestamps.

**3. Conditioning a service on explicit consent invalidates the consent.** A Board decision of 2 August 2018 found that requiring consent as a condition of receiving the service vitiates it — the summary describes the practice as an abuse of right through misleading and misdirecting the data subject, and contrary to the Law's Article 4 principles of lawfulness and fairness and of being connected, limited and proportionate to the purpose. Same conclusion as the EU cookie-wall rule, reached through a different door.

**4. Registration and cross-border transfer are procedural obligations with deadlines, not policy statements.**

- **VERBİS.** Under Article 16 of Law No. 6698, natural and legal persons who process personal data must register with the Data Controllers' Registry Information System (VERBİS) *before* they start processing. It is a filing, with exemptions by size and sector — check whether you are exempt rather than assuming.
- **Transfers abroad, post-2024 regime.** The By-Law sets a strict order: an adequacy decision; failing that, one of the appropriate safeguards in Article 10 (an approved agreement between public bodies, approved binding corporate rules, the Board's published standard contract, or a written commitment approved by the Board); and only if neither is available, the exceptional cases — "provided that such transfer is incidental. Transfers that are not regular, occur only once or a few times, do not have a continues nature, and are not part of the ordinary course of business shall be considered incidental." **Explicit consent to the transfer is one of those exceptional cases** — which means it is available for a one-off, not for your US analytics vendor, your CDN, or your support desk. Those are ordinary course of business, so they need a standard contract, and the standard contract "shall be notified to the Authority within five business days" of signature, with no modifications to the Board's text.

**5. Data-subject requests answer in thirty days, free.** The Authority states the obligation as responding to requests "en kısa sürede ve en geç otuz gün içinde" — as soon as possible and within thirty days at the latest — generally free of charge, with a fee from the Board's tariff only where the operation itself has a cost, refundable if the request arose from the controller's own error, and with the response delivered in writing or electronically. Thirty days is a shorter, harder SLA than a support inbox will hit by accident. It is a queue with a timer, so build it as one — the same screens as [The rights, as interfaces](#the-rights-as-interfaces), plus a clock.

If you serve both markets, build to the stricter of each rule rather than shipping two consent stacks: separate notice and consent controls, purpose-level opt-ins, no service conditioning, a thirty-day request SLA, and transfers on contractual footing rather than on consent.

## Ship checklist

- [ ] Every storage/read item inventoried and classified against the strictly-necessary test, with a named purpose and owner — not by importing the vendor's category defaults
- [ ] Reject is a real button, first layer, same element type, size and prominence as accept
- [ ] Zero pre-ticked boxes and zero opt-out constructions; every non-essential toggle defaults off
- [ ] Separate opt-in per purpose; no bundling of analytics with advertising
- [ ] No cookie wall, no scroll-as-consent, no dismiss-as-consent
- [ ] No "legitimate interest" tab for the placement/reading of tags
- [ ] Withdrawal permanently reachable, one interaction, free, with no service degradation
- [ ] Clean-profile network + storage check with the banner untouched: zero non-essential requests, cookies, `localStorage`, IndexedDB or cache writes — including `preconnect`/`dns-prefetch`
- [ ] Tag-manager container itself gated; container publish treated as deploy access
- [ ] Consent decision stored in a first-party, identifier-free, strictly-necessary cookie
- [ ] Withdrawal unloads and clears vendor storage (`Clear-Site-Data` + reload), not merely stops firing
- [ ] Every collected field has a named consumer; every data class has a retention period enforced by a job
- [ ] Free-text fields minimised, excluded from replay/analytics capture, and retained for less
- [ ] No user identifiers in URLs or `Referer`-exposed paths
- [ ] Access, export, correction and deletion exist as screens, with scope, timeline and a receipt — and a measured fulfilment queue
- [ ] Analytics tier chosen deliberately: server-side/aggregate as the unconsented baseline, full fidelity only behind consent, and never mixed in one chart
- [ ] "Cookieless" and "server-side" claims tested against what is actually read from the device
- [ ] KVKK: notice and consent as two separate controls with two records; VERBİS registration checked; transfers on standard contract notified within five business days; 30-day request SLA instrumented
