"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const { JSDOM, VirtualConsole } = require("jsdom");
const C = require("../core.js");
const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const scripts = ["core.js", "app.js"].map((name) =>
  fs.readFileSync(path.join(root, name), "utf8"),
);
const date = C.addDays(C.today(), 1);
const catalog = {
  forests: [
    {
      id: "F1",
      service: "forest",
      name: "테스트 숲 하나",
      region: "강원",
      region_id: "2",
      operator: "국립",
      calendar_url:
        "https://www.foresttrip.go.kr/rep/or/sssn/monthRsrvtStatus.do?insttId=F1",
    },
    {
      id: "F2",
      service: "forest",
      name: "테스트 숲 둘",
      region: "강원",
      region_id: "2",
      operator: "공립",
    },
  ],
};
function payload() {
  return {
    schema_version: 1,
    sources: { forest: { state: "ready" }, knps: { state: "ready" } },
    items: catalog.forests.map((f, i) => ({
      ...f,
      checked_at: new Date().toISOString(),
      rooms: [
        {
          id: "r" + i,
          name: i ? "대기 객실" : "빈 객실",
          capacity: 4,
          days: {
            [date]: i
              ? { state: "waitlist", next_rank: 1 }
              : { state: "available" },
          },
        },
      ],
    })),
  };
}
const response = (value, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => structuredClone(value),
});
async function waitFor(check) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw Error("UI condition timed out");
}
async function mount(t, override) {
  const errors = [],
    requests = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(e.message));
  const dom = new JSDOM(html, {
    url: `http://127.0.0.1:8765/#date=${date}&service=forest&guests=2`,
    runScripts: "outside-only",
    virtualConsole: vc,
    pretendToBeVisual: true,
  });
  const w = dom.window;
  Object.assign(w, {
    structuredClone,
    AbortSignal,
    AbortController,
    matchMedia: () => ({ matches: true }),
  });
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (override) {
      const value = await override(String(url), options);
      if (value) return value;
    }
    if (url === "catalog.json") return response(catalog);
    if (url === "camps_meta.json")
      return response([
        { dept_id: "B1", park_name: "설악산", camp_name: "테스트 야영장" },
      ]);
    if (String(url).startsWith("/api/status")) return response(payload());
    return response({ error: "Unsupported test request" }, 404);
  };
  w.addEventListener("error", (e) => errors.push(e.message));
  t.after(() => {
    w.close();
    assert.deepEqual(errors, []);
  });
  scripts.forEach((s) => w.eval(s));
  await waitFor(
    () =>
      w.document.querySelectorAll(".date-card").length === 7 &&
      !w.document.getElementById("searchButton").disabled,
  );
  return { w, doc: w.document, requests };
}
function change(w, el, value) {
  if (el.type === "checkbox" || el.type === "radio") el.checked = value;
  else el.value = value;
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
}

test("full app renders multiple facilities with actual fixture opportunity types", async (t) => {
  const { doc } = await mount(t);
  assert.equal(doc.querySelectorAll(".facility-card").length, 2);
  assert.equal(doc.getElementById("availableStat").textContent, "1곳");
  assert.equal(doc.getElementById("waitStat").textContent, "1곳");
  assert.match(doc.getElementById("resultList").textContent, /1순위부터/);
  assert.equal(doc.querySelector("input[id*=consecutive]"), null);
});
test("disconnected catalog search does not enqueue a job or ask for installation", async (t) => {
  const { w, doc, requests } = await mount(t);
  doc
    .getElementById("searchForm")
    .dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true }));
  await waitFor(() =>
    doc.getElementById("toast").textContent.includes("목록을 검색"),
  );
  assert.equal(
    requests.filter((x) => x.url === "/api/forest/refresh").length,
    0,
  );
});
test("opportunity filters, saved facilities and keyboard focus compose", async (t) => {
  const { w, doc } = await mount(t);
  change(w, doc.querySelector("input[name=status][value=waitlist]"), true);
  assert.equal(doc.querySelectorAll(".facility-card").length, 1);
  const save = doc.querySelector("[data-action=save]");
  save.focus();
  save.click();
  assert.equal(doc.activeElement.dataset.action, "save");
  assert.deepEqual(JSON.parse(w.localStorage.getItem("forest_saved_v1")), [
    "F2",
  ]);
  change(w, doc.getElementById("savedOnly"), true);
  doc.getElementById("tableView").click();
  assert.equal(doc.querySelectorAll("tbody tr").length, 1);
  assert.match(doc.querySelector("table").textContent, /예약대기 1실/);
});
test("bad response preserves last good data and reports failure", async (t) => {
  let invalid = false;
  const { w, doc } = await mount(t, (url) =>
    url.startsWith("/api/status") && invalid
      ? response({ schema_version: 999, items: [], sources: {} })
      : null,
  );
  invalid = true;
  doc.querySelector("#dateStrip button:not(.active)").click();
  await waitFor(() =>
    doc.getElementById("sourceBanner").textContent.includes("가져오지 못했"),
  );
  assert.equal(doc.querySelectorAll(".facility-card").length, 2);
});
test("later service selection wins over a delayed earlier response", async (t) => {
  let delayed = false,
    resolveOld;
  const { w, doc } = await mount(t, (url) => {
    if (url === "/api/status?service=forest" && delayed)
      return new Promise((resolve) => (resolveOld = resolve));
    if (url === "/api/status?service=knps" && delayed)
      return response({
        schema_version: 1,
        sources: { knps: { state: "ready" } },
        items: [
          {
            id: "B1",
            service: "knps",
            name: "최신 야영장",
            region: "강원",
            checked_at: new Date().toISOString(),
            rooms: [],
          },
        ],
      });
  });
  delayed = true;
  doc.querySelector("#dateStrip button:not(.active)").click();
  await waitFor(() => resolveOld);
  doc.querySelector("[data-service=knps]").click();
  await waitFor(() =>
    doc.getElementById("resultList").textContent.includes("최신 야영장"),
  );
  resolveOld(response(payload()));
  await new Promise((r) => setTimeout(r, 20));
  assert.match(doc.getElementById("resultTitle").textContent, /국립공원/);
  assert.match(doc.getElementById("resultList").textContent, /최신 야영장/);
  assert.equal(doc.getElementById("searchButton").disabled, false);
});
test("result text and official links cannot insert HTML or script URLs", async (t) => {
  const data = payload();
  data.items[0].name = "<img src=x onerror=alert(1)>";
  data.items[0].calendar_url = "javascript:alert(1)";
  const { doc } = await mount(t, (url) =>
    url.startsWith("/api/status") ? response(data) : null,
  );
  assert.equal(doc.querySelector("#resultList img"), null);
  assert.equal(doc.querySelector('#resultList a[href^="javascript:"]'), null);
  assert.match(doc.getElementById("resultList").textContent, /<img src=x/);
});
test("empty results recover through reset without losing a working catalog", async (t) => {
  const { w, doc } = await mount(t);
  const input = doc.getElementById("queryInput");
  input.value = "일치하지않는검색";
  input.dispatchEvent(new w.Event("input", { bubbles: true }));
  assert.equal(doc.getElementById("emptyState").hidden, false);
  doc.getElementById("emptyReset").click();
  assert.equal(doc.getElementById("emptyState").hidden, true);
  assert.equal(doc.querySelectorAll(".facility-card").length, 2);
});
