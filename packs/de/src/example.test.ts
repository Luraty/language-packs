import { describe, it } from 'vitest';

// ── The engine, and the pack. Two imports. ──────────────────────────────────────────────────────
import { createProfile, day, deserialize, learner, unitKey } from '@luraty/engine';
import type { Evidence } from '@luraty/engine';

import { de, vocabulary } from './index.js';

const say = (s: string): void => {
  // eslint-disable-next-line no-console
  console.log(s);
};

/**
 * The whole loop, end to end, with a comment on every line.
 *
 * This is a TEST rather than a snippet so it cannot rot: it compiles against the real engine and
 * runs against the real 10,000-word German pack on every `npm run check`. A fenced code block in a
 * markdown file is a string nothing checks — this repo's README shipped one that had not compiled
 * for three commits.
 *
 * @module
 */

describe('a host, end to end', () => {
  it('runs the whole loop', () => {
    // ═══════════════════════════════════════════════════════════════════════════════════════════
    // SETUP — two lines, because the pack ships already built.
    // ═══════════════════════════════════════════════════════════════════════════════════════════

    // Days are whole numbers since an epoch YOU choose, and they start at 1. `day(0)` does not just
    // return undefined — it is a COMPILE error, because 0 is the "never" sentinel inside the engine
    // and six separate defects came from a host reaching it.
    const d1 = day(1);

    // A profile is a plain value: no class, no hidden state, safe to fork, diff and serialize.
    // `learner(...)` wraps it so you stop passing pack/variety/direction to every call. Optional —
    // `anna.profile` is always reachable and every method has a free-function twin.
    let anna = learner(createProfile('de', d1), {
      pack: de, //     used by coverage() and by read()
      vocabulary, //   commonest-first order, so equally-due words don't sort alphabetically
      //             `variety` defaults to `pack.id` — the two are the same string in every pack that
      //             exists, and createPack validates the id as a legal variety. Pass it explicitly
      //             only when they differ: a Levantine speaker reading MSA has ONE profile with TWO
      //             varieties in it, measured separately.
      //             `direction` defaults to 'recognise' — reading, not producing.
    });

    // ═══════════════════════════════════════════════════════════════════════════════════════════
    // DAY 1 — PLACEMENT. She ticks what she recognises. However you asked, the answer is CLAIMS.
    // ═══════════════════════════════════════════════════════════════════════════════════════════

    // Pretend her placement screen returned the 400 commonest words. A claim says "the host believes
    // she knows this and NOBODY HAS CHECKED". It sets a flag and nothing else — no rung, no counter,
    // no date that schedules — so it can never be mistaken for proof.
    anna = anna.claim(vocabulary.slice(0, 400), d1);

    // Right now she is at 0 known, 400 unchecked. That is correct, not a bug: she said it, nobody
    // verified it. What the claim bought is that day one is not an empty screen.
    say(`placement: known ${String(anna.summary().known)}, unchecked ${String(anna.summary().claimsStanding)}`);

    // ═══════════════════════════════════════════════════════════════════════════════════════════
    // THE DAILY LOOP
    // ═══════════════════════════════════════════════════════════════════════════════════════════

    // `maxItems` is how many things to show — the length of your screen, which only you know.
    //
    // `maxNew` caps how much NEW material may crowd out review, and DEFAULTS to half the session.
    // That number is measured, not chosen: sweeping words-known after a simulated year across
    // budgets 4-40, accuracies 0.7-0.95 and introduction rates 3-20, floor(maxItems / 2) is the peak
    // or within 3% of it everywhere. The cliff is still real and still sharp at `maxNew: maxItems` —
    // a full session of nothing but new words means no word is ever drilled twice, and a year of
    // daily practice ends with the learner knowing zero.
    const session = anna.plan({ day: d1, maxItems: 8 });

    // ⚠️ MOTIVATED LEARNER? `maxItems` is per CALL, not per day. Record what she did and call plan
    // again — it dries up on its own, because answering sets `lastAsked = today`. Do NOT advance the
    // day to unlock more: that tells the engine a night of sleep happened, which is exactly what
    // every interval in here is a claim about.

    for (const item of session.items) {
      // `why` is the most product-visible field. Show these DIFFERENTLY:
      //   'verify'  — she claimed it. Say "you told us you know this — let's check."
      //   'new'     — never asked, never claimed. Teach it.
      //   'relearn' — asked before, never once right. She is mid-acquisition; give more support.
      //   'review'  — proven before. Ordinary review.
      // Calling a word she grew up hearing "new" is the exact failure this product exists to avoid.
      say(`  ${item.why.padEnd(8)} ${item.unit.split(':')[2] ?? ''}  waited ${String(item.daysWaiting)}d`);
    }

    // The engine has NO word list of its own and must not acquire one. If it had new slots it could
    // not fill from her profile, it says how many — you take that many off `vocabulary`.
    if (session.content.newUnitsWanted > 0) {
      say(`  engine wants ${String(session.content.newUnitsWanted)} more words it has never seen`);
    }

    // She answers. A retrieval is the ONLY thing that can raise a word's rung.
    // Right: +1 rung. Wrong: −2. That asymmetry puts break-even at 66.7% accuracy, which makes the
    // number mean "does she know this" rather than "how often does she slip".
    //
    // Pass the word however your UI has it — the handle runs it through `pack.key` first, so the
    // surface form and the lemma address the same unit. ⚠️ The free functions do NOT: `keysFor` and
    // `claimsFor` take no pack, so their contract is "hand me lemmas".
    //
    // This is the single most useful thing the handle does, and it used to be missing.
    // `answer('Schlüssel', …)` wrote to `recognise:de:schlüssel` while `read()`, `coverage()` and
    // every lemma from `vocabularyOf` addressed `recognise:de:schluessel` — this pack transliterates
    // umlauts. Two units, one word, no error. Nothing caught it because this example used `haus`,
    // a word that happens to equal its own key.
    anna = anna.answer('Schlüssel', 'known', d1); //  capitalised, umlaut → keyed to `schluessel`
    anna = anna.answer('Verordnung', 'unknown', d1); // a formal word — her register gap

    // She reads a passage. This is the INTAKE PATH — it is how words enter the profile at all, and
    // without it `plan()` has nothing to schedule, because it iterates the profile and never invents
    // vocabulary. On an empty profile, read() then plan() gives you items where plan() alone gives
    // you none.
    //
    // What it does NOT do is prove anything. A heritage speaker recognises a word's shape while
    // holding only its domestic sense, and will not ask — if not-asking counted as knowing, the
    // register gap this product exists to find would be invisible. So exposure moves `seen` and
    // `lastSeen` and nothing that schedules or is trusted.
    anna = anna.read('Der Mann geht am Morgen aus dem Haus und kauft Brot.', d1);

    // But tapping the gloss is NOT nothing — it is her telling you she does not have it. Costs one
    // rung, and is not counted as a lapse, because asking for help is the right thing to do.
    anna = anna.help('Verordnung', d1);

    // ═══════════════════════════════════════════════════════════════════════════════════════════
    // SIZING TOMORROW'S READING
    // ═══════════════════════════════════════════════════════════════════════════════════════════

    const passage =
      'Der Mann geht am Morgen aus dem Haus. Er kauft Brot und Wasser auf dem Markt in der Stadt. ' +
      'Die Frau sagt, dass die Schule schon offen ist, und das Kind liest eine Zeitung.';

    // `ignore` is for names and brands. The CONTENT knows which words are names; no pack can tell,
    // because German capitalises every noun and Arabic has no case at all. On real German news,
    // names are 66% of everything a 10,000-word pack does not know — counting them moves a passage
    // from 96.8% ("just right") to 89.6% ("too hard").
    // The handle fills in variety and direction; the free `coverage()` requires both, because that
    // is the ONE place they legitimately differ — "how much of this MSA text can she read out of her
    // Levantine vocabulary?" is the transfer question the product exists to answer.
    const hard = anna.coverage(passage, { ignore: ['Anna'] });

    switch (hard.kind) {
      case 'measured':
        // The band: below 95% known, guessing from context stops working; above 98%, there is
        // nothing left to learn. `in-band` is the target.
        say(`coverage: ${hard.band} — ${String(hard.knownTokens)}/${String(hard.runningTokens)} proven`);
        break;
      case 'unverified':
        // The verdict CHANGES depending on whether you believe her claims, so both readings come
        // back and you decide. `claimedLemmas` are the unchecked words in this passage — the best
        // possible drill list for tomorrow.
        say(`coverage: proven says ${hard.strict}, believing her says ${hard.withClaims}`);
        break;
      case 'too-short':
        // Below 20 running tokens the band has no representable point, so no verdict is honest.
        say(`coverage: need ${String(hard.needsMoreTokens)} more words to judge`);
        break;
      case 'no-words':
        // The pack found nothing — usually text in a script this pack does not cover.
        say('coverage: wrong language for this pack');
        break;
    }

    // ═══════════════════════════════════════════════════════════════════════════════════════════
    // RE-MEASUREMENT — the engine owns WHEN, you own HOW.
    // ═══════════════════════════════════════════════════════════════════════════════════════════

    switch (session.reassess.kind) {
      case 'never-measured':
        // Placed, nothing proven yet. There is no span to report, so the type does not carry one.
        say(`reassess: nothing proven yet, ${String(session.reassess.claimsStanding)} claims standing`);
        break;
      case 'due':
        // 30 days without a single successful retrieval anywhere. Run whatever placement you run.
        say(`reassess: ${String(session.reassess.daysSinceProven)} days without a proof`);
        break;
      case 'not-due':
        break;
    }

    // Words failed six times running. The engine deliberately does NOT show these less often — a
    // word failing that consistently is a content or method problem (bad audio, misleading gloss),
    // and quietly reducing its frequency is how that stays invisible. It names them instead.
    if (session.stuck.length > 0) say(`stuck: ${session.stuck.length} words are not landing`);

    // ═══════════════════════════════════════════════════════════════════════════════════════════
    // SAVING — and the one obligation the engine puts on you.
    // ═══════════════════════════════════════════════════════════════════════════════════════════

    // Canonical bytes: the same state always produces the same string, so it is safe to hash, diff
    // and pin. Where it goes is yours — a file, AsyncStorage, a Postgres column.
    const blob = anna.save();

    // ⚠️ YOU MUST ALSO KEEP THE RAW EVIDENCE. The engine stores no history — a profile is a fold,
    // and folds do not remember. The log is the repair path when an offline queue lands out of
    // order, and re-folding it is the stated migration strategy when the memory model changes.
    const log: Evidence[] = [
      { kind: 'retrieval', unit: unitKey('recognise', anna.variety, 'haus'), outcome: 'known', day: d1 },
    ];
    void log; // in a real host: await db.appendEvidence(everythingYouPassedToRecord)

    // A snapshot is fixed-size and integers only, so you can store one per day forever.
    // "Is she better than in March?" is a subtraction of two of these.
    const snap = anna.summary();
    say(
      `summary: ${String(snap.known)} known · of her claims, ` +
        `${String(snap.claimsConfirmed)} held, ${String(snap.claimsRefuted)} did not, ` +
        `${String(snap.claimsStanding)} unchecked`,
    );

    // At the next launch. `deserialize` NEVER throws — it returns a tagged result, because this runs
    // before the first frame against bytes an older build wrote, and a crash there is a learner who
    // cannot open the app and cannot downgrade to fix it.
    const back = deserialize(blob);
    if (!back.ok) {
      // Named kinds you can act on differently: 'not-json' (corrupt write), 'malformed',
      // 'from-the-future' (app was downgraded), 'no-migration'.
      say(`could not load: ${back.error.kind} — ${back.error.message}`);
      return;
    }
    // And you are straight back into the same handle.
    const tomorrow = learner(back.value, { pack: de, vocabulary });
    say(`reloaded ${String(Object.keys(tomorrow.profile.units).length)} units from ${String(blob.length)} bytes`);
  });
});
