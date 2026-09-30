// Moon and weather.
const WG = require('../shared/world-gen');
const { RULES } = WG;

const methods = {
  // ================= Moon and weather =================
  updateEnv() {
    const phase = WG.moonPhase(this.day), w = this.weather;
    const env = { phase, drowning: phase === 0, fullMoon: phase === 4, weather: w,
      rain: w === 'rain' || w === 'storm', storm: w === 'storm', fogStorm: w === 'fogstorm' };
    env.lightMul = env.rain ? RULES.WEATHER.RAIN_LIGHT : 1;
    if (this.sleeper) Object.assign(env, this.sleeperEnv());
    const changed = JSON.stringify(env) !== JSON.stringify(this.env);
    this.env = env;
    if (changed && this.players && this.players.size) this.broadcast({ t: 'env', env });
  },
  rollWeather() {
    const W = RULES.WEATHER.WEIGHTS, opts = Object.entries(W).filter(([k]) => k !== 'fogstorm' || this.day >= RULES.WEATHER.FOGSTORM_MIN_DAY);
    let r = Math.random() * opts.reduce((a, [, v]) => a + v, 0);
    for (const [k, v] of opts) if ((r -= v) <= 0) { this.weather = k; break; }
  },
};

module.exports = { methods };
