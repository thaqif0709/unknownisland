// Island trivia: a question from the fishing_trivia table (server/content/trivia.js), its
// answers shuffled; pick the right one. Harder levels offer all four answers, easy three.
module.exports = {
  type: 'trivia',
  name: 'Island trivia',
  build(rng, level, island) {
    const all = (island.content && island.content.trivia) || [];
    if (!all.length) throw new Error('no trivia questions');
    const t = all[Math.floor(rng() * all.length)];
    const right = t.answers[0];
    let pool = t.answers.slice(1).sort(() => rng() - .5).slice(0, level === 0 ? 2 : 3);
    pool = [right, ...pool];
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const correct = pool.indexOf(right);
    return {
      puzzle: { q: t.q, answers: pool, topic: t.topic || null },
      check: a => a && a.choice === correct,
      solve: () => ({ choice: correct }),
      ms: [12000, 10000, 8000][level],
    };
  },
};
