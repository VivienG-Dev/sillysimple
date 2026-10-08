// The mood of a reply, read from its text, to show it on the character's picture as a
// small manga-style symbol (a "!" for surprise, a drop of sweat for unease…).
//
// The reading is done with word lists, not by asking the model: it costs nothing, takes
// no time and cannot change what the model writes. Roleplay prose makes it workable, since
// it says what a character does: she blushes, he sighs, her eyes widen. English and French.
//
// It is a guess, and it prefers silence to a wrong guess: a reply with no clear sign gets
// no mood at all, and so no symbol.

export const MOODS = [
  'joy',
  'playful',
  'love',
  'shy',
  'anger',
  'surprise',
  'question',
  'sad',
  'nervous',
  'sigh',
  'fear',
  'sleepy',
  'thinking',
] as const
export type Mood = (typeof MOODS)[number]

/** A sign of a mood: a pattern, and how much it counts (1 when left out). */
type Sign = RegExp | [RegExp, number]

// Patterns match from the start of a word; most are stems, so "blush" finds "blushes" and
// "blushing". `her` stands for whose body it is: her, his, their, its, the, my.
const her = "(?:her|his|their|its|the|my|a|an|one)"
const fr = "(?:le|la|les|l'|son|sa|ses|un|une|du|des)"
const sign = (source: string, weight = 1): Sign => [new RegExp(`(?<![\\p{L}])(?:${source})`, 'giu'), weight]

