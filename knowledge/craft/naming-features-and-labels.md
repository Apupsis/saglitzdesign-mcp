---
id: naming-features-and-labels
title: "Naming Features and Labels — Criteria, Process, Evaluation"
category: craft
platform: both
tags: [naming, name, names, feature-names, labels, label, wording, ux-writing, terminology, information-architecture, i18n, product-language]
sources: ["https://developer.apple.com/videos/play/wwdc2026/290/", "https://developer.apple.com/design/human-interface-guidelines/writing", "https://www.nngroup.com/articles/navigation-cognitive-strain/"]
updated: 2026-08-03
---

# Naming Features and Labels

Naming is treated as the last five minutes of a feature and it decides how the feature is understood. A name is the first thing a person reads, the thing they search for, the thing they tell a colleague, and the thing support has to repeat back. It is interface, not packaging.

It is also the part of writing most often done by whoever happened to build the thing — which is why so many products ship a menu of engineering vocabulary.

Three tools make it a decision rather than a reflex: **criteria**, **process**, **evaluation**.

## Criteria — what a good name has

A strong name has three qualities. It does not have to hit all three, but it is better when it does.

**1. It belongs.** It sounds like this product and it fits where it sits — among the other names already in the app, at the level of the hierarchy it occupies. A name that is excellent in isolation and foreign among its neighbours is the wrong name.

**2. It sets the right expectation.** Someone reading it is already predicting what they will find. When the name delivers on that prediction, trust accumulates; when it does not, every future name is read with more suspicion. This is why clarity beats cleverness in anything consequential.

**3. It works everywhere.** It survives translation, other markets, and every context the product reaches — a menu item, a settings row, a notification, a support article, a spoken request. A name that only works in English, or only in the place it was invented, is a name that will be replaced.

## Process — how to get candidates

Start from the audience, then run **think / feel / do**:

- **Think** — what should someone think when they use this? Easy? Clever? Safe? Write down everything; do not filter yet.
- **Feel** — what should it feel like? Naming the emotion is what unlocks the non-obvious candidates.
- **Do** — what do you want them to actually do — find it, use it, share it?

Group what comes out by recurring theme, then take the strongest few forward. The filtering happens after the generating, not during it; a session that evaluates every idea as it arrives produces safe, descriptive names and nothing else.

## Evaluation — how to choose

**Say it in a sentence.** "Hey, check out ___." "Just search for ___." A name that is awkward out loud is awkward in the interface. This one test kills most bad candidates.

**Let context set the priority.** A financial balance and a photo collection do not need the same qualities. Where money, safety or permissions are involved, clarity and trust come first and brand expression waits. Where the value is emotional, an emotionally accurate word can communicate what a technical label never will.

**Check it against its neighbours.** Read the whole menu, not the one row.

**Name the experience, not the technology.** The most common failure mode: shipping the engineering term. *Vocal Isolation* describes what the system does; it is an audio-engineering phrase. What a person wants to know is what it does *for them*. A name aimed at the person, not the pipeline, is nearly always shorter and always clearer.

**Invented words are allowed when they carry their parts.** A coined name works when it is assembled from pieces that already mean something — auto plus mix. It fails when it must be explained, because the explanation is not in the interface where the name is.

## Names accumulate

Every good name makes the next easier, because names build on each other until they are the vocabulary of the product. That compounding is also the cost of a careless one: a wrong name spreads into settings, notifications, help content, support scripts and user habit, and each place it spreads raises the price of changing it. Rename early or not at all.

## Checklist

- [ ] Audience identified before candidates were generated.
- [ ] Think / feel / do run before any filtering.
- [ ] Candidate read out loud in a natural sentence.
- [ ] Candidate read alongside its neighbouring names, not alone.
- [ ] Describes the experience, not the implementation.
- [ ] Sets an expectation the feature actually meets.
- [ ] Checked against translation and other markets.
- [ ] Works when spoken to a voice assistant and when written in a support article.
- [ ] Consequential features prioritise clarity over brand expression.
- [ ] Any invented word is built from parts that already carry meaning.

## Anti-patterns

- **Shipping the engineering term.** The internal name for the technology is almost never the name for the experience.
- **Naming last.** By then the shape is fixed and the name has to describe a compromise.
- **Cleverness where trust is required.** A playful name on a money, privacy or deletion surface reads as evasion.
- **A name that needs a tooltip.** If it must be explained where it appears, it has not done its job.
- **Ignoring the neighbours.** Three good names in three different registers make a menu that feels assembled by three different companies.
- **Untranslatable puns.** They become literal nonsense in every other market.
- **Renaming late and often.** Names spread into help content, habits and muscle memory; the cost of changing one rises every week it exists.

See also: [[ux-writing]], [[information-architecture]], [[i18n-localization]], [[brand-on-native-platforms]], [[principles-heuristics]], [[dont-make-me-think]].
