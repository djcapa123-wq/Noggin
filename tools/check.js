// Validates data.js. Run: node tools/check.js
global.window = {};
require('../data.js');
const D = window.NOGGIN_DATA;
const SCENES = new Set(['football','baseball','basketball','hockey','geography','movies','tv','food','history','science','music']);
const GROUPS = new Set(['s','g','p','x','h']);
let bad = 0;
const fail = (m) => { bad++; console.log('PROBLEM:', m); };
const seenQ = new Map();
D.TRIVIA.forEach((day, i) => {
  if (day.length !== 9) fail(`Trivia day ${i + 1} has ${day.length} questions (needs 9)`);
  day.forEach((q, j) => {
    if (!SCENES.has(q[0])) fail(`Trivia day ${i + 1} q${j + 1}: unknown scene ${q[0]}`);
    if (!q[1] || !q[2]) fail(`Trivia day ${i + 1} q${j + 1}: missing question or answer`);
    const k = q[1].toLowerCase();
    if (seenQ.has(k)) fail(`Trivia day ${i + 1} repeats a question from day ${seenQ.get(k)}: ${q[1]}`);
    seenQ.set(k, i + 1);
  });
});
const seenP = new Map();
D.LONGSHOT.forEach((p, i) => {
  if (!SCENES.has(p[0])) fail(`Long Shot ${i}: unknown scene ${p[0]}`);
  if (!GROUPS.has(p[1])) fail(`Long Shot ${i}: unknown group ${p[1]}`);
  const entries = p[3].split(';');
  if (entries.length < 12) fail(`Long Shot ${i} (${p[2]}) has only ${entries.length} answers (needs 12+)`);
  const names = entries.map((e) => e.replace(/^[*+-]/, '').split('|')[0].trim().toLowerCase());
  names.forEach((n, j) => { if (!n) fail(`Long Shot ${i}: empty entry`); if (names.indexOf(n) !== j) fail(`Long Shot ${i}: duplicate answer ${n}`); });
  if (!entries.some((e) => e.startsWith('*'))) fail(`Long Shot ${i}: mark the most common answers with *`);
  const k = p[2].toLowerCase();
  if (seenP.has(k)) fail(`Long Shot prompt repeated: ${p[2]} (${seenP.get(k)} and ${i})`);
  seenP.set(k, i);
});
D.LSDAYS.forEach((d, i) => {
  if (d.length !== 7) fail(`Long Shot day ${i + 1} has ${d.length} prompts (needs 7)`);
  d.forEach((x) => { if (!D.LONGSHOT[x]) fail(`Long Shot day ${i + 1} points to missing prompt ${x}`); });
  if (new Set(d).size !== d.length) fail(`Long Shot day ${i + 1} uses a prompt twice`);
});
const start = new Date(2026, 10, 19);
const last = (n) => { const d = new Date(start); d.setDate(d.getDate() + n - 1); return d.toDateString(); };
console.log(`Trivia days: ${D.TRIVIA.length} (through ${last(D.TRIVIA.length)})`);
console.log(`Long Shot days: ${D.LSDAYS.length} (through ${last(D.LSDAYS.length)}), prompts in bank: ${D.LONGSHOT.length}`);
console.log(bad ? `${bad} problem(s) found` : 'All good');
process.exit(bad ? 1 : 0);
