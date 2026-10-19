const assert = require('node:assert/strict');
const {today,addDays,nextSaturday,validDate} = require('./core.js');
assert.equal(today(new Date('2026-10-16T15:00:00Z')),'2026-10-17');
assert.equal(nextSaturday('2026-10-18'),'2026-10-24');
assert.equal(addDays('2026-12-31',1),'2027-01-01');
assert.equal(validDate('2026-02-29'),false);
console.log('Single-night date checks passed. Full regressions: node --test tests/core.test.js');
