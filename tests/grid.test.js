"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const E = require("../browser-bridge/extractor.js");
function grid(mark = "대1", day = "2026.10.24", withLink = true) {
  return new JSDOM(
    `<select id="srchInstt"><option selected value="0101">유명산</option></select><div id="monthRsrvtList"><div class="list_left"><ul><li><a>[숲속의집]고라니 (5인/31㎡)</a></li></ul></div><table id="dayListTable"><thead><tr><th>24</th></tr></thead><tbody><tr><td>${withLink ? '<a data-no="official-goods-id">' : ""}<span class="apt_mark" title="고라니 ${day}">${mark}</span>${withLink ? "</a>" : ""}</td></tr></tbody></table></div>`,
  ).window.document;
}
test("rendered official grid yields a verified application rank, not a personal queue rank", () => {
  const result = E.extract(grid(), { id: "0101", month: "2026-10" });
  assert.equal(result.rooms.length, 1);
  assert.deepEqual(result.rooms[0].days["2026-10-24"], {
    state: "waitlist",
    next_rank: 1,
  });
  assert.equal(result.rooms[0].capacity, null);
});
test("room identity remains stable when a fully booked month has no actionable goods links", () => {
  assert.equal(
    E.extract(grid()).rooms[0].id,
    E.extract(grid("완", "2026.10.24", false)).rooms[0].id,
  );
});
test("manual facility or month changes reject stale grids", () => {
  assert.throws(() => E.extract(grid(), { id: "0103" }), /시설/);
  assert.throws(() => E.extract(grid(), { month: "2026-11" }), /월/);
});
test("partial or invalid calendar tables cannot be imported as complete observations", () => {
  const doc = grid();
  doc
    .querySelector(".list_left ul")
    .insertAdjacentHTML("beforeend", "<li><a>다른 객실</a></li>");
  assert.throws(() => E.extract(doc), /완성/);
  assert.throws(() => E.extract(grid("예", "2026.02.30")), /날짜별/);
});
