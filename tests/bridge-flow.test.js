"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const { JSDOM } = require("jsdom");
const root = path.resolve(__dirname, "..");
const extractor = fs.readFileSync(
  path.join(root, "browser-bridge/extractor.js"),
  "utf8",
);
const content = fs.readFileSync(
  path.join(root, "browser-bridge/content.js"),
  "utf8",
);
const month = "202610";
async function waitFor(check) {
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw Error("Bridge condition timed out");
}
async function bridge(t, cancel = false, standalone = false) {
  const dom = new JSDOM(
    `<select id="srchSido"><option value="1">수도권</option></select><select id="srchInstt"><option value="0101">유명산</option><option value="0103">산음</option></select><select id="srchForest"><option value="01">숙소</option></select><select id="monthSelectBox"><option value="${month}">10월</option></select><input type="radio" id="inqurSctin01" checked><button id="searchBtn">검색</button><button id="reserve">예약신청</button><div id="monthRsrvtList"></div>`,
    {
      url:
        "https://www.foresttrip.go.kr/rep/or/sssn/monthRsrvtStatus.do" +
        (standalone ? "" : "#forest-seat-connect=fixture-only-key"),
      runScripts: "outside-only",
    },
  );
  const w = dom.window,
    doc = w.document,
    results = [],
    messages = [],
    intervals = [];
  let reserveClicks = 0;
  const task = {
    id: "test-job",
    state: "pending",
    date: "2026-10-24",
    facilities: [
      { id: "0101", region_id: "1", name: "유명산" },
      { id: "0103", region_id: "1", name: "산음" },
    ],
  };
  const originalTimeout = w.setTimeout.bind(w);
  w.setTimeout = (fn) => originalTimeout(fn, 0);
  w.setInterval = (fn) => {
    intervals.push(fn);
    return intervals.length;
  };
  w.chrome = {
    runtime: {
      sendMessage: async (message) => {
        messages.push(message);
        if (message.path === "/api/bridge/job")
          return {
            ok: true,
            data: { active: true, job: structuredClone(task) },
          };
        if (message.path === "/api/bridge/result") {
          if (message.body.item) results.push(message.body.item);
          if (cancel && results.length === 1) {
            task.state = "cancelled";
            await intervals[0]();
          }
        }
        if (message.path === "/api/bridge/progress" && message.body.complete)
          task.state = "complete";
        return { ok: true, data: { ok: true } };
      },
    },
  };
  Object.defineProperty(doc, "cookie", {
    get() {
      throw Error("Cookie access is forbidden in this test");
    },
  });
  doc
    .getElementById("reserve")
    .addEventListener("click", () => reserveClicks++);
  doc.getElementById("searchBtn").addEventListener("click", () => {
    const id = doc.getElementById("srchInstt").value;
    doc.getElementById("monthRsrvtList").innerHTML =
      `<div class="list_left"><ul><li><a>[숲속의집]${id} 객실 (4인/26㎡)</a></li></ul></div><table id="dayListTable"><tr><th>24</th></tr><tr><td><span class="apt_mark" title="객실 2026.10.24">${id === "0101" ? "대2" : "예"}</span></td></tr></table>`;
  });
  t.after(() => w.close());
  w.eval(extractor);
  w.eval(
    standalone
      ? fs.readFileSync(path.join(root, "extension/content.js"), "utf8")
      : content,
  );
  await waitFor(
    () =>
      task.state === "complete" ||
      (cancel &&
        doc
          .getElementById(
            standalone
              ? "forest-seat-extension-panel"
              : "forest-seat-bridge-panel",
          )
          .textContent.includes("중단")),
  );
  return { task, results, messages, reserveClicks, w };
}
test("bridge simulates two official grids and transfers only room status; no booking or cookie access", async (t) => {
  const x = await bridge(t);
  assert.equal(x.results.length, 2);
  assert.equal(x.reserveClicks, 0);
  assert.deepEqual(
    JSON.parse(JSON.stringify(x.results[0].rooms[0].days["2026-10-24"])),
    { state: "waitlist", next_rank: 2 },
  );
  assert.equal(x.results[1].rooms[0].days["2026-10-24"].state, "available");
  assert.equal(x.w.location.hash, "");
  assert.equal(
    x.messages.filter(
      (m) => m.path === "/api/bridge/progress" && m.body.complete,
    ).length,
    1,
  );
});
test("bridge cancellation stops before reading the next facility", async (t) => {
  const x = await bridge(t, true);
  assert.equal(x.results.length, 1);
  assert.equal(x.task.state, "cancelled");
  assert.equal(
    x.messages.some(
      (m) => m.path === "/api/bridge/progress" && m.body.complete,
    ),
    false,
  );
});
test("background bridge rejects other websites, methods and arbitrary local paths", async () => {
  let listener;
  const fetched = [];
  const context = vm.createContext({
    URL,
    AbortSignal,
    Set,
    chrome: {
      runtime: {
        onMessage: {
          addListener(fn) {
            listener = fn;
          },
        },
      },
    },
    fetch: async (url) => {
      fetched.push(url);
      return { ok: true, json: async () => ({ ok: true }) };
    },
  });
  vm.runInContext(
    fs.readFileSync(path.join(root, "browser-bridge/background.js"), "utf8"),
    context,
  );
  const valid = {
    type: "forest-bridge",
    path: "/api/bridge/job",
    method: "GET",
    token: "test-token",
  };
  const sender = {
    tab: {
      url: "https://www.foresttrip.go.kr/rep/or/sssn/monthRsrvtStatus.do",
    },
  };
  const invoke = (message, from = sender) =>
    new Promise((resolve) => listener(message, from, resolve));
  for (const [message, from] of [
    [{ ...valid, path: "/server.py" }, sender],
    [{ ...valid, method: "POST" }, sender],
    [valid, { tab: { url: "https://attacker.example/" } }],
    [valid, { tab: { url: sender.tab.url + "-fake" } }],
  ])
    assert.equal((await invoke(message, from)).ok, false);
  assert.equal(fetched.length, 0);
  assert.equal((await invoke(valid)).ok, true);
  assert.deepEqual(fetched, ["http://127.0.0.1:8765/api/bridge/job"]);
});
test("standalone content collects two facilities without a pairing token, local server, account access or booking", async (t) => {
  const x = await bridge(t, false, true);
  assert.equal(x.results.length, 2);
  assert.equal(x.reserveClicks, 0);
  assert.ok(
    x.messages.every(
      (message) => message.type === "forest-extension" && !("token" in message),
    ),
  );
  assert.equal(x.w.location.hash, "");
});
test("standalone content honours cancellation before querying the next facility", async (t) => {
  const x = await bridge(t, true, true);
  assert.equal(x.results.length, 1);
  assert.equal(x.task.state, "cancelled");
  assert.equal(x.reserveClicks, 0);
});