const SIGNS: Record<Mood, Sign[]> = {
  joy: [
    sign('laugh|giggl|chuckl|beam(?:s|ed|ing)\\b|cheer|delight|happily|joyful|overjoyed|thrilled|elated'),
    sign('grin(?:s|ned|ning)?\\b|smil(?:e|es|ed|ing)\\b', 0.8),
    sign(`${her} (?:eyes|face) (?:light|lit|lights|lighting|brighten|sparkl|shin)`, 1.3),
    sign('rit\\b|rire|rigol|glouss|pouff|éclat(?:e|ent)? de rire|ravie?\\b|joyeu|heureu|enchantée?\\b|réjoui'),
    sign('souri(?:t|ent|re|ant)\\b', 0.8),
    sign(`${fr} (?:yeux|visage|regard) (?:s'illumin|pétill|brill)`, 1.3),
  ],
  playful: [
    sign('smirk|teas(?:e|es|ed|ing)\\b|wink|mischie|playful|impish|sly(?:ly)?\\b|coy(?:ly)?\\b|sticks? (?:out )?her tongue'),
    sign("taquin|clin d['’]œil|clin d['’]oeil|malici|espiègl|narquois|coquin|tire la langue"),
  ],
  love: [
    sign(`${her} heart (?:skip|flutter|race|races|pound|swell|melt)`, 1.5),
    sign('kiss|caress|nuzzl|cuddl|snuggl|embrac|lovingly|tenderly|affectionate|adoring|i love you|hug(?:s|ged|ging)\\b'),
    sign(`${fr} cœur (?:bat|s'emballe|fond|se serre)`, 1.5),
    sign("embrass(?:e|ent|er|ant)\\b|câlin|enlac|tendrement|amoureu|je t['’]aime|affectueu|se blottit"),
  ],
  shy: [
    sign('blush|fluster|embarrass|sheepish|bashful|shyly|mortified', 1.3),
    sign('flush(?:es|ed|ing)\\b'),
    sign(`${her} (?:cheeks|face|ears) (?:redden|burn|warm|flush|turn|turns|turned|go|goes|went) ?(?:red|pink|crimson|scarlet|hot)?`, 1.3),
    sign(`(?:avert|averts|averted|averting) ${her} (?:eyes|gaze)|looks? away`, 0.7),
    sign('rougi|gênée?\\b|timide|penaud', 1.3),
    sign(`${fr} joues (?:rouges|roses|brûlantes|s'empourprent|rosissent|s'enflamment)`, 1.3),
    sign(`détourne ${fr} (?:regard|yeux)`, 0.7),
  ],
  anger: [
    sign('glar(?:e|es|ed|ing)\\b|glower|scowl|snarl|growl|furious|fury|enraged|rage\\b|angr(?:y|ily|ier)\\b|anger(?:s|ed)?\\b|irritat|seeth|livid|outrag'),
    sign(`snap(?:s|ped)\\b(?! ${her} fingers)|hiss(?:es|ed)\\b|shout|yell(?:s|ed|ing)?\\b|annoy`, 0.8),
    sign(`(?:clench|clenches|clenched|clenching|grit|grits|gritted|gritting) ${her} (?:fist|fists|jaw|teeth)`, 1.3),
    sign(`slam(?:s|med)? ${her} (?:fist|hand|palm)`, 1.3),
    sign('fusille du regard|grogne|gronde|furieu|colère|agacée?\\b|énervée?\\b|hurle|rugit'),
    sign(`serre ${fr} (?:poing|poings|dents|mâchoire)`, 1.3),
  ],
  surprise: [
    sign('gasp|startl|stunned|astonish|taken aback|dumbfound|speechless|in disbelief', 1.2),
    sign(`${her} eyes (?:widen|go wide|went wide|grow wide|fly open|snap open)|eyes wide`, 1.3),
    sign(`${her} jaw (?:drop|dropped|drops|fall|falls)|mouth (?:falls|fell|hangs|hanging) open`, 1.3),
    sign('surpris|shock(?:ed)?\\b|jump(?:s|ed)?\\b|freez(?:e|es)\\b|froze\\b|blink(?:s|ed)?\\b', 0.8),
    sign('sursaut|écarquill|bouche bée|stupéf|interloqu|médusé|hoquet(?:te)? de surprise|se fige|reste figé', 1.2),
    sign('choquée?\\b|ébahi', 0.8),
  ],
  question: [
    sign(`tilt(?:s|ed|ing)? ${her} head|cock(?:s|ed|ing)? ${her} head`, 1.3),
    sign('puzzl|confus|quizzical|curious|bewilder|perplex|baffl'),
    sign(`rais(?:e|es|ed|ing) ${her} (?:eyebrow|brow)`, 1.1),
    sign(`penche ${fr} tête|hausse ${fr} sourcil|arque ${fr} sourcil`, 1.3),
    sign('curieu|intrigu|interrogat|déconcert'),
  ],
  sad: [
    sign('tear(?:s|ful|fully)?\\b|sob(?:s|bed|bing)?\\b|weep|wept|sniffl|sorrow|grief|griev|mourn|heartbroken|melanchol|forlorn', 1.2),
    sign('cry(?:ing)?\\b|cries\\b|cried\\b|sad(?:ly|ness)?\\b|downcast|crestfallen|dejected|miserabl'),
    sign(`${her} (?:voice|lip|lips|chin) (?:break|breaks|crack|cracks|quiver|quivers|trembl|wobbl)`, 1.2),
    sign('larme|pleur|sanglot|triste|chagrin|mélancol|renifl|abattue?\\b|le cœur brisé|déprim', 1.2),
    sign(`${fr} voix (?:se brise|tremble|se casse)`, 1.2),
  ],
  nervous: [
    sign('nervous|anxious|fidget|sweat(?:s|ing|y)?\\b|stammer|stutter|uneas|awkward|hesitat|flinch(?:es|ed)?\\b'),
    sign(`gulp|swallow(?:s|ed)? hard|bit(?:e|es|ing)? ${her} lip|wring(?:s|ing)? ${her} hands|shift(?:s|ed|ing)? (?:uncomfortably|nervously)`, 1.2),
    sign('nerveu|anxieu|gigot|transpir|bégai|balbuti|déglut|mal à l[\'’]aise|hésit'),
    sign(`se mord ${fr} lèvre|se tord ${fr} mains`, 1.2),
  ],
  sigh: [
    sign('sigh(?:s|ed|ing)?\\b|exasperat|deadpan|facepalm|wearily|tiredly|unimpressed', 1.1),
    sign(`roll(?:s|ed|ing)? ${her} eyes|pinch(?:es|ed|ing)? the bridge of ${her} nose|rub(?:s|bed|bing)? ${her} temples`, 1.3),
    sign('soupir|lève les yeux au ciel|lassée?\\b|blasée?\\b|se pince l[\'’]arête du nez|se masse les tempes', 1.1),
  ],
  fear: [
    sign('terrifi|terrify|afraid|fearful|scared|frighten|panic|cower|recoil|dread|horrif|petrified'),
    // Shaking has many causes: it only counts as fear with something else to back it.
    sign('trembl|shiver|shudder|frisson', 0.35),
    sign(`${her} (?:face|skin) (?:pale|pales|paled|drain|drains|blanch)|goes pale|went pale|turns? pale`, 1.2),
    sign('terrifi|effray|apeur|paniqu|recule\\b|pétrifi|a peur|blêmit|pâlit'),
  ],
  sleepy: [
    sign('yawn|sleepy|sleepily|drows|doz(?:e|es|ed|ing)\\b|nod(?:s|ded|ding)? off|half-asleep', 1.3),
    sign(`${her} eyelids (?:droop|grow heavy|flutter shut)|rub(?:s|bed|bing)? ${her} eyes`, 1.2),
    sign("bâill|somnol|s['’]assoupi|ensommeill|paupières (?:lourdes|se ferment)|se frotte les yeux|à moitié endormi", 1.3),
  ],
  thinking: [
    sign('ponder|thoughtful|mull(?:s|ed|ing)?\\b|contemplat|muse(?:s|d)?\\b|lost in thought|deep in thought|hmm+'),
    sign(`consider(?:s|ed|ing)?\\b|think(?:s|ing)? (?:it over|about it|for a moment)|strok(?:e|es|ed|ing) ${her} chin|tap(?:s|ped|ping)? ${her} chin`),
    sign('réfléch|songeu|pensi(?:f|ve)\\b|médit|perdue? dans ses pensées|se gratte le menton'),
  ],
}

