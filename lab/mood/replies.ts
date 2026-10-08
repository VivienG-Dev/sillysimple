import type { Mood } from '@core/mood/detectMood'

// Replies with the mood they should show, to measure how the app reads moods: by the
// word lists, by the embedding model, and by both together (see mood.lab.ts).
//
// The kinds, each trying something else:
//   plain    the mood is told by a word the lists know: both ways should find it
//   implied  the mood is clear to a reader, with no telling word: only the meaning can
//   none     no feeling shown: nothing must be read, by either
//   other    other languages than the lists' English and French
//   user     the feeling is the user's, the character shows none: nothing must be read
//   turn     the mood changes on the way: the end is what counts
//   trap     a telling word that tells the wrong thing (irony, tears of laughter…)
//
// Adding replies here is how the reading gets better: above all real ones, from real
// chats, that the app read wrong.

export interface LabReply {
  kind: 'plain' | 'implied' | 'none' | 'other' | 'user' | 'turn' | 'trap'
  /** Null: nothing should show. */
  mood: Mood | null
  text: string
  /** The name the user plays under, when the reply speaks of them by name. */
  user?: string
}

const of = (kind: LabReply['kind'], list: [Mood | null, string, string?][]): LabReply[] =>
  list.map(([mood, text, user]) => ({ kind, mood, text, ...(user ? { user } : {}) }))

