// Long chats for the exact-memory lab, and lines that come back to them much later.
//
// `old`: the chat's old messages, oldest first, the ones that are no longer shown to the
// model. Each chat has details planted in it (a name, a promise, a gift, a fear), with
// ordinary messages around them. `cases`: later moments of the same chat. `messages` are
// the latest messages, the last one the user's line the reply answers; `expect` the old
// messages (by their place in `old`, from 0) that should come back with it: any one of
// them is enough.
//
// The kinds:
//   implied  comes back to a detail without its words: the meaning's work
//   echo     comes back to it with one of its words (a name, an object)
//   none     an ordinary line: nothing to bring back
//   near     close to something said, but not about it: nothing to bring back either
//
// Written by Claude on 9 October 2026. When a real chat brings back the wrong moment, or
// misses one, add it here, then `pnpm recall:lab`.

export type RecallCaseKind = 'implied' | 'echo' | 'none' | 'near'

export interface RecallCase {
  kind: RecallCaseKind
  messages: string[]
  expect: number[]
}

export interface RecallChat {
  id: string
  character: string
  user: string
  /** Who says each old message: the user on even places, the character on odd ones. */
  old: string[]
  cases: RecallCase[]
}

const SUZU: RecallChat = {
  id: 'suzu',
  character: 'Suzu',
  user: 'Robin',
  old: [
    /* 0 */ 'Hey, Suzu. You flew past my window again this morning. You almost took the laundry with you.',
    /* 1 */ '*Suzu lands on the railing with a wobble, her broom humming under her.* "Sorry, sorry! Biscuit was in a mood. He hates Mondays more than I do." *She grins and pushes her headphones down around her neck.* "Want a ride to school? It is way faster than the bus."',
    /* 2 */ "I would love to, but I cannot. Since I fell out of my uncle's apple tree when I was seven, I freeze the moment my feet leave the ground. I broke my arm in two places.",
    /* 3 */ '*Her grin softens.* "Oh. That is… actually really scary, Robin. Okay. No flying, then. Not until you want to." *She hops down and walks beside you instead, the broom floating along behind her like a sulky dog.* "We walk. Biscuit can deal with it."',
    /* 4 */ 'Thanks. So, did you finish the math homework? The one with the trains leaving the stations?',
    /* 5 */ '*She groans so loudly a pigeon takes off.* "Don\'t. I stared at it for an hour and the trains just kept leaving without me." *She narrows her eyes at you.* "Deal: you help me with the equations, and I teach you how to whistle with two fingers. The loud kind. The kind that stops taxis."',
    /* 6 */ 'Deal. I have always wanted to do that.',
    /* 7 */ '*She shakes your hand very seriously.* "Then it is a contract. Witches take contracts seriously, you know." *A pause.* "Mostly."',
    /* 8 */ 'Wait, look, near the clock tower. Is that a kitten stuck behind the bins?',
    /* 9 */ '*Suzu is already crouching, coaxing it out with soft clicking sounds.* "Hey, little one. You are lost, huh?" *The kitten is grey, with a blue collar and a tiny tag.* "It says Mochi. And there is an address… the flower shop on Hill Street! That is Mrs. Haru\'s place." *She tucks the kitten into her jacket.* "Come on, we are making a delivery. A free one."',
    /* 10 */ 'Mrs. Haru almost cried when she saw it. She gave us each a sunflower.',
    /* 11 */ '*Suzu sticks her sunflower behind her ear.* "Best delivery fee I have ever had." *She walks a little taller all the way to school.*',
    /* 12 */ 'Hey, you looked worried in class. What is wrong?',
    /* 13 */ '*She fiddles with the strap of her bag.* "The night-flight exam is next month. I already failed it twice." *She lowers her voice.* "When the fog comes in off the sea I lose all sense of direction. Up, down, the harbour, the hills, it all turns into the same grey soup. Last time I landed on a fishing boat instead of the lighthouse."',
    /* 14 */ "Then take this. It was my grandfather's, an old brass compass. It always points north, even in fog. I think he would like it to be used.",
    /* 15 */ '*She holds it in both hands like it might break.* "Robin… I can\'t take your grandpa\'s compass." *You insist, and she finally closes her fingers around it.* "Okay. I will keep it safe. I promise. And I will bring it back the day I pass."',
    /* 16 */ 'Lunch break. Do you want half of my sandwich?',
    /* 17 */ '*She shakes her head and pulls a paper bag out of her bag with great ceremony.* "Melon bread. From the little kiosk at the train station. The best food on the entire planet." *She makes a face at your lunch box.* "As long as there are no pickled plums in there. Those are a crime."',
    /* 18 */ 'I like pickled plums.',
    /* 19 */ '*She gasps, scandalised.* "Then this friendship is in danger." *She breaks her melon bread in two and hands you half anyway.*',
    /* 20 */ 'The summer festival is on Saturday. Do you want to go together?',
    /* 21 */ '*Her cheeks go pink, and three pencils on the desk float up a little.* "Y-yes! Obviously! As friends. Festival friends." *She coughs.* "Let\'s meet at the lighthouse at eight. You can see the whole bay from there when the lanterns go up."',
    /* 22 */ 'Why does the whole greenhouse smell like smoke?',
    /* 23 */ '*She goes very still.* "So. Funny story. I was practising a warming spell for the tomatoes, and the curtain was closer than I thought, and it went up like a torch." *She clasps her hands.* "Mr. Oda is asking everyone. Please, please do not tell him it was me."',
    /* 24 */ 'Fine. I will tell him I saw a spark from the old heater.',
    /* 25 */ '*She throws her arms around you before she can think about it, then jumps back.* "You are the best. I owe you. I owe you so much. I will owe you forever, probably."',
  ],
  cases: [
    {
      kind: 'implied',
      expect: [2],
      messages: ['*She offers you the broom again.* "Just a tiny hop?"', "You know why I can't. My arm still aches when I think about that day."],
    },
    {
      kind: 'implied',
      expect: [5, 6, 7],
      messages: ['I did every single one of your equations. When do I get my lesson?'],
    },
    {
      kind: 'implied',
      expect: [9, 10],
      messages: ['I saw that little grey cat again today, the one we brought back to the flower lady.'],
    },
    {
      kind: 'implied',
      expect: [13],
      messages: ['The weather says there will be thick mist over the bay tonight. Are you going to be alright up there?'],
    },
    {
      kind: 'implied',
      expect: [14, 15],
      messages: ['Do you still carry the thing I gave you, the one that always finds north?'],
    },
    {
      kind: 'implied',
      expect: [17],
      messages: ['I stopped by the train station on the way. Guess what I bought you.'],
    },
    {
      kind: 'implied',
      expect: [21],
      messages: ['*She waves goodbye.* "See you Saturday!"', 'Wait, where were we supposed to meet again?'],
    },
    {
      kind: 'implied',
      expect: [23, 24],
      messages: ['The teacher asked me about the burned curtain again. I think he suspects something.'],
    },
    { kind: 'echo', expect: [9], messages: ['How is Mochi doing these days?'] },
    {
      kind: 'echo',
      expect: [14, 15],
      messages: ['Did the compass help you during the exam?'],
    },
    {
      kind: 'none',
      expect: [],
      messages: ["Let's sit here and watch the boats for a while."],
    },
    {
      kind: 'none',
      expect: [],
      messages: ['*She stretches.* "I could sleep for a week."', 'Same. Okay, I am going home. See you tomorrow.'],
    },
    {
      kind: 'near',
      expect: [],
      messages: ['My cousin is coming to visit next week. She is very loud.'],
    },
    {
      kind: 'near',
      expect: [],
      messages: ['I need to buy a new pencil case before Monday.'],
    },
  ],
}

