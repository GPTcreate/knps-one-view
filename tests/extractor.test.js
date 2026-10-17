const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../browser-bridge/extractor.js');
test('official rendered waiting marks identify the next application rank',()=>{assert.deepEqual(E.parseMark('대1'),{state:'waitlist',next_rank:1});assert.deepEqual(E.parseMark('대3'),{state:'waitlist',next_rank:3});assert.deepEqual(E.parseMark('대'),{state:'waitlist'});});
test('official full, closure, priority and lottery marks remain distinct',()=>{for(const [text,state] of [['예','available'],['완','full'],['휴','closed'],['공','closed'],['우','priority'],['추','lottery'],['','unknown'],['대0','unknown'],['보통','unknown']])assert.equal(E.parseMark(text).state,state);});
test('rendered nominal occupancy is not misrepresented as maximum occupancy',()=>{const x=E.parseName('[숲속의집]고라니 (5인/31㎡)');assert.equal(x.base_capacity,5);assert.equal(x.capacity,null);assert.equal(x.name,'고라니');assert.equal(x.type,'숲속의집');});
test('unexpected official room labels survive as labels without invented capacities',()=>{assert.deepEqual(E.parseName('새로운 시설'),{name:'새로운 시설',type:'숙소',capacity:null});});