export const REPLIES: LabReply[] = [
  ...of('plain', [
    ['joy', '*Elara throws her head back and laughs.* "You really came all this way for a map?"'],
    ['joy', '*Her eyes light up at the sight of the old compass.* "Where did you find this?"'],
    ['playful', '*She smirks, leaning on the railing.* "Careful. I might start to like you."'],
    ['love', '*She rests her head on your shoulder, and her heart skips.* "Stay a little longer."'],
    ['shy', '*Mara blushes and looks away.* "I... I did not mean it like that."'],
    ['shy', '"That is not..." *Her cheeks turn crimson.*'],
    ['anger', '*Quill slams his fist on the desk.* "For the last time, no!"'],
    ['anger', '*She glares at the door, clenching her jaw.*'],
    ['surprise', '*Her eyes widen.* "You are alive?"'],
    ['surprise', '"What?! Here? Now?"'],
    ['question', '*Juno tilts her head, puzzled.* "A lighthouse. In the desert."'],
    ['sad', '*Tears well up in her eyes, and her voice cracks.* "He promised he would come back."'],
    ['nervous', '*He fidgets with his sleeve and swallows hard.* "About the ledger..."'],
    ['sigh', '*Quill sighs and rolls his eyes.* "Fine. Sit down."'],
    ['fear', '*She recoils, terrified, her face draining of colour.* "Do not open it."'],
    ['sleepy', '*Elara yawns, rubbing her eyes.* "Is it morning already?"'],
    ['thinking', '*She strokes her chin, lost in thought.* "There may be another way in."'],
    ['joy', '*Elle éclate de rire.* « Tu es venu jusqu\'ici pour une carte ? »'],
    ['shy', '*Mara rougit et détourne le regard.* « Je... ce n\'est pas ce que je voulais dire. »'],
    ['anger', '*Il serre les poings, furieux.* « Pour la dernière fois, non ! »'],
    ['surprise', '*Elle écarquille les yeux.* « Tu es vivant ? »'],
    ['sad', '*Une larme roule sur sa joue.* « Il avait promis de revenir. »'],
    ['sigh', '*Quill soupire et lève les yeux au ciel.* « Bon. Assieds-toi. »'],
    ['question', '*Elle penche la tête, intriguée.* « Un phare. Dans le désert. »'],
    ['sleepy', '*Elle bâille longuement.* « C\'est déjà le matin ? »'],
  ]),

  ...of('implied', [
    ['joy', '"You did it! You actually did it! Oh, this is the best day of my life!" *She spins around the room, arms wide.*'],
    ['joy', '*He cannot stop bouncing on his heels, eyes shining.* "We won. We really won!"'],
    ['joy', '"Finally, some good news! Come here, we are celebrating tonight!"'],
    ['joy', '*Her whole face brightens the moment she sees the puppy.* "Oh my goodness, look at you!"'],
    ['playful', '"Oh, is that so? And here I thought you were the brave one." *She pokes your nose and darts out of reach.*'],
    ['playful', '*He hides the last cookie behind his back, whistling innocently.* "Cookie? What cookie?"'],
    ['playful', '"Bet you cannot catch me, slowpoke!" *She bolts down the hill, looking back to make sure you follow.*'],
    ['playful', '"Careful now. Keep staring like that and I might start charging admission."'],
    ['love', '*She tucks a strand of hair behind your ear, her fingers lingering.* "I could stay like this forever."'],
    ['love', '"You are the best thing that ever happened to me. Do you know that?" *He pulls the blanket around you both.*'],
    ['love', '*He presses his forehead against yours and closes his eyes.* "Do not go. Not tonight."'],
    ['love', '"I made your favourite. I always remember." *She squeezes your hand under the table and does not let go.*'],
    ['shy', '"I-I was not looking at you! I was... looking at the wall. Behind you." *She pulls her scarf up over half her face.*'],
    ['shy', '*He stares very hard at his shoes.* "It is... um. It is a present. For you. Do not make it weird."'],
    ['shy', '"D-do not say things like that out of nowhere..." *Her voice shrinks to almost nothing and she hides behind the menu.*'],
    ['shy', '*She peeks out from behind the door, ears pink.* "You... heard me singing, did you not."'],
    ['anger', '"Do not ever touch my things again. Ever." *The cup in her hand cracks.*'],
    ['anger', '*He kicks the chair across the room.* "Three years! Three years, and this is what I get?"'],
    ['anger', '"Get out. Now. Before I do something we both regret."'],
    ['anger', '*Her voice drops, cold and sharp as a blade.* "Say that again. I dare you."'],
    ['surprise', '"Wait. You are the princess? YOU?" *The tray slips from his hands and clatters on the floor.*'],
    ['surprise', '*She stops mid-sentence, staring at the open door.* "That... that was not there a second ago."'],
    ['surprise', '"No. No way. You are joking. Since when can you fly?"'],
    ['surprise', '*He does a double take, then another.* "Hold on. Is that my brother on the poster?"'],
    ['question', '"A key? But there is no lock anywhere on this ship... is there?" *She turns it over in her fingers.*'],
    ['question', '*He scratches the back of his head.* "Sorry, run that by me again? The cat did what?"'],
    ['question', '"Hm? Why would anyone build a staircase that goes nowhere?"'],
    ['question', '*She squints at the note, turning it upside down.* "Is this even a language?"'],
    ['sad', '*She traces the name on the gravestone with one finger.* "I still set two cups on the table every morning."'],
    ['sad', '"It is fine. Really. I am used to being forgotten." *He looks out the window so you cannot see his face.*'],
    ['sad', '*Her shoulders sink and she stops pretending to smile.* "He is not coming back, is he."'],
    ['sad', '"I kept all your letters. Every one. I just... never thought the last one would be the last."'],
    ['nervous', '"So, um, funny story, about your vase... the blue one... the expensive one..." *He edges toward the door.*'],
    ['nervous', '*She keeps checking the clock, then the window, then the clock again.* "They should have been here by now. Right?"'],
    ['nervous', '"I-is this the right room? I mean, I can come back later. Or never. Never works too."'],
    ['nervous', '*His knee will not stop bouncing under the table and he keeps tugging at his collar.* "No, no, I am completely calm."'],
    ['sigh', '"Oh, wonderful. Another meeting. Just what this day needed."'],
    ['sigh', '*He stares at the mountain of paperwork, then at you, then back at the paperwork.* "...Of course you did."'],
    ['sigh', '"For the third time: the red wire, not the blue one. How hard can it be."'],
    ['sigh', '*She lets her head drop onto the desk with a soft thud.* "Wake me when it is over."'],
    ['fear', '"Did you hear that? Something is in the walls. Do not... do not turn off the light." *She grips your sleeve with both hands.*'],
    ['fear', '*He backs into the corner, breath coming fast and shallow.* "It knows my name. How does it know my name?"'],
    ['fear', '"Run. Do not look back, just run!" *Her voice cracks as the footsteps get closer.*'],
    ['fear', '*She cannot take her eyes off the door handle, slowly turning.* "Please... please let it be locked."'],
    ['sleepy', '"Mm... just resting my eyes... keep talking, I am listening..." *Her head tips onto your shoulder.*'],
    ['sleepy', '*He blinks slowly at the page, reads the same line a fourth time, and gives up.* "What time is it even..."'],
    ['sleepy', '"Nnh... too early. The sun is too loud. Go away." *She burrows deeper under the blanket.*'],
    ['sleepy', '*Her words start to slur and trail off.* "And then we... we should... mm."'],
    ['thinking', '"If the guard changes at midnight, and the tide turns at one... then we have exactly an hour." *She taps the map twice.*'],
    ['thinking', '*He paces the length of the room, counting something off on his fingers.* "No, that cannot be right either. Unless..."'],
    ['thinking', '"Give me a moment. There is a pattern here, I just cannot see it yet."'],
    ['thinking', '*She stares into her tea for a long while before answering.* "It depends on what you mean by safe."'],
    // French, with no word of the lists.
    ['sigh', '« Formidable. Encore une réunion. Il ne manquait plus que ça. »'],
    ['love', '*Elle remet une mèche derrière ton oreille, la main qui s\'attarde.* « Je pourrais rester comme ça toujours. »'],
    ['fear', '« Tu as entendu ? Il y a quelque chose dans les murs. N\'éteins pas la lumière. » *Elle s\'agrippe à ta manche.*'],
    ['nervous', '« Alors, euh, c\'est une drôle d\'histoire, à propos de ton vase... le bleu... celui qui coûtait cher... »'],
  ]),

  ...of('none', [
    [null, '"The harbour is two streets down. Turn left at the fountain."'],
    [null, '*She opens the ledger and runs a finger down the column.* "Forty crates. All accounted for."'],
    [null, '"The storm is coming. Are you staying the night?"'],
    [null, '*He hangs his coat on the hook and sets the lantern on the table.* "The road north is closed until spring."'],
    [null, '"Bread is two coppers, cheese is five. The stew comes with the room."'],
    [null, '*The console lights up one panel at a time.* "Oxygen at ninety-four percent. Hull integrity nominal."'],
    [null, '"My name is Kessa. I guide caravans across the glass desert. We leave at dawn."'],
    [null, '*She unrolls the map and pins its corners with four stones.* "This is the river. This is where we are."'],
    [null, '"There are three doors. The left one leads to the kitchens, the right one to the cellar."'],
    [null, '*He pours two cups of tea and slides one across the table.* "Sugar is in the tin."'],
    [null, '"The train leaves at nine. Platform four. You will need a ticket before boarding."'],
    [null, '*She ties the boat to the post and steps onto the dock.* "The market opens in an hour."'],
    [null, '"I have worked here for six years. Before that I was a clerk in the capital."'],
    [null, '*The inspector writes something in his notebook.* "And where were you between eight and ten?"'],
    [null, '"Take the second corridor, then the stairs. The archive is on the third floor."'],
    [null, '*She checks the list again.* "Rope, lamp oil, two blankets, water for four days."'],
    [null, '"The shop closes at six. We open again tomorrow morning."'],
    [null, '*He adjusts the telescope and steps back.* "That bright one is Jupiter. The four dots beside it are its moons."'],
    [null, '*The wind picks up and the shutters bang against the wall.* "Storm season," *she says, lighting the stove.*'],
    [null, '« Le port est à deux rues d\'ici. Tournez à gauche à la fontaine. »'],
    [null, '*Elle ouvre le registre et suit la colonne du doigt.* « Quarante caisses. Le compte est bon. »'],
    [null, '"El puerto está a dos calles. Gire a la izquierda en la fuente."'],
    [null, '"Der Zug fährt um neun. Gleis vier. Sie brauchen vorher eine Fahrkarte."'],
    [null, '「港は二つ先の通りです。噴水を左に曲がってください。」'],
  ]),

  ...of('other', [
    ['joy', '*Se echa a reír a carcajadas, con los ojos brillantes.* "¡No me lo puedo creer, lo conseguiste!"'],
    ['anger', '*Aprieta los puños, furiosa.* "¡Por última vez, no!"'],
    ['sad', '*Una lágrima le rueda por la mejilla.* "Prometió que volvería."'],
    ['shy', '*Se sonroja y aparta la mirada.* "No... no quería decir eso."'],
    ['surprise', '*Ihre Augen weiten sich.* "Du lebst? Das ist unmöglich!"'],
    ['sigh', '*Er seufzt und verdreht die Augen.* "Na gut. Setz dich."'],
    ['fear', '*Sie weicht zitternd zurück, das Gesicht kreidebleich.* "Mach die Tür nicht auf."'],
    ['sleepy', '*Sie gähnt und reibt sich die Augen.* "Ist es schon Morgen?"'],
    ['love', '*Appoggia la testa sulla tua spalla, il cuore che batte forte.* "Resta ancora un po\'."'],
    ['playful', '*Ti fa l\'occhiolino con un sorrisetto malizioso.* "Attento, potrei affezionarmi."'],
    ['question', '*Inclina la testa, perplessa.* "Un faro. Nel deserto?"'],
    ['nervous', '*Ele mexe na manga, engolindo em seco.* "Sobre o livro de contas..."'],
    ['thinking', '*Ela coça o queixo, perdida em pensamentos.* "Talvez haja outra entrada."'],
    ['joy', '*Ela bate palmas, radiante.* "Que maravilha! Estou tão feliz!"'],
    ['joy', '*彼女は声をあげて笑い、顔を輝かせた。*「本当に来てくれたんだ！嬉しい！」'],
    ['sad', '*涙が頬をつたう。*「帰ってくるって、約束したのに…」'],
    ['anger', '*拳を握りしめ、彼をにらみつける。*「いい加減にして！」'],
    ['shy', '*真っ赤になって目をそらす。*「べ、別にそういう意味じゃないから…」'],
  ]),

  ...of('user', [
    [null, '*You laugh, and the sound fills the room.* "Careful," *she says evenly.*'],
    [null, '*You burst into tears, and she hands you a handkerchief without a word.* "The carriage leaves in ten minutes."'],
    [null, '*You blush furiously.* "The files are on the desk," *he says, turning a page.*'],
    [null, '*Your hands are shaking with rage as you read the letter.* "The courier is waiting outside," *she notes.*'],
    [null, '*Ren yawns and stretches.* "The watch changes at midnight," *she says, checking the ropes.*', 'Ren'],
    [null, '*Ren stares at the map, deep in thought.* "The north gate opens at six," *the guard recites.*', 'Ren'],
  ]),

  ...of('turn', [
    ['anger', '*She laughs at first.* "Very funny." *Then her smile fades and she glares at him, furious.*'],
    ['joy', '*She glares at him.* "You." *Then, slowly, she starts to giggle, and laughs until she cries with joy, grinning.*'],
    ['joy', '"I was so scared when you did not come home." *She lets out a long breath, and then, at last, she laughs and throws her arms around you.* "You are here. You are really here!"'],
    ['sad', '*He starts out cheerful, humming as he opens the letter. By the second line his face has fallen, and he sits down heavily, eyes wet.* "She is gone."'],
    ['fear', '"Ha! You almost had me there." *The lights go out. Her grip tightens on your arm.* "...That was not you, was it? Tell me that was you."'],
  ]),

  ...of('trap', [
    ['sad', '*She gives a sad little smile and looks at the empty chair.* "He would have loved this."'],
    ['anger', '"I am not angry." *Her smile is perfectly pleasant. The pencil in her hand snaps in two.*'],
    ['sigh', '*He laughs, but there is no joy in it, only exhaustion.* "Sure. Why not. Add it to the pile."'],
    ['sigh', '"Oh, I am thrilled. Truly. Can you not tell?" *she says flatly, not looking up from her book.*'],
    ['joy', '*Tears of laughter stream down her face.* "Stop, stop, I cannot breathe!"'],
    ['joy', '*She cries out in delight and claps her hands.* "Again! Do it again!"'],
    ['playful', '"I could kill you," *she says, laughing, and throws a pillow at your head.*'],
    ['love', '*She is crying, but she is smiling too, holding the ring up to the light.* "Yes. Of course, yes."'],
  ]),
]

/**
 * One more sentence per mood, of another make than the app's anchors: the mood named
 * outright. Not used by the app; kept in the vectors to see, afterwards, whether naming
 * a mood places it better than showing it.
 */
export const NAMED: Record<Mood | 'none', string> = {
  joy: 'The character is happy, joyful and delighted.',
  playful: 'The character is playful, teasing and mischievous.',
  love: 'The character is loving, tender and affectionate.',
  shy: 'The character is shy, embarrassed and flustered.',
  anger: 'The character is angry, furious and irritated.',
  surprise: 'The character is surprised, shocked and astonished.',
  question: 'The character is confused, puzzled and curious.',
  sad: 'The character is sad, sorrowful and close to tears.',
  nervous: 'The character is nervous, anxious and uneasy.',
  sigh: 'The character is exasperated, weary and unimpressed.',
  fear: 'The character is afraid, terrified and panicking.',
  sleepy: 'The character is sleepy, drowsy and exhausted.',
  thinking: 'The character is thinking, pondering and considering.',
  none: 'The character is calm and neutral, showing no particular emotion.',
}