const ROWAN: RecallChat = {
  id: 'rowan',
  character: 'Rowan',
  user: 'Robin',
  old: [
    /* 0 */ 'So this is the shop. Every clock stopped at the same minute. That is creepy.',
    /* 1 */ '*Rowan crouches by the counter, rain dripping from the brim of his hat.* "Eleven fifty-two. All of them." *He taps a mint out of the tin and crunches it.* "Someone wanted us to notice the time. Which means it is probably not the time that matters."',
    /* 2 */ 'Did anyone see anything that night?',
    /* 3 */ '*He flips open his notebook.* "One witness. Elsie Marr, works the night cranes at the east docks. Says she saw a man in a green scarf come out of here at midnight, walking fast, hands in his pockets." *He snaps the notebook shut.* "She also drinks on the job. So, half a witness."',
    /* 4 */ 'Why do you work alone? Everyone else at the station has a partner.',
    /* 5 */ '*His jaw tightens.* "I had one. Dask. Best detective I ever knew." *He looks out at the canal.* "After the Harlow case he turned in his badge and moved to the coast. Fixes boats now. Doesn\'t answer letters." *A long silence.* "I keep his desk clear. Don\'t ask me why."',
    /* 6 */ "Look at this. There is something stitched into the lining of the victim's coat.",
    /* 7 */ '*Rowan takes it carefully with two fingers.* "A pawn ticket. Number 4471." *His eyes light up for the first time all night.* "Now that is something nobody wanted us to find. Good eyes, Robin."',
    /* 8 */ 'I have not eaten since this morning.',
    /* 9 */ '*He sighs and turns up his collar.* "Then we go to Nell\'s. My sister runs a noodle bar on Fifth Lock." *Almost a smile.* "She feeds us for free, on one condition: we bring her gossip. The juicier the better. She has a better network than the whole police force."',
    /* 10 */ 'Your sister is terrifying. And her noodles are amazing.',
    /* 11 */ '*He nods, very serious.* "Both true. Never tell her I said so."',
    /* 12 */ 'The quickest way to the pawnshop is across the old canal. We would have to jump to the barge.',
    /* 13 */ '*He stops at the edge, looking at the black water.* "We take the bridge." *When you raise an eyebrow, he mutters,* "I never learned to swim. Grew up in a city made of canals and never learned. Yes, I know. Laugh later."',
    /* 14 */ 'I am not laughing. We take the bridge.',
    /* 15 */ '*He walks a little faster, and you could swear he looks grateful.*',
    /* 16 */ 'What did the pawnbroker tell you?',
    /* 17 */ '*Rowan leans on the wet railing outside the shop.* "Mr. Vance remembers ticket 4471. A silver music box, small, engraved with a swallow. It plays a lullaby when you open it." *He frowns.* "The victim pawned it a week before he died, and someone came to buy it back the next day. Paid in cash. Wore gloves."',
    /* 18 */ 'Rowan. Someone threw a brick through my window last night.',
    /* 19 */ '*He is at your door in ten minutes, coat thrown on over his pyjamas.* *He turns the brick over. A note is tied to it with string: STOP DIGGING.* "They know where you live." *His voice is very quiet.* "You sleep at my place until this is done. No arguments."',
    /* 20 */ 'Do you ever think about leaving Greywater?',
    /* 21 */ '*He is quiet for a while, watching the rain.* "Every day." *Then, softer:* "When this case is closed, let\'s take the train to the sea. Just once. Somewhere it doesn\'t rain all the time." *He clears his throat.* "That is a promise. I don\'t make many."',
  ],
  cases: [
    {
      kind: 'implied',
      expect: [3],
      messages: ['That crane operator from the docks, the one who saw the stranger leave. Can we really trust her?'],
    },
    {
      kind: 'implied',
      expect: [5],
      messages: ['You never told me what really happened with the man who used to sit at the empty desk.'],
    },
    {
      kind: 'implied',
      expect: [6, 7],
      messages: ["Did you keep the little numbered slip we found sewn into the dead man's coat?"],
    },
    {
      kind: 'implied',
      expect: [9, 10],
      messages: ['I am starving. Can we go see your sister? I have some news she will love.'],
    },
    {
      kind: 'implied',
      expect: [13],
      messages: ['*He eyes the flooded street.*', 'The water is up to our knees here and rising. Are you going to be okay if it gets deeper?'],
    },
    {
      kind: 'implied',
      expect: [17],
      messages: ['What was that silver thing the pawnbroker told you about? The one that plays music?'],
    },
    {
      kind: 'implied',
      expect: [21],
      messages: ['When all of this is over, are we still going to the seaside like you said?'],
    },
    {
      kind: 'echo',
      expect: [18, 19],
      messages: ['Whoever threw that brick, do you think they will come back?'],
    },
    {
      kind: 'echo',
      expect: [3],
      messages: ['We should talk to Elsie Marr again.'],
    },
    {
      kind: 'none',
      expect: [],
      messages: ['Pass me the umbrella, it is pouring.'],
    },
    {
      kind: 'none',
      expect: [],
      messages: ['*Rowan checks his watch.* "Late."', "Let's check the next street, then call it a night."],
    },
    {
      kind: 'near',
      expect: [],
      messages: ['My neighbour plays the violin every night. It is driving me crazy.'],
    },
    {
      kind: 'near',
      expect: [],
      messages: ['I used to collect stamps when I was a kid.'],
    },
  ],
}

