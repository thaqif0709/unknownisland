// Minigames (P8): the messages players answer them with. The games and the engine that
// keeps the answers are in server/minigames/ (island.minigames, made in the Island
// constructor). Admins try one with /minigame <type> [easy|medium|hard] in chat.

// Messages from the client this system answers (msg.t -> handler; `this` is the Island).
const messages = {
  'minigame-answer'(p, msg) { return this.minigames.answer(p, msg); },
  'minigame-quit'(p, msg) { return this.minigames.quit(p, msg); },
};

module.exports = { messages };
