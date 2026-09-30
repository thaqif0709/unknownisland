// Chat: messages to everyone, whispers, replies and commands.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');

let server;
before(async () => { server = await startServer(); });
after(async () => { if (server) await server.stop(); });

const chat = (c, text) => c.send({ t: 'chat', text });

test('a message reaches everyone', async () => {
  const a = await server.join('say'), b = await server.join('hear');
  const heard = b.next(m => m.t === 'chat' && m.kind === 'all');
  chat(a, '  hello   island  ');
  const m = await heard;
  assert.equal(m.text, 'hello island');
  assert.equal(m.from, a.name);
});

test('whispers only reach the one person, and /r answers', async () => {
  const a = await server.join('wa'), b = await server.join('wb'), c = await server.join('wc');
  const got = b.next(m => m.t === 'chat' && m.kind === 'whisper' && m.from === a.name);
  const echo = a.next(m => m.t === 'chat' && m.kind === 'whisper' && m.to === b.name);
  chat(a, `/w ${b.name} a secret`);
  assert.equal((await got).text, 'a secret');
  await echo;
  const back = a.next(m => m.t === 'chat' && m.kind === 'whisper' && m.from === b.name);
  chat(b, '/r got it');
  assert.equal((await back).text, 'got it');
  await new Promise(r => setTimeout(r, 200));
  assert.ok(!c.messages.some(m => m.t === 'chat' && m.kind === 'whisper'), 'nobody else hears a whisper');
});

test('commands answer only you', async () => {
  const a = await server.join('cmd');
  const who = await a.request({ t: 'chat', text: '/who' }, m => m.t === 'chat' && m.kind === 'system');
  assert.match(who.text, new RegExp(a.name));
  const none = await a.request({ t: 'chat', text: '/nothing' }, m => m.t === 'chat' && m.kind === 'system');
  assert.match(none.text, /no \/nothing command/);
  const gone = await a.request({ t: 'chat', text: '/w nobodyhere hi' }, m => m.t === 'chat' && m.kind === 'system');
  assert.match(gone.text, /isn't on the island/);
});

test('newcomers see the recent messages', async () => {
  const a = await server.join('old');
  chat(a, 'remember me');
  await new Promise(r => setTimeout(r, 200));
  const b = await server.join('new');
  assert.ok(b.welcome.chat.some(m => m.text === 'remember me'));
});
