// Island trivia (P8): questions for the trivia minigame (used to land fish). Seeded into
// the `fishing_trivia` table where missing, so they can be edited or added to in Neon.
// `answers[0]` is the right one; the server shuffles them. Keep them true to the game
// (the numbers here are from RULES in server/shared/world-gen.js).
const TRIVIA = [
  // fires and building
  { key: 'fire_cost', topic: 'fires', q: 'What does a campfire need?', answers: ['4 wood and 3 stone', '3 wood and 4 stone', '6 wood', '2 wood and 2 clay'] },
  { key: 'fire_feed', topic: 'fires', q: 'How do you keep a fire going?', answers: ['Feed it wood with E', 'Pour seawater on it', 'Stand very still', 'Offer it lamp oil'] },
  { key: 'hearth', topic: 'fires', q: 'What makes a clay hearth better than a campfire?', answers: ['It burns longer and warms a wider circle', 'It never goes out', 'It keeps the rain off', 'It cooks faster'] },
  { key: 'hearth_clay', topic: 'fires', q: 'Where does the clay for a hearth come from?', answers: ['Digging soft dirt with a shovel', 'Breaking rocks', 'The bottom of the spring', 'Crates on the beach'] },
  { key: 'cold', topic: 'fires', q: 'What hurts you at night, away from a fire?', answers: ['The cold', 'The moonlight', 'The crickets', 'The sea breeze'] },
  { key: 'fire_fog', topic: 'fires', q: 'What does a burning fire do to the fog?', answers: ['Pushes it back', 'Makes it thicker', 'Turns it to rain', 'Nothing at all'] },
  // water and food
  { key: 'sea_drink', topic: 'water', q: 'What happens if you drink seawater?', answers: ['You get thirstier', 'Nothing', 'You feel full', 'You can breathe underwater'] },
  { key: 'bucket_boil', topic: 'water', q: 'How do you make seawater safe to drink?', answers: ['Boil it in a bucket on a fire', 'Leave it in the sun', 'Stir in some sand', 'Pour it through a shell'] },
  { key: 'bucket_drinks', topic: 'water', q: 'How many drinks are in a bucket of boiled water?', answers: ['3', '1', '5', '10'] },
  { key: 'bucket_max', topic: 'water', q: 'How many buckets can you carry?', answers: ['4', '1', '2', '8'] },
  { key: 'spring', topic: 'water', q: 'Where is the island\'s fresh water?', answers: ['The spring, inland', 'The tide pools', 'Inside the palms', 'Under the lanterns'] },
  { key: 'rain', topic: 'water', q: 'What does rain do for you?', answers: ['Slowly refills your water', 'Puts out your hunger', 'Makes you faster', 'Nothing'] },
  { key: 'coconut', topic: 'food', q: 'What does a coconut give you?', answers: ['Food, a little water, and seeds', 'Wood', 'Lamp oil', 'A cloak patch'] },
  { key: 'still', topic: 'food', q: 'When do you get hungry and thirsty?', answers: ['When you move', 'Only at night', 'Only while sprinting', 'Only in the rain'] },
  // tides and the beach
  { key: 'tide_when', topic: 'tides', q: 'When does the sea wash new things up?', answers: ['Every sunrise', 'Every noon', 'Only in storms', 'At midnight'] },
  { key: 'tide_storm', topic: 'tides', q: 'What comes the morning after a storm?', answers: ['A bigger tide', 'No tide at all', 'Snow', 'A second sun'] },
  { key: 'tide_old', topic: 'tides', q: 'What happens to wash-ups nobody picks up?', answers: ['The next tide takes them back', 'They rot', 'They sink into the sand forever', 'They walk away'] },
  { key: 'glass', topic: 'tides', q: 'Which of these washes up on the beaches?', answers: ['Sea glass', 'Iron ore', 'Pine cones', 'Lamp posts'] },
  { key: 'crate', topic: 'tides', q: 'What can a washed-up crate hold?', answers: ['Seeds or lamp oil', 'A pickaxe', 'Another frog', 'Clay'] },
  // bugs
  { key: 'firefly', topic: 'bugs', q: 'When do fireflies come out?', answers: ['At night', 'At noon', 'Only in the rain', 'Only in winter'] },
  { key: 'dragonfly', topic: 'bugs', q: 'When can you catch a dragonfly?', answers: ['In the day', 'At night', 'Only in fog', 'Never'] },
  { key: 'rain_beetle', topic: 'bugs', q: 'Which bug only comes out when it rains?', answers: ['The rain beetle', 'The cricket', 'The firefly', 'The bark beetle'] },
  { key: 'bug_catch', topic: 'bugs', q: 'How do you catch a bug?', answers: ['Press E when it\'s close', 'Throw a stone', 'Whistle', 'Hold still for a night'] },
  // the Stilled and the fog
  { key: 'stilled_look', topic: 'the Stilled', q: 'When do the Stilled move?', answers: ['When nobody is looking at them', 'Only when you run', 'Only in daylight', 'When you sing'] },
  { key: 'stilled_where', topic: 'the Stilled', q: 'Where do the Stilled walk?', answers: ['Only through fog', 'Only on the beach', 'Anywhere, even by fires', 'Only in water'] },
  { key: 'stilled_touch', topic: 'the Stilled', q: 'What happens when a Stilled reaches you?', answers: ['You are knocked down and drop some of what you carry', 'Nothing', 'You fall asleep until morning', 'You turn to stone'] },
  { key: 'stilled_alone', topic: 'the Stilled', q: 'Who do the Stilled notice from further away?', answers: ['Frogs who are alone or full of dread', 'Frogs holding wood', 'Frogs by a fire', 'Frogs who are sitting'] },
  { key: 'dread_down', topic: 'the Stilled', q: 'Which of these calms your dread?', answers: ['Sitting warm by a fire', 'Walking into the fog', 'Being alone at night', 'Staring at a Stilled'] },
  { key: 'drowning', topic: 'the moon', q: 'What is the dark moon called?', answers: ['The Drowning Moon', 'The Sleeping Moon', 'The Ember Moon', 'The Hollow Moon'] },
  { key: 'moon_cycle', topic: 'the moon', q: 'How many days is the moon\'s cycle?', answers: ['8', '3', '12', '30'] },
  // lanterns
  { key: 'lantern_oil', topic: 'lanterns', q: 'What lights an old stone lantern?', answers: ['Lamp oil', 'Wood', 'A torch from a fire', 'A bucket of water'] },
  { key: 'oil_make', topic: 'lanterns', q: 'What is lamp oil pressed from?', answers: ['Seeds', 'Coconut shells', 'Clay', 'Fish'] },
  { key: 'great_lantern', topic: 'lanterns', q: 'What does a great lantern on the hills need?', answers: ['Offerings from three different frogs', 'Ten oil from one frog', 'A full moon', 'A storm'] },
  { key: 'lantern_out', topic: 'lanterns', q: 'What happens after a lantern goes cold?', answers: ['The fog slowly takes its clearing back', 'It relights itself at dawn', 'It crumbles', 'Nothing ever'] },
  // the carvings
  { key: 'stones', topic: 'the carvings', q: 'How many carving stones are there?', answers: ['3', '1', '5', '12'] },
  { key: 'stone_names', topic: 'the carvings', q: 'Which of these is a carving stone?', answers: ['The ridge stone', 'The moon stone', 'The river stone', 'The tooth stone'] },
  { key: 'ignored', topic: 'the carvings', q: 'What happens if a carving\'s request is ignored?', answers: ['The fog presses harder', 'The stone breaks', 'Nothing', 'It asks again politely'] },
  // tools and gathering
  { key: 'ore', topic: 'tools', q: 'What do you need to mine ore?', answers: ['A pickaxe', 'An axe', 'A shovel', 'Your bare hands'] },
  { key: 'axe', topic: 'tools', q: 'What does a copper axe do?', answers: ['Two wood from every chop', 'Chops trees in one blow', 'Mines iron', 'Digs clay'] },
  { key: 'regrow', topic: 'tools', q: 'What happens to a tree after it\'s felled?', answers: ['It grows back from a sapling', 'It\'s gone for good', 'It turns to stone', 'It floats out to sea'] },
];

module.exports = { TRIVIA };
