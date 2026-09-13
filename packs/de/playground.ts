/** Scratch playground — not on the gate. Run: npx tsx playground.ts */
import { createProfile, day, learner } from '@luraty/engine';
import type { Evidence, Outcome } from '@luraty/engine';
import { de, vocabulary } from './src/index.js';

/** `day()` returns `Day | undefined` for a non-literal. Playground shortcut. */
const d = (n: number) => day(n)!;

// console.log(de)

// console.log("de.key(\"gelaufen\")", de.key("gelaufen"))

// const words_to_rank = [
//   "Türkei",
//   "Schweiz",
//   "Kühlschrank",
//   "Waschmaschine",
//   "Hose",
//   "Schal",
//   "Skischuhe",
//   "Laufen",
//   "Gelaufen"
// ]

// for (const word of words_to_rank) {
//   const key = de.key(word)
//   console.log(word, de.rank(key), key)
// }

// console.log(de.compare("ändern", "andern"))

// console.log("======================")

const profile = createProfile('de', d(1));

console.log(profile)

let me = learner(profile, { pack: de, vocabulary });

let current_day: number = 1;
while (current_day <= 3) {

  console.log("====== day ", current_day, "=========")

  const outcome: Outcome = 'known'   // union of string literals, not an enum
  me = me.claim(["hallo"], d(current_day))
  me = me.answer("wie", outcome, d(current_day))
  me = me.help("gelaufen", d(current_day))
  me = me.on(d(current_day))

  const session = me.plan({
    day: d(current_day),
    maxItems: 1,
    maxNew: 1,
  })

  console.log("session", session)

  console.log("profile after day", current_day, me.profile.units)

  current_day++
}

const text = "Hallo wie geht es dir? Ich gehe laufen und ich mag laufen sehr. Ah hallo wie geht es dir? Weist du wie man lauft?"

console.log(me.coverage(text))

console.log(me.summary())

console.log(me.save())

// I grew up hearing German: claim the 300 commonest words as dormant knowledge.
// const claimed = me.claim(vocabulary.slice(0, 300), d1);

// const session = claimed.plan({ day: d1, maxItems: 8, maxNew: 3 });
// console.log('day 1 session:', JSON.stringify(session, null, 2).slice(0, 800));
