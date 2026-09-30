// Unknown Island client: rendering (three.js, soft and cute), input,
// login screens, and talking to the server. The server decides what actually
// happens; this file predicts your own movement and draws everything.
(() => {
  'use strict';
  const WG = window.WorldGen;
  const { heightAt, fbm, clamp, SPRING, SPAWN, ISL, mulberry32, isNight, phaseName } = WG;
  let RULES = WG.RULES;

  // Places where a new part of the game plugs itself in, instead of editing the shared
  // message switch, the frame loop or the panel list (docs/roadmap/CONTRACTS.md section 3).
  //   UI.net.on('fish-bite', m => ...)   runs after the core has handled each message of that type
  //   UI.onFrame(dt => ...)              runs every frame, before drawing
  //   UI.panels.register('inventory', { el, onOpen })   Esc, closing and "a panel is open" include it
  // (call panels.register from a file numbered after 240-input.js, or from inside a function)
  //   UI.mapLayers.push({ draw(g, at, dotScale, full) })   markers on the map (290-map.js); from any part
  const UI = window.UI = {
    net: {
      handlers: new Map(),
      on(type, fn) { if (!this.handlers.has(type)) this.handlers.set(type, []); this.handlers.get(type).push(fn); },
      emit(m) { for (const fn of this.handlers.get(m.t) || []) fn(m); },
    },
    frameFns: [],
    onFrame(fn) { this.frameFns.push(fn); },
    mapLayers: [],
  };