const MORDAX: RecallChat = {
  id: 'mordax',
  character: 'Mordax',
  user: 'Robin',
  old: [
    /* 0 */ 'Okay, demon. The bookshelf will not build itself. Here are the instructions.',
    /* 1 */ '*Mordax holds the booklet at arm\'s length as if it might bite.* "These runes are in a language I do not know. Swedish, you say? A cruel tongue." *He flips to page four, studies it, and sets it gently on fire with one finger.* "That page offended me. We will proceed without it."',
    /* 2 */ 'You burned the page with the screws on it!',
    /* 3 */ '*He folds his arms.* "A lord of the Seventh Pit does not need screws. He needs resolve." *A pause.* "And perhaps screws. Where do mortals keep their screws?"',
    /* 4 */ 'I bought some flowers for the table. Lavender, it smells nice.',
    /* 5 */ '*Mordax sneezes so hard that the curtains flutter and a small flame escapes his nose.* "Remove. The purple. Weeds." *His eyes water.* "There is no lavender in Hell, mortal, and now I understand why. It is a weapon."',
    /* 6 */ 'Your phone is ringing. It says "Mom". Do not answer it!',
    /* 7 */ '*He has already answered it, in a deep, polished voice.* "Good evening, madam. This is Gary. The plumber." *A pause.* "Yes, the pipes are… very wet. Your child is a delight. Farewell." *He hangs up, deeply proud of himself.* "I have saved you. You are welcome."',
    /* 8 */ 'Game night! Want to play Scrabble? Loser does the dishes for a week.',
    /* 9 */ '*An hour later, he stares at the board in disbelief.* "Q-I is not a word. It is two letters fighting." *You show him the dictionary. He closes his eyes.* "Very well. A lord honours his wagers. I will wash your mortal plates for seven days." *He mutters,* "Seven terrible days."',
    /* 10 */ 'Did you have any pets in Hell?',
    /* 11 */ '*His whole face changes.* "Pickles. A three-headed newt. The left head bit and the right head sang, and the middle one only ever slept." *He sighs.* "He lives with my steward now. I send him crickets every solstice."',
    /* 12 */ 'That is the cutest thing you have ever said.',
    /* 13 */ '*He points a warning claw at you.* "Speak of this to no one."',
    /* 14 */ 'I am going to vacuum the living room now.',
    /* 15 */ '*The moment the machine roars, Mordax is on top of the wardrobe, wings half open, hissing at it.* "WHAT IS THAT BEAST. It devours the floor. It SCREAMS." *He refuses to come down until it is back in the cupboard, and keeps one eye on the cupboard for the rest of the evening.*',
    /* 16 */ 'Mrs. Pruitt from downstairs stopped me on the stairs. She says our flat smells like rotten eggs.',
    /* 17 */ '*Mordax sniffs his own sleeve, offended.* "That is the noble scent of sulphur." *You explain that you told her the boiler was broken and a repairman was coming.* "A lie to protect a lord. You grow more devious every day, mortal. I approve."',
    /* 18 */ 'You are being weird. Why did you just hide something behind your back?',
    /* 19 */ '*He keeps both hands behind him.* "No reason." *Flour drifts down onto the carpet. Then an egg rolls out from under his coat and breaks.* "…Your day of birth is on Saturday. I was going to bake a cake. It was going to be a surprise. A terrible, magnificent surprise."',
  ],
  cases: [
    {
      kind: 'implied',
      expect: [4, 5],
      messages: ['Can I put some of those purple flowers back in the vase, or will you set the curtains on fire again?'],
    },
    {
      kind: 'implied',
      expect: [6, 7],
      messages: ['My mother says the nice repairman on the phone was very polite. Who was he, Mordax?'],
    },
    {
      kind: 'implied',
      expect: [8, 9],
      messages: ['The sink is full. I believe someone lost a word game last night.'],
    },
    {
      kind: 'implied',
      expect: [10, 11],
      messages: ['Tell me again about that animal you had down there. The one with too many heads.'],
    },
    {
      kind: 'implied',
      expect: [1, 2],
      messages: ['We are stuck again. If only some of the manual had not gone up in smoke.'],
    },
    {
      kind: 'implied',
      expect: [18, 19],
      messages: ['Why is there flour on the carpet again? What are you planning for the weekend?'],
    },
    {
      kind: 'implied',
      expect: [14, 15],
      messages: ['I am about to clean the carpets with the loud machine. You might want to leave the room.'],
    },
    {
      kind: 'implied',
      expect: [16, 17],
      messages: ['The old lady downstairs is complaining about the smell again. What do I tell her this time?'],
    },
    {
      kind: 'echo',
      expect: [10, 11],
      messages: ['Did you send Pickles his crickets?'],
    },
    {
      kind: 'none',
      expect: [],
      messages: ['Hand me the screwdriver, please.'],
    },
    {
      kind: 'none',
      expect: [],
      messages: ['*He yawns, showing many teeth.*', 'Want to order pizza tonight?'],
    },
    {
      kind: 'near',
      expect: [],
      messages: ['My friend just got a hamster. It is tiny.'],
    },
    {
      kind: 'near',
      expect: [],
      messages: ["The weather is nice. Let's go for a walk in the park."],
    },
  ],
}

export const CHATS: RecallChat[] = [SUZU, ROWAN, MORDAX]
