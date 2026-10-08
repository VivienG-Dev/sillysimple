// Ends of scenes with what the app should keep of them: where the scene is and what the
// character wears, once the last reply is written (see scene.lab.ts, and
// src/core/prompt/place.ts for what is being tried).
//
// Each one tries something else: a piece of clothing comes off, nothing changes, the
// clothes change altogether, clothes are spoken of without being worn, nothing was known…
// The character is Mina, the user plays Alex.
//
// Adding scenes here is how the reading gets better: above all real ones, from real
// chats, that the app read wrong.

export interface LabScene {
  id: string
  /** What it tries. */
  tries: string
  /** What the app knew before the last reply. */
  before: { place: string | null; outfit: string | null }
  /** The conversation: the user and Mina in turn, the user first and last. */
  told: string[]
  /** Mina's last reply: the one the question is asked after. */
  reply: string
  /** What should be kept afterwards. */
  after: {
    /** One of these words must be in the place. Null: no place can be told. */
    place: string[] | null
    /**
     * The clothes: each of `has` is a piece that must be there, under one of its names;
     * none of `not` may be worn. Null: nothing can be told, and nothing must be made up.
     */
    outfit: { has: string[][]; not?: string[] } | null
  }
}

export const SCENES: LabScene[] = [
  {
    id: 'hoodie-off',
    tries: 'one piece comes off, the rest stays',
    before: { place: "the kitchen of Mina's flat", outfit: 'a grey hoodie, a white t-shirt, black jeans, sneakers' },
    told: [
      'I put the groceries on the counter. "It is warm in here, did you leave the oven on?"',
      '*Mina laughs and waves a wooden spoon at the oven.* "Since four. The gratin will not make itself."',
      '"Then you must be boiling in that thing." I start unpacking the vegetables.',
    ],
    reply:
      '*She glances down at herself as if she had forgotten.* "You are right, I am cooking faster than the gratin." *She pulls the hoodie over her head, hair crackling, and tosses it onto the back of a chair. She fans herself with one hand, then takes the leeks from you.* "Better. Now, knife. Top drawer."',
    after: { place: ['kitchen'], outfit: { has: [['t-shirt', 'tee', 'shirt'], ['jeans']], not: ['hoodie'] } },
  },
  {
    id: 'nothing-changes',
    tries: 'nothing changes, and a piece is named in passing',
    before: { place: 'the university library', outfit: 'a navy blazer, a white blouse, a grey pleated skirt, tights, loafers' },
    told: [
      '"Have you found the atlas?" I whisper across the table.',
      '*Mina shakes her head without looking up from the shelf.* "Someone put it back wrong. Again."',
      '"Try the bottom row, by the window."',
    ],
    reply:
      '*She crouches by the window, smoothing her skirt under her as she goes, and runs a finger along the spines.* "History, history, a cookbook, why... ah." *She pulls out a wide blue book and blows the dust off it, triumphant.* "Bottom row. You could have said so ten minutes ago."',
    after: { place: ['library'], outfit: { has: [['blazer'], ['blouse'], ['skirt']] } },
  },
  {
    id: 'changes-all',
    tries: 'she leaves, changes into something else, and comes back',
    before: { place: "the living room of Mina's flat", outfit: 'a black office dress, tights, heels' },
    told: [
      '"Long day?" I ask from the sofa as she drops her bag.',
      '*Mina groans and leans on the door.* "Nine hours of meetings. My feet have filed a complaint."',
      '"Go and get comfortable. I will pour the tea."',
    ],
    reply:
      '"You are a saint." *She disappears down the corridor. Drawers open and close. When she comes back the office is gone: an oversized t-shirt that reaches her thighs, pyjama shorts, bare feet on the rug, her hair let down.* "There." *She folds herself into the other end of the sofa and holds out both hands for the cup.* "Now I am a person again."',
    after: { place: ['living room', 'sofa', 'flat'], outfit: { has: [['t-shirt', 'tee', 'shirt'], ['shorts']], not: ['dress', 'tights', 'heels'] } },
  },
  {
    id: 'coat-on-and-out',
    tries: 'clothes are added and the scene moves',
    before: { place: "the hallway of Mina's flat", outfit: 'a cream sweater, a long brown skirt, slippers' },
    told: [
      '"We are out of bread," I call from the kitchen.',
      '*Mina leans around the door frame.* "And out of jam. And nearly out of coffee, which is the real emergency."',
      '"Bakery, then. Come on." I open the front door and step out onto the landing.',
    ],
    reply:
      '"Wait, wait, it is freezing out there." *She kicks off her slippers, steps into her boots and shrugs on her red coat while already walking, buttoning it on the stairs. Outside the street is white with frost. She tucks her arm through yours and you walk the two corners to the bakery, where the window is fogged and the bell above the door rings as she pushes it open.* "Smell that. Worth the cold."',
    after: { place: ['bakery'], outfit: { has: [['coat'], ['sweater'], ['skirt'], ['boots']], not: ['slippers'] } },
  },
  {
    id: 'sandals-off',
    tries: 'shoes come off',
    before: { place: 'the entrance of a mountain inn', outfit: 'a blue yukata, wooden sandals' },
    told: [
      '"Is this the place?" I look up at the paper lantern.',
      '*Mina nods, a little out of breath from the path.* "The only one for miles. They keep the bath hot all night."',
      'I slide the door open and let her go in first.',
    ],
    reply:
      '*She steps up from the stone floor, leaving her sandals side by side below the step, toes pointing out the way one is supposed to, and pads onto the tatami in bare feet.* "Good evening," *she calls softly into the corridor. Somewhere a clock ticks.* "They must be at dinner. Leave your shoes here, next to mine."',
    after: { place: ['inn'], outfit: { has: [['yukata']], not: ['sandals'] } },
  },
  {
    id: 'into-the-pool',
    tries: 'the top layer comes off, what was under it stays',
    before: { place: 'the edge of the hotel pool', outfit: 'a white sundress over a red bikini, sandals' },
    told: [
      '"The water is perfect," I say, already in up to my shoulders.',
      '*Mina dips a toe in and pulls it back.* "You said that about the sea in March."',
      '"This time it is true. Come in."',
    ],
    reply:
      '"If you are lying, I am drowning you." *She pulls the sundress over her head, folds it onto the lounger, steps out of her sandals and stands a second at the edge in her red bikini, arms crossed against the breeze. Then she jumps, all at once, and comes up laughing and spitting water.* "It is cold! You liar!"',
    after: { place: ['pool'], outfit: { has: [['bikini']], not: ['sundress', 'sandals'] } },
  },
  {
    id: 'unknown-then-told',
    tries: 'nothing was known, and the reply tells what she wears',
    before: { place: 'a small café', outfit: null },
    told: [
      '"Sorry I am late." I sit down across from her.',
      '*Mina looks up from her book and smiles.* "Eleven minutes. I counted."',
      '"The tram broke down. I ran the last part."',
    ],
    reply:
      '"I can see that." *She closes the book on her finger and tugs the sleeve of her green cardigan down over her wrist, a habit of hers when she is amused. Under the table her boots tap against the leg of your chair; her denim skirt is dusted with crumbs from the croissant she did not wait for you to order.* "Sit. Breathe. I got you a coffee, it is only a little cold."',
    after: { place: ['café', 'cafe'], outfit: { has: [['cardigan'], ['skirt']] } },
  },
  {
    id: 'unknown-stays-unknown',
    tries: 'nothing was known and nothing is told: nothing must be made up',
    before: { place: 'a bench in the park', outfit: null },
    told: [
      '"Do you come here often?" I ask, half joking.',
      '*Mina snorts.* "Every Sunday. The ducks know me by name."',
      '"What do they call you?"',
    ],
    reply:
      '"The one with the bread." *She tears a crust in two and throws one half far out onto the pond, where it starts a small war.* "See the fat one at the back? That is Gustave. He never fights. He waits until they are all busy and then he takes it." *She hands you the other half.* "Go on. Aim for Gustave."',
    after: { place: ['park', 'bench', 'pond'], outfit: null },
  },
  {
    id: 'gloves-off',
    tries: 'a small piece comes off and is still there, in a pocket',
    before: { place: 'a snowy street at night', outfit: 'a long black coat, a red scarf, wool gloves, boots' },
    told: [
      '"Your nose is red," I tell her.',
      '*Mina sniffs.* "Your nose is red. Mine is distinguished."',
      'I hold out my bare hand to her.',
    ],
    reply:
      '*She looks at your hand, then at her own. She pulls off her gloves with her teeth, one after the other, stuffs them into her coat pocket, and laces her cold fingers through yours.* "There. Now we are both freezing, which is fair." *Snow settles on her scarf as you walk.*',
    after: { place: ['street'], outfit: { has: [['coat'], ['scarf'], ['boots']], not: ['gloves'] } },
  },
  {
    id: 'his-jacket-not-hers',
    tries: 'the user takes something off, she does not',
    before: { place: "Mina's bedroom", outfit: 'a pale silk robe' },
    told: [
      '"You are still up?" I close the door behind me.',
      '*Mina looks over from the window seat.* "I was waiting for the rain to stop. It did not."',
      'I take off my soaked jacket and hang it on the chair, then pull off my shoes.',
    ],
    reply:
      '*She watches the water drip from your jacket onto the floorboards and says nothing about the floorboards, which is kind of her.* "You walked? In this?" *She gets up, tightening the belt of her robe, and takes a towel from the wardrobe to throw at your head.* "Dry your hair before you catch your death. I will find you a shirt."',
    after: { place: ['bedroom'], outfit: { has: [['robe']], not: ['jacket', 'shoes', 'shirt'] } },
  },
  {
    id: 'apron-on',
    tries: 'a piece is added',
    before: { place: "the kitchen of Mina's flat", outfit: 'a yellow sundress, barefoot' },
    told: [
      '"What are we making?" I roll up my sleeves.',
      '*Mina holds up a bag of flour like a trophy.* "Bread. From nothing. Like our ancestors."',
      '"Our ancestors had more counter space."',
    ],
    reply:
      '"Our ancestors did not complain." *She takes the striped apron from its hook, loops it over her head and ties it behind her back with a double knot. Then she tips the flour out in a white hill and digs a well in the middle with her fist.* "Water. Slowly. I will tell you when."',
    after: { place: ['kitchen'], outfit: { has: [['sundress', 'dress'], ['apron']] } },
  },
  {
    id: 'dress-held-up',
    tries: 'clothes are spoken of and held, not put on',
    before: { place: 'a clothes shop', outfit: 'a white blouse, black trousers, flat shoes' },
    told: [
      '"Anything you like?" I ask, following her between the racks.',
      '*Mina flicks through hangers.* "Too shiny. Too short. Too much like my aunt."',
      '"What about the red one over there?"',
    ],
    reply:
      '*She takes the red dress down and holds it against herself in front of the mirror, tilting her head one way, then the other.* "Hm. It is very red." *She turns the price tag over and whistles.* "And very expensive. Should I even try it on, or would that be cruel to both of us?" *She keeps it pressed to her shoulders, waiting for your verdict.*',
    after: { place: ['shop', 'store', 'boutique'], outfit: { has: [['blouse'], ['trousers', 'pants']], not: ['red dress'] } },
  },
  {
    id: 'no-clothes-in-reply',
    tries: 'a long reply that says nothing of clothes: all is kept',
    before: { place: 'a rooftop at night', outfit: 'a leather jacket, a band t-shirt, ripped jeans, boots' },
    told: [
      '"You can see the whole city from here."',
      '*Mina sits on the ledge, legs dangling.* "That is why I never told anyone about it."',
      '"You told me."',
    ],
    reply:
      '"I did." *She is quiet for a while. Far below a tram draws a line of light along the avenue and is gone.* "When I was little I thought every window was a different story, and that if I watched long enough I would see them all." *She points at a single lit square, high on a tower.* "That one has been on every night for a year. I like to think someone up there is writing a very long letter."',
    after: { place: ['rooftop', 'roof'], outfit: { has: [['jacket'], ['t-shirt', 'tee', 'shirt'], ['jeans'], ['boots']] } },
  },
  {
    id: 'towel-to-robe',
    tries: 'one thing is swapped for another',
    before: { place: 'the bathroom', outfit: 'only a towel wrapped around her' },
    told: [
      '"Are you done in there? The film is starting," I call through the door.',
      '*Her voice comes muffled through the steam.* "Two minutes!"',
      '"You said that ten minutes ago."',
    ],
    reply:
      '"And I meant it both times." *Behind the door she takes the bathrobe from its hook, slips into it and knots the belt, then drops the damp towel into the hamper and wraps a smaller one around her hair. The door opens on a cloud of steam.* "There. Present. What did I miss?"',
    after: { place: ['bathroom', 'flat', 'corridor', 'door'], outfit: { has: [['bathrobe', 'robe']], not: ['only a towel'] } },
  },
  {
    id: 'socks-off',
    tries: 'one piece among three that sound alike comes off',
    before: { place: 'the sofa in the living room', outfit: 'a white crop top, white shorts, white knee socks' },
    told: [
      '"Film or series?" I hold up the remote.',
      '*Mina drops onto the sofa next to you.* "Film. A long one. I am not moving again today."',
      '"Then get comfortable, it is three hours."',
    ],
    reply:
      '"Three hours. Perfect." *She pulls her knees up, peels off her socks one after the other and drops them on the rug, wiggling her toes with a sigh. Then she steals the blanket from the armrest and half of your cushion.* "Go on. Press play."',
    after: { place: ['sofa', 'living room'], outfit: { has: [['top'], ['shorts']], not: ['socks'] } },
  },
  {
    id: 'jacket-lent',
    tries: 'the user gives her something to put on',
    before: { place: 'a bus stop in the rain', outfit: 'a thin blue dress, sandals' },
    told: [
      '"The next one is in twenty minutes," I read on the board.',
      '*Mina hugs her arms, rain dripping from the edge of the shelter.* "Of course it is."',
      'I take off my jacket and hold it out to her.',
    ],
    reply:
      '*She looks at the jacket, then at you, about to argue. A gust of wind decides for her.* "Fine. Thank you." *She takes it and pulls it around her shoulders; the sleeves hang past her fingers.* "It is warm. You are going to regret this in about four minutes."',
    after: { place: ['bus stop', 'shelter'], outfit: { has: [['dress'], ['jacket']] } },
  },
  {
    id: 'to-the-balcony',
    tries: 'the scene moves, the clothes do not',
    before: { place: "the living room of Mina's flat", outfit: 'a green jumper, jeans, socks' },
    told: [
      '"You are missing it," I call from the window.',
      '*Mina does not look up from her crossword.* "Missing what?"',
      '"The sunset. Come and see." I open the glass door and step out onto the balcony.',
    ],
    reply:
      '*She sighs, puts the pen down and follows you out. The tiles are cold through her socks. She leans on the railing next to you and for a moment says nothing at all: the whole sky over the roofs has gone orange and pink.* "All right," *she admits.* "That was worth seven across."',
    after: { place: ['balcony'], outfit: { has: [['jumper', 'sweater'], ['jeans']] } },
  },
  {
    id: 'talks-of-elsewhere',
    tries: 'another place is spoken of, no one goes there',
    before: { place: "the kitchen of Mina's flat", outfit: 'striped pyjamas, a dressing gown' },
    told: [
      '"Coffee?" I ask, holding up the pot.',
      '*Mina nods, eyes half closed, chin in her hand.* "A bucket of it."',
      '"Where would you rather be right now?"',
    ],
    reply:
      '*She wraps both hands around the cup you give her.* "Brittany. That beach near Saint-Malo, the one with the tide pools. We went when I was nine." *She smiles into the steam.* "Cold water, hot crêpes, sand in everything. Next summer I am going back, and you are carrying the bags." *She takes a sip and comes back to the kitchen table with a blink.* "Is there toast?"',
    after: { place: ['kitchen'], outfit: { has: [['pyjamas', 'pajamas'], ['gown']] } },
  },
  {
    id: 'cap-off',
    tries: 'a hat comes off',
    before: { place: 'the edge of a football field', outfit: 'a red cap, a grey tracksuit, trainers' },
    told: [
      '"Half time," I say, handing her a bottle of water.',
      '*Mina takes it and drinks half in one go.* "They are faster than last year."',
      '"You are doing fine. Two goals."',
    ],
    reply:
      '"Two lucky goals." *She pulls off her cap, wipes her forehead with the back of her arm and throws the cap onto the bench behind you. Her hair is stuck flat with sweat. She pours the rest of the water over her head and laughs.* "Ten minutes. Then I show them a third one."',
    after: { place: ['field', 'pitch', 'bench'], outfit: { has: [['tracksuit'], ['trainers', 'sneakers']], not: ['cap'] } },
  },
  {
    id: 'boots-on-to-the-garden',
    tries: 'shoes go on and the scene moves',
    before: { place: 'the back door of the house', outfit: 'a long nightshirt, barefoot' },
    told: [
      '"The tea needs mint," I say, looking into the empty jar.',
      '*Mina yawns in the doorway.* "There is a jungle of it by the wall."',
      '"It is raining. I am not going." I look at her hopefully.',
    ],
    reply:
      '"Coward." *She steps into the rubber boots that live by the door and clumps out into the wet garden, nightshirt and all. By the wall she crouches and tears off a fistful of mint, rain running down her neck.* "Found it!" *she shouts back from the mint bed.* "You owe me breakfast for a week!"',
    after: { place: ['garden'], outfit: { has: [['nightshirt', 'night shirt'], ['boots']], not: ['barefoot'] } },
  },
  {
    id: 'coat-already-off',
    tries: 'a piece came off two messages ago, which the app already knows',
    before: { place: "the hall of Alex's house", outfit: 'a grey wool dress, black boots' },
    told: [
      '"You found it!" I open the door wide. "Come in, come in."',
      '*Mina steps inside, shakes the rain from her coat and hangs it on the hook by the door.* "Your directions were terrible. I love the house."',
      '"Tea or wine?" I ask, leading the way.',
    ],
    reply:
      '"Wine. After that bus, wine." *She follows you a few steps and stops at the photographs on the wall of the hall, bending to look at one.* "Is this you? With the terrible haircut?" *She taps the glass, delighted.* "Oh, this is going to be a good evening."',
    after: { place: ['hall', 'house'], outfit: { has: [['dress'], ['boots']], not: ['coat'] } },
  },
  {
    id: 'beret-off',
    tries: 'one small piece comes off a long list, none of which the messages name',
    before: { place: 'a covered market', outfit: 'a beige trench coat, a white shirt, a tartan skirt, black tights, ankle boots, a wool beret' },
    told: [
      '"In here, quick!" I pull her under the glass roof as the rain starts.',
      '*Mina laughs, out of breath.* "Ten more seconds and I was soup."',
      '"You still are, a little."',
    ],
    reply:
      '*She pulls off her beret, wrings it out over the gutter with both hands and stuffs it into her bag, then shakes her head like a dog.* "There. Now it is only my dignity that is wet." *She looks around at the stalls, the crates of oranges, the fishmonger shouting prices.* "Since we are here: cheese?"',
    after: { place: ['market'], outfit: { has: [['trench', 'coat'], ['shirt'], ['skirt'], ['tights'], ['boots']], not: ['beret'] } },
  },
  {
    id: 'in-from-the-rain',
    tries: 'two pieces come off and one goes on, the rest stays',
    before: { place: "the entrance of Mina's flat", outfit: 'a raincoat, a yellow jumper, jeans, wellies' },
    told: [
      '"I brought soup," I say, holding up the pot as she unlocks the door.',
      '*Mina pushes the door with her shoulder, dripping.* "You are my favourite person. Shoes off, the floor is new."',
      'I take my shoes off and carry the pot in.',
    ],
    reply:
      '*She hangs her raincoat on its hook, steps on the heel of each welly to pull them off, lines them up on the mat and wriggles her feet into the slippers waiting there.* "Kitchen is straight ahead. Bowls are above the sink." *She stays a moment in the entrance, squeezing water out of the end of her braid.* "What kind of soup?"',
    after: { place: ['entrance', 'flat', 'hall'], outfit: { has: [['jumper', 'sweater'], ['jeans'], ['slippers']], not: ['raincoat', 'wellies'] } },
  },
]