/** Words that turn a sign around when they come just before it: "she does not smile". */
const NEGATION = /(?:\bnot|n['’]t|\bno|\bnever|\bwithout|\bhardly|\bbarely|\bne|\bpas|\bsans|\bjamais|\bni)\s+(?:\S+\s+){0,2}$/iu
/** The sign is about the reader, not the character: "your eyes widen", "you laugh". */
const ABOUT_YOU = /(?:\byou|\byour|\btu|\bton|\bta|\btes|\bvous|\bvotre|\bvos)\s+(?:\S+\s+){0,1}$/iu

/** A sign near the end of the reply tells more about how the character feels now than one at its start. */
const START_WEIGHT = 0.6
const END_WEIGHT = 1.4
/** Below this, the signs are too thin to show anything: one clear sign is enough, one faint sign is not. */
const ENOUGH = 0.55

/**
 * The mood of a reply, or null when its text gives no clear sign of one.
 * `userName`: the name the user plays under; what the text says of them is not counted.
 */
export function detectMood(text: string, options: { userName?: string } = {}): Mood | null {
  const length = text.length
  if (length === 0) return null

  const you = options.userName?.trim()
  const aboutUser = you ? new RegExp(`${escape(you)}(?:['’]s)?\\s+(?:\\S+\\s+){0,1}$`, 'iu') : null

  const scores = new Map<Mood, { score: number; last: number }>()
  for (const mood of MOODS) {
    for (const item of SIGNS[mood]) {
      const [pattern, weight] = Array.isArray(item) ? item : [item, 1]
      pattern.lastIndex = 0
      for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
        // What comes just before, within the same sentence.
        const before = text.slice(Math.max(0, match.index - 40), match.index).split(/[.!?…\n"“”«»*]/).at(-1) ?? ''
        // "She can't help but smile" is a smile.
        const negated = NEGATION.test(before) && !/help but\s+$/i.test(before)
        if (negated || ABOUT_YOU.test(before) || aboutUser?.test(before)) continue

        const place = START_WEIGHT + (END_WEIGHT - START_WEIGHT) * (match.index / length)
        const entry = scores.get(mood) ?? { score: 0, last: 0 }
        entry.score += weight * place
        entry.last = match.index
        scores.set(mood, entry)
      }
    }
  }

  let best: Mood | null = null
  for (const [mood, entry] of scores) {
    const current = best && scores.get(best)!
    if (!current || entry.score > current.score || (entry.score === current.score && entry.last > current.last)) best = mood
  }
  if (best && scores.get(best)!.score >= ENOUGH) return best

  // No word says it. Punctuation still can, when it is loud enough: "What?!"
  // (A plain question mark is not a sign of anything: most replies end on a question.)
  return /\?!|!\?/.test(text) ? 'surprise' : null
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
