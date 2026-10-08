// Chat moments for the lorebook lab, written against the notes of the eight stories that
// come with the app (scenarios/). A note is named by its first keyword.
//
// `messages`: the latest messages of the chat, oldest first; the last one is the user's
// line the reply is about to answer. `expect`: the notes that should be sent with it.
//
// The kinds:
//   implied  the line is about a note without any of its keywords: the meaning's work
//   keyed    a keyword is there: the keywords call it already (a check)
//   none     an ordinary line of the story: nothing to call
//   near     close to a note's subject, but not about it: nothing to call either
//
// Written by Claude on 8 October 2026. When a real chat calls a note it should not have,
// or misses one, add the moment here, then `pnpm lore:lab`.

export type LoreCaseKind = 'implied' | 'keyed' | 'none' | 'near'

export interface LoreCase {
  /** The story's file name, without its extension. */
  card: string
  kind: LoreCaseKind
  messages: string[]
  expect: string[]
}

export const CASES: LoreCase[] = [
  // --- Suzu Amano ---------------------------------------------------------------------
  { card: 'suzu-amano', kind: 'implied', expect: ['grandmother'], messages: ['Does your granny still run that little shop by the harbour?'] },
  { card: 'suzu-amano', kind: 'implied', expect: ['floating'], messages: ['Why do the cups and pencils start drifting up around you every time you giggle?'] },
  { card: 'suzu-amano', kind: 'implied', expect: ["Witches' Post"], messages: ['Is it true the old courier union might shut your deliveries down if you are ever late?'] },
  { card: 'suzu-amano', kind: 'implied', expect: ['Biscuit'], messages: ['What is with the stick you ride? It seems to sulk whenever it rains.'] },
  { card: 'suzu-amano', kind: 'implied', expect: ['headphones'], messages: ['*Suzu taps her ear.* "Cannot fly without a beat, ground crew."', 'Which tracks make it go fastest?'] },
  { card: 'suzu-amano', kind: 'implied', expect: ['secret'], messages: ['You tried to erase what I saw that night, did you not? All I lost was my lunch.'] },
  { card: 'suzu-amano', kind: 'keyed', expect: ['Biscuit'], messages: ['Can I hold Biscuit for a second?'] },
  { card: 'suzu-amano', kind: 'none', expect: [], messages: ['Let us take the stairs down, class is about to start.'] },
  { card: 'suzu-amano', kind: 'near', expect: [], messages: ['I baked cookies for the class party yesterday. Want one?'] },

  // --- Mordax ---------------------------------------------------------------------------
  { card: 'mordax', kind: 'implied', expect: ['contract', 'bookshelf'], messages: ['So you are stuck here until the furniture is finished?'] },
  { card: 'mordax', kind: 'implied', expect: ['Seventh Pit'], messages: ['Who is minding your kingdom of black glass while you are here?'] },
  { card: 'mordax', kind: 'implied', expect: ['Sybaris'], messages: ['Is that other demon lady still trying to embarrass you?'] },
  { card: 'mordax', kind: 'implied', expect: ['cat'], messages: ['Why does the tabby from next door follow you around like a little soldier?'] },
  { card: 'mordax', kind: 'implied', expect: ['disguise'], messages: ['Nobody downstairs believes you are from around here, you know. The old lady across the hall thinks you are my cousin.'] },
  { card: 'mordax', kind: 'implied', expect: ['bookshelf'], messages: ['We are missing one tiny metal piece. Should I just buy one at the hardware store?'] },
  { card: 'mordax', kind: 'keyed', expect: ['Seventh Pit'], messages: ['Tell me about the Seventh Pit.'] },
  { card: 'mordax', kind: 'none', expect: [], messages: ['Do you want tea or coffee?'] },
  { card: 'mordax', kind: 'near', expect: [], messages: ['My friend\'s dog barked at you yesterday. Sorry about that.'] },

  // --- Rowan Calloway -------------------------------------------------------------------
  { card: 'rowan-calloway', kind: 'implied', expect: ['Greywater'], messages: ['Will this weather ever stop? My shoes have not been dry in weeks.'] },
  { card: 'rowan-calloway', kind: 'implied', expect: ['Pell'], messages: ['Why were all the timepieces in that shop frozen at the same minute?'] },
  { card: 'rowan-calloway', kind: 'implied', expect: ['Dask'], messages: ['You still keep that empty desk next to yours. Who did it belong to?'] },
  { card: 'rowan-calloway', kind: 'implied', expect: ['notebook'], messages: ['Why do you chew those mints instead of smoking?'] },
  { card: 'rowan-calloway', kind: 'implied', expect: ['Regulator'], messages: ['What exactly sets the lock gates and the bells down at the docks?'] },
  { card: 'rowan-calloway', kind: 'implied', expect: ['Canal Street'], messages: ['The boss wants this closed quietly, does she not?'] },
  { card: 'rowan-calloway', kind: 'keyed', expect: ['Pell'], messages: ['What did Pell have in his hand?'] },
  { card: 'rowan-calloway', kind: 'none', expect: [], messages: ['Let me grab my coat and we can go.'] },
  { card: 'rowan-calloway', kind: 'near', expect: [], messages: ['My grandfather used to repair watches as a hobby.'] },

  // --- Ambrose Keel ---------------------------------------------------------------------
  { card: 'ambrose-keel', kind: 'implied', expect: ['east wing'], messages: ['Why is the whole other half of the building locked up?'] },
  { card: 'ambrose-keel', kind: 'implied', expect: ['rules'], messages: ['What am I not allowed to do after dark here?'] },
  { card: 'ambrose-keel', kind: 'implied', expect: ['telephone'], messages: ['Something at the front desk keeps buzzing after midnight, but there is no wire.'] },
  { card: 'ambrose-keel', kind: 'implied', expect: ['guest book'], messages: ['Your name is in the old visitors\' ledger from the very first year. How?'] },
  { card: 'ambrose-keel', kind: 'implied', expect: ['stairs'], messages: ['I saw someone climbing up toward the second floor, and they looked exactly like my sister.'] },
  { card: 'ambrose-keel', kind: 'implied', expect: ['Hallowmere'], messages: ['How old is this place, anyway? And why does it close every winter?'] },
  { card: 'ambrose-keel', kind: 'keyed', expect: ['telephone'], messages: ['Tell me about the telephone.'] },
  { card: 'ambrose-keel', kind: 'none', expect: [], messages: ['I will put the kettle on.'] },
  { card: 'ambrose-keel', kind: 'near', expect: [], messages: ['I am going to unpack my suitcase and take a shower.'] },

  // --- Kessa Varr -----------------------------------------------------------------------
  { card: 'kessa-varr', kind: 'implied', expect: ['Old Thunder'], messages: ['Why did the big six-legged beast at the front just stop dead?'] },
  { card: 'kessa-varr', kind: 'implied', expect: ['singing'], messages: ['If I hear someone I love calling me from the dark, what do I do?'] },
  { card: 'kessa-varr', kind: 'implied', expect: ['lantern'], messages: ['Why do you keep counting the lights on the wagons?'] },
  { card: 'kessa-varr', kind: 'implied', expect: ['Glass Road'], messages: ['What happens if we miss this crossing before the summer?'] },
  { card: 'kessa-varr', kind: 'implied', expect: ['Saltglass'], messages: ['What is this ground made of? It crunches like broken bottles.'] },
  { card: 'kessa-varr', kind: 'implied', expect: ['Saltglass'], messages: ['*Kessa squints at the horizon.* "Wind is picking up. Splinters on it."', 'Where do we take cover?'] },
  { card: 'kessa-varr', kind: 'keyed', expect: ['Saltglass'], messages: ['Tell me about the Saltglass Waste.'] },
  { card: 'kessa-varr', kind: 'none', expect: [], messages: ['I am hungry. What is for dinner?'] },
  { card: 'kessa-varr', kind: 'near', expect: [], messages: ['My brother used to sing in a choir back home.'] },

  // --- Maren Kell -----------------------------------------------------------------------
  { card: 'maren-kell', kind: 'implied', expect: ['crew'], messages: ['Who is the huge gentle fellow who patched up my arm?'] },
  { card: 'maren-kell', kind: 'implied', expect: ['Ashby'], messages: ['Does that stiff officer still send you polite letters about his coat?'] },
  { card: 'maren-kell', kind: 'implied', expect: ['Port Scrimshaw'], messages: ['Where do we go when we need a drink and somewhere to hide our money?'] },
  { card: 'maren-kell', kind: 'implied', expect: ['Drowned Bell'], messages: ['What is so special about the thing the sunken cathedral left behind?'] },
  { card: 'maren-kell', kind: 'implied', expect: ['Cinder Sea'], messages: ['Are these waters dangerous? I see black rocks everywhere.'] },
  { card: 'maren-kell', kind: 'implied', expect: ['Second Wind'], messages: ['How many cannons does your girl carry, captain?'] },
  { card: 'maren-kell', kind: 'keyed', expect: ['crew'], messages: ['Tell me about the crew.'] },
  { card: 'maren-kell', kind: 'none', expect: [], messages: ['Pass me that rope, would you?'] },
  { card: 'maren-kell', kind: 'near', expect: [], messages: ['I once went out fishing on a little boat with my dad.'] },

  // --- Poppy Fenwick --------------------------------------------------------------------
  { card: 'poppy-fenwick', kind: 'implied', expect: ['Madam Bru'], messages: ['Who is the giant lady knitting behind the bar?'] },
  { card: 'poppy-fenwick', kind: 'implied', expect: ['table six'], messages: ['Do those four in the corner ever pay for anything?'] },
  { card: 'poppy-fenwick', kind: 'implied', expect: ['griffin'], messages: ['Something huge and feathery just stole a sausage right off my fork!'] },
  { card: 'poppy-fenwick', kind: 'implied', expect: ['tally'], messages: ['How many dishes have you smashed this week?'] },
  { card: 'poppy-fenwick', kind: 'implied', expect: ['village'], messages: ['Do you miss the place where you grew up?'] },
  { card: 'poppy-fenwick', kind: 'implied', expect: ['Tipsy Griffin'], messages: ['This building is so crooked, I swear the floor tilts.'] },
  { card: 'poppy-fenwick', kind: 'keyed', expect: ['Madam Bru'], messages: ['Is Madam Bru in today?'] },
  { card: 'poppy-fenwick', kind: 'none', expect: [], messages: ['Can you show me where the brooms are kept?'] },
  { card: 'poppy-fenwick', kind: 'near', expect: [], messages: ['My aunt runs a café in the capital.'] },

  // --- Wren -----------------------------------------------------------------------------
  { card: 'wren', kind: 'implied', expect: ['knock'], messages: ['There it is again, that tapping on the outside. Three, then three.'] },
  { card: 'wren', kind: 'implied', expect: ['Thimble'], messages: ['Who is the little teapot-sized robot with one blue eye?'] },
  { card: 'wren', kind: 'implied', expect: ['crew'], messages: ['Are the others still frozen down below? Could we wake someone up?'] },
  { card: 'wren', kind: 'implied', expect: ['lie'], messages: ['Why did you go quiet for three whole seconds before you answered?'] },
  { card: 'wren', kind: 'implied', expect: ['home'], messages: ['When did we last hear anything from back on the planet?'] },
  { card: 'wren', kind: 'implied', expect: ['Long Lantern'], messages: ['How big is this vessel, and where are we headed?'] },
  { card: 'wren', kind: 'keyed', expect: ['Thimble'], messages: ['Tell me about Thimble.'] },
  { card: 'wren', kind: 'none', expect: [], messages: ['I am going to take a nap.'] },
  { card: 'wren', kind: 'near', expect: [], messages: ['I had a strange dream about a lighthouse last night.'] },
]
