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
