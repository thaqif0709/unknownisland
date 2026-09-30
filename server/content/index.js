// Default content for the journal and the tides. On start the server inserts
// any of these that are missing into the journal_entries and tide_table
// tables; after that the tables are the source of truth, so new entries can be
// added (or tuned) directly in the database without a code change.
//
// Each topic lives in its own file here (journal, tide, sleeper, bugs, notes, trivia) so
// two people can add content without editing the same file.

const { JOURNAL } = require('./journal');
const { TIDE } = require('./tide');
const { SLEEPER, SLEEPER_IDLE, SLEEPER_NOTES } = require('./sleeper');
const { BUGS } = require('./bugs');
const { ISLAND_NOTES } = require('./notes');
const { TRIVIA } = require('./trivia');

module.exports = { JOURNAL, TIDE, BUGS, ISLAND_NOTES, SLEEPER, SLEEPER_IDLE, SLEEPER_NOTES, TRIVIA };
