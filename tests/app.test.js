"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const { JSDOM, VirtualConsole } = require("jsdom");
const C = require("../core.js");
const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const scripts = ["core.js", "transport.js", "app.js"].map((name) =>
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
async function mount(t, override, extension = false) {
  const errors = [],
    requests = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(e.message));
  const dom = new JSDOM(html, {
    url: `${extension ? "chrome-extension://test-extension/index.html" : "http://127.0.0.1:8765/"}#date=${date}&service=forest&guests=2`,
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
  if (extension)
    w.chrome = {
      runtime: {
        sendMessage: async (message) => {
          const url = "extension:" + message.action;
          requests.push({ url, options: message.body });
          const custom = override ? await override(url, message.body) : null;
          return { ok: true, data: custom ? await custom.json() : payload() };
        },
      },
    };
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
  scripts.forEach((s, index) =>
    w.eval(
      extension && index === 1
        ? fs.readFileSync(path.join(root, "extension/transport.js"), "utf8")
        : s,
    ),
  );
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
test("standalone dashboard uses the extension transport and hides the server-only park tab", async (t) => {
  const { w, doc, requests } = await mount(
    t,
    (url) =>
      url === "extension:status"
        ? response({ ...payload(), forest_connected: true })
        : null,
    true,
  );
  assert.equal(doc.getElementById("connectButton").hidden, false);
  assert.equal(doc.getElementById("clearData").hidden, false);
  assert.equal(doc.querySelector("[data-service=knps]").hidden, true);
  doc
    .getElementById("searchForm")
    .dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true }));
  await waitFor(() =>
    requests.some((request) => request.url === "extension:start"),
  );
  assert.equal(
    requests.some((request) => request.url.startsWith("/api/")),
    false,
  );
  doc.getElementById("connectButton").click();
  await waitFor(() =>
    requests.some((request) => request.url === "extension:connect"),
  );
});
test("web API approval status never asks a visitor to install an extension or log in", async (t) => {
  const { doc } = await mount(t, (url) =>
    url.startsWith("/api/status")
      ? response({
          ...payload(),
          items: [],
          sources: { forest: { state: "pending_integration" } },
        })
      : null,
  );
  assert.match(
    doc.getElementById("sourceBanner").textContent,
    /설치나 로그인은 필요하지 않습니다/,
  );
  assert.equal(doc.getElementById("connectButton").hidden, true);
});
test("website park refresh still starts the shared server collector without extension access", async (t) => {
  const { doc, requests } = await mount(t, (url) =>
    url === "/api/refresh" ? response({ state: "running" }, 202) : null,
  );
  doc.querySelector("[data-service=knps]").click();
  await waitFor(() => !doc.getElementById("searchButton").disabled);
  doc.getElementById("refreshButton").click();
  await waitFor(() =>
    requests.some((request) => request.url === "/api/refresh"),
  );
  assert.equal(
    requests.filter((request) => request.url === "/api/refresh").length,
    1,
  );
  assert.equal(doc.getElementById("connectButton").hidden, true);
});
test("website search reads server data without extension setup and queues a shared refresh", async (t) => {
  const { w, doc, requests } = await mount(t);
  doc
    .getElementById("searchForm")
    .dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true }));
  await waitFor(() => !doc.getElementById("searchButton").disabled);
  assert.equal(doc.getElementById("connectButton").hidden, true);
  assert.equal(doc.getElementById("clearData").hidden, true);
  assert.equal(
    requests.filter((x) => x.url === "/api/forest/search").length,
    1,
  );
  assert.equal(
    requests.filter((x) => x.url === "/api/forest/refresh").length,
    0,
  );
});

test("website shows offline queue honestly and later replaces it with shared fresh results", async (t) => {
  let queued = false,
    completed = false;
  const { w, doc, requests } = await mount(t, (url) => {
    if (url === "/api/forest/search") {
      queued = true;
      return response({}, 202);
    }
    if (url.startsWith("/api/status"))
      return response({
        ...payload(),
        refresh: {
          total: 2,
          pending: completed ? 0 : queued ? 2 : 0,
          queued: completed ? 0 : queued ? 2 : 0,
          running: 0,
          failed: 0,
          fresh: completed ? 2 : 0,
          offline: !completed,
        },
      });
    return null;
  });
  doc
    .getElementById("searchForm")
    .dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true }));
  await waitFor(() =>
    doc.getElementById("sourceBanner").textContent.includes("갱신 대기"),
  );
  assert.match(doc.getElementById("sourceBanner").textContent, /수집기/);
  assert.equal(doc.getElementById("cancelSearch").hidden, true);
  completed = true;
  doc.querySelector(".date-card:not(.active)").click();
  await waitFor(() =>
    doc.getElementById("sourceBanner").textContent.includes("5분"),
  );
  assert.equal(
    requests.filter((r) => r.url === "/api/forest/search").length,
    2,
  );
  assert.equal(doc.getElementById("connectButton").hidden, true);
});
test("website remains installation-free even when a legacy bridge reports connected", async (t) => {
  const { w, doc, requests } = await mount(t, (url) => {
    if (url.startsWith("/api/status"))
      return response({ ...payload(), forest_connected: true });
    if (url === "/api/forest/refresh")
      return response(
        {
          job: {
            id: "paired",
            state: "pending",
            facilities: catalog.forests,
            done: 0,
          },
        },
        202,
      );
    return null;
  });
  doc
    .getElementById("searchForm")
    .dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true }));
  await waitFor(() => !doc.getElementById("searchButton").disabled);
  assert.equal(
    requests.filter((request) => request.url === "/api/forest/refresh").length,
    0,
  );
  assert.doesNotMatch(doc.getElementById("toast").textContent, /연결한 뒤/);
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
test("an authoritative empty snapshot removes prior room availability from the dashboard", async (t) => {
  let empty = false;
  const { doc } = await mount(t, (url) =>
    url.startsWith("/api/status")
      ? response({ ...payload(), items: empty ? [] : payload().items })
      : null,
  );
  assert.equal(doc.getElementById("availableStat").textContent, "1곳");
  empty = true;
  doc.getElementById("refreshButton").click();
  await waitFor(() => !doc.getElementById("searchButton").disabled);
  assert.equal(doc.getElementById("availableStat").textContent, "미확인");
});

test("a shared storage outage retains the last good observations with their real times", async (t) => {
  let failed = false;
  const { doc } = await mount(t, (url) =>
    url.startsWith("/api/status")
      ? response(
          failed
            ? {
                schema_version: 1,
                items: [],
                sources: { forest: { state: "unavailable" } },
              }
            : payload(),
        )
      : null,
  );
  failed = true;
  doc.getElementById("refreshButton").click();
  await waitFor(() => !doc.getElementById("searchButton").disabled);
  assert.equal(doc.getElementById("availableStat").textContent, "1곳");
  assert.match(doc.getElementById("resultList").textContent, /빈자리 1실/);
});
test("later service selection wins over a delayed earlier response", async (t) => {
  let delayed = false,
    resolveOld;
  const { w, doc } = await mount(t, (url) => {
    if (url.startsWith("/api/status?service=forest") && delayed)
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
