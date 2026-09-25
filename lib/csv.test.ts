// node lib/csv.test.ts
import assert from 'node:assert/strict';
import { toCsv } from './csv.ts';

const out = toCsv([
  ['title', 'score'],
  ['Plain', 0.97],
  ['Has, comma "and quotes"', 0.5],
  ['Line\nbreak', null],
  ['=HYPERLINK("x")', -1],
]);
assert.equal(out[0], '﻿');
assert.deepEqual(out.slice(1).split('\r\n'), [
  'title,score',
  'Plain,0.97',
  '"Has, comma ""and quotes""",0.5',
  '"Line\nbreak",',
  `"'=HYPERLINK(""x"")",-1`, // formula neutralized; numbers untouched
]);
console.log('csv ok');
