// The Sleeper's requests, carved on the stones (sleeper_requests table).
// stone: where it appears (shore, spring, ridge; null = any). days: time to answer.
// conditions.type:
//   offer        bring items to the stone        { item, count }
//   lanterns_lit lit lanterns at once            { count, minHeight }
//   lantern_fed  one lantern lit and full enough { which: 'east'|'shore'|'spring'|'high', fuel }
//   gather       frogs at the stone at night     { count }
//   fires_dawn   fires still burning at sunrise  { count }
//   fog_walk     stand in thick fog, come back   { seconds }
//   bugs         bugs caught while it's carved   { count }
//   find         someone finds a journal entry   { key }
//   in_cave      frogs in a cave at once         { cave, count }
// reward / penalty: a list of { type } from calm, gift, relic, note, light / press, dread, douse
// pool: false = only asked as a step of a region's chain (the order is in server/regions/<id>.js),
// never picked at random.
const SLEEPER = [
  { key: 'east_flame', text: 'Feed the east flame before the dark moon.', stone: 'shore', days: 4, minDay: 2,
    conditions: { type: 'lantern_fed', which: 'east', fuel: 900 }, reward: [{ type: 'calm', nights: 1 }, { type: 'gift' }], penalty: [{ type: 'press', days: 2 }],
    doneText: 'Warm. I remember warm.', failText: 'The east is dark. So am I.' },
  { key: 'spring_return', text: 'Return what was taken from the spring.', stone: 'spring', days: 3, minDay: 1,
    conditions: { type: 'offer', item: 'stone', count: 8 }, reward: [{ type: 'relic', key: 'eye_stone' }], penalty: [{ type: 'dread', amount: 15 }],
    doneText: 'It is whole. I can see you now.', failText: 'Still taken.' },
  { key: 'three_lights', text: 'Three lights on the ridge. Then I will show you.', stone: 'ridge', days: 5, minDay: 3,
    conditions: { type: 'lanterns_lit', count: 3, minHeight: 7 }, reward: [{ type: 'relic', key: 'old_tooth' }, { type: 'note' }], penalty: [{ type: 'press', days: 2 }],
    doneText: 'Look beneath the stone.', failText: 'Dark on the ridge. I will not show you.' },
  { key: 'fog_walk', text: 'One of you walked into the fog. Walk in after them, and come back.', stone: null, days: 3, minDay: 4,
    conditions: { type: 'fog_walk', seconds: 30 }, reward: [{ type: 'calm', nights: 1 }, { type: 'note' }], penalty: [{ type: 'dread', amount: 20 }],
    doneText: 'You came back. They did not.', failText: 'Nobody came.' },
  { key: 'gather_dark', text: 'Come to me together when it is dark. Stand where I can see you.', stone: null, days: 3, minDay: 2,
    conditions: { type: 'gather', count: 2 }, reward: [{ type: 'relic', key: 'carved_mask' }], penalty: [{ type: 'douse' }],
    doneText: 'Two. Three. I counted you.', failText: 'Alone, all of you.' },
  { key: 'keep_fires', text: 'Keep two fires awake until the sun.', stone: 'shore', days: 3, minDay: 1,
    conditions: { type: 'fires_dawn', count: 2 }, reward: [{ type: 'gift' }], penalty: [{ type: 'press', days: 1 }],
    doneText: 'The dark was shorter.', failText: 'The fires slept. So did you.' },
  { key: 'seeds_mouth', text: 'Seeds for the mouth that feeds you.', stone: 'spring', days: 3, minDay: 1,
    conditions: { type: 'offer', item: 'seeds', count: 6 }, reward: [{ type: 'light' }, { type: 'gift' }], penalty: [{ type: 'press', days: 1 }],
    doneText: 'Fed.', failText: 'Hungry.' },
  { key: 'eat_dark', text: 'Eat what flies in the dark. Five of them.', stone: null, days: 3, minDay: 1,
    conditions: { type: 'bugs', count: 5 }, reward: [{ type: 'calm', nights: 1 }], penalty: [{ type: 'dread', amount: 10 }],
    doneText: 'Good. Grow.', failText: 'Thin frogs.' },
  { key: 'sea_voice', text: 'Bring me the voice of the sea.', stone: 'shore', days: 5, minDay: 3,
    conditions: { type: 'find', key: 'conch' }, reward: [{ type: 'relic', key: 'carved_mask' }, { type: 'calm', nights: 1 }], penalty: [{ type: 'press', days: 2 }],
    doneText: 'I heard it. I have not heard it in so long.', failText: 'Quiet.' },

  // ---- The Landing's chain (W8). Something is coming up out of the sea: the Tidewife. ----
  { key: 'landing_watch', pool: false, text: 'Something is coming up out of the water. Keep two fires awake until the sun, so I can watch it.', stone: 'shore', days: 3,
    conditions: { type: 'fires_dawn', count: 2 }, reward: [{ type: 'gift' }], penalty: [{ type: 'press', days: 1 }],
    doneText: 'It stayed in the water. It did not like the light.', failText: 'It came up while you slept. Look at the sand.' },
  { key: 'landing_weight', pool: false, text: 'It digs at my shore. Bring twelve stones to the spring, so I can hold the sand down.', stone: 'spring', days: 3,
    conditions: { type: 'offer', item: 'stone', count: 12 }, reward: [{ type: 'calm', nights: 1 }], penalty: [{ type: 'dread', amount: 15 }],
    doneText: 'Heavy. Good. It cannot dig here now.', failText: 'It took more of the shore.' },
  { key: 'landing_together', pool: false, text: 'It is louder when you are alone. Come to me together, when it is dark.', stone: 'ridge', days: 3,
    conditions: { type: 'gather', count: 2 }, reward: [{ type: 'light' }, { type: 'note' }], penalty: [{ type: 'douse' }],
    doneText: 'You heard it too. Scratching, under the sand.', failText: 'Alone. It likes you alone.' },
  { key: 'landing_east', pool: false, text: 'Feed the east flame. It watches the water for me.', stone: 'shore', days: 4,
    conditions: { type: 'lantern_fed', which: 'east', fuel: 1200 }, reward: [{ type: 'calm', nights: 1 }, { type: 'gift' }], penalty: [{ type: 'press', days: 2 }],
    doneText: 'I can see it now. It is bigger than it was.', failText: 'The east is dark. It came closer.' },
  { key: 'landing_call', pool: false, text: 'Light three lanterns, so it can find its way to you. Then it will come.', stone: 'ridge', days: 5,
    conditions: { type: 'lanterns_lit', count: 3, minHeight: 0 }, reward: [{ type: 'note' }], penalty: [{ type: 'press', days: 2 }],
    doneText: 'It is coming. At the lowest tide, on the east sand.', failText: 'It lost its way. Light them again.' },

  // ---- The Stairs' chain (C3). Something old keeps the steps: the Keeper of Steps. ----
  { key: 'stair_flint', pool: false, text: 'Up the steps, the ground is full of sharp stones. Bring me six, so I know you went.', stone: 'ridge', days: 3,
    conditions: { type: 'offer', item: 'flint', count: 6 }, reward: [{ type: 'gift' }], penalty: [{ type: 'dread', amount: 10 }],
    doneText: 'Sharp. The steps are sharp. Someone cut them, once.', failText: 'You stayed below.' },
  { key: 'stair_mend', pool: false, text: 'The houses on the steps are falling. Bring their bricks back to me.', stone: 'spring', days: 4,
    conditions: { type: 'offer', item: 'bricks', count: 8 }, reward: [{ type: 'calm', nights: 1 }, { type: 'note' }], penalty: [{ type: 'press', days: 1 }],
    doneText: 'Someone lived there. Someone swept the steps every morning.', failText: 'They fell. Nobody caught them.' },
  { key: 'stair_mine', pool: false, text: 'They dug into the steps, and did not come out. Go in, two of you, and come out again.', stone: 'ridge', days: 4,
    conditions: { type: 'in_cave', cave: 'oldmine', count: 2 }, reward: [{ type: 'light' }, { type: 'gift' }], penalty: [{ type: 'dread', amount: 15 }],
    doneText: 'You came out. Good. They did not.', failText: 'Nobody went in. Nobody came out.' },
  { key: 'stair_herbs', pool: false, text: 'Something on the steps sleeps badly. Bring me the green that heals.', stone: 'spring', days: 3,
    conditions: { type: 'offer', item: 'herbs', count: 6 }, reward: [{ type: 'calm', nights: 1 }], penalty: [{ type: 'press', days: 1 }],
    doneText: 'Quieter now. It turns over, but it does not wake.', failText: 'It is awake. It is counting the steps.' },
  { key: 'stair_climb', pool: false, text: 'Catch the moth that rides the wind at the top of the steps. Then it will come to you.', stone: 'ridge', days: 5,
    conditions: { type: 'find', key: 'wind_moth' }, reward: [{ type: 'note' }], penalty: [{ type: 'press', days: 2 }],
    doneText: 'It heard you climb. At dusk, in the village on the steps. Know its marks.', failText: 'It did not hear you. The steps are very long.' },

  // ---- The Weeping Wood's chain (C4). Something hangs over the Wood: the Hanging Mother. ----
  { key: 'wood_resin', pool: false, text: 'The trees in the north-east are weeping. Bring me their tears.', stone: 'spring', days: 3,
    conditions: { type: 'offer', item: 'resin', count: 6 }, reward: [{ type: 'gift' }], penalty: [{ type: 'dread', amount: 10 }],
    doneText: 'Sticky. Sweet. They are old, and they are sad.', failText: 'You did not go under the trees.' },
  { key: 'wood_rope', pool: false, text: 'Things hang in the Wood. Bring me what they hang from.', stone: 'ridge', days: 4,
    conditions: { type: 'offer', item: 'vine_rope', count: 6 }, reward: [{ type: 'calm', nights: 1 }, { type: 'note' }], penalty: [{ type: 'press', days: 1 }],
    doneText: 'Long. Strong. Something heavy hung from this.', failText: 'Still hanging.' },
  { key: 'wood_hollow', pool: false, text: 'Under the roots there is a room. Go in, two of you, and listen.', stone: 'ridge', days: 4,
    conditions: { type: 'in_cave', cave: 'roothollow', count: 2 }, reward: [{ type: 'light' }, { type: 'gift' }], penalty: [{ type: 'dread', amount: 15 }],
    doneText: 'You heard it breathing above you. Good. Now you know.', failText: 'Nobody went under the roots.' },
  { key: 'wood_lights', pool: false, text: 'Find the light that walks under the trees at night.', stone: 'spring', days: 3,
    conditions: { type: 'find', key: 'lantern_beetle' }, reward: [{ type: 'calm', nights: 1 }], penalty: [{ type: 'press', days: 1 }],
    doneText: 'It does not like light. Remember that.', failText: 'The Wood is dark. It likes that.' },
  { key: 'wood_mantis', pool: false, text: 'Something in the Wood is patient. Find it before it finds you.', stone: 'ridge', days: 5,
    conditions: { type: 'find', key: 'bark_mantis' }, reward: [{ type: 'note' }], penalty: [{ type: 'press', days: 2 }],
    doneText: 'It saw you looking. At night, under the tallest trees. Look up.', failText: 'It was more patient than you.' },
];

// What the stones say when they aren't asking for anything.
const SLEEPER_IDLE = {
  shore: ['They all came from the sea.', 'Stay.', 'I made the water sweet for you.'],
  spring: ['Drink. It is mine to give.', 'The water comes from inside.', 'Rest here.'],
  ridge: ['I have been asleep a long time.', 'Higher. Closer.', 'Do you hear me breathing?'],
};

// Notes the Sleeper leaves on the board as a reward.
const SLEEPER_NOTES = [
  'There is a pool on the hill shaped like an eye. It was not there before.',
  'Pell was here. Pell is still here.',
  'The ground was warm under the ridge stone this morning.',
  'I put my ear to the rock. It was breathing slower, like something asleep.',
];
module.exports = { SLEEPER, SLEEPER_IDLE, SLEEPER_NOTES };
