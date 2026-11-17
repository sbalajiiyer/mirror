# Plain-language AI (2026-11-17)

AI-written questionnaires and feedback summaries follow rules borrowed from **ASD-STE100
(Simplified Technical English)**. The rules live in one place: `plainLanguageRules()` in
`src/lib/ai/prompts.ts`.

- One idea or behaviour per sentence or statement.
- Short sentences: at most 15 words for questionnaire statements, 20 for summary sentences.
- Plain words; no jargon or idioms; the same term for the same thing every time.
- Easy to translate into Spanish, French, German and Portuguese.
- Observable behaviours, not personality traits.
- Open-ended questions stay warm and conversational.

## Two versions of every summary
The report's AI summary has a **Standard | Simplified** switch (Standard first). Both are written in
the same AI call, so they say the same things:
- **Standard:** 90–140 words, cites scores and self/others gaps.
- **Simplified:** 40–80 words, everyday words, no numbers or terms like "gap" or "competency".

Summaries written before this change have no Simplified version; the card says "Regenerate to get
a Simplified version too". The PDF and print view use Standard.

**Price:** included on the free model. On premium models (Claude, GPT) the call is metered per
token as usual, so the extra Simplified text is charged per use.

## Anonymity, enforced in code (not only in the prompt)
In `reportDigest()` (`src/lib/ai/features/summary.ts`):
- Rater groups with fewer than 3 people are never broken out, even an opted-in manager; their
  comments are labelled just "rater".
- Only comment themes supported by **at least 2 distinct raters** are sent. Reports now count
  distinct raters per theme (`ThemeGroup.raters`); reports frozen earlier fall back to the comment count.
- The AI must paraphrase. Output that copies 8+ consecutive words from a comment it was sent is
  rejected (`quotesAComment`) and the standard template summary is used instead.

## Tests
`tests/unit/plain-language.test.ts`, `tests/integration/ai.test.ts` (Simplified stored, rules sent),
`tests/e2e/ai.spec.ts` (switch between versions).
