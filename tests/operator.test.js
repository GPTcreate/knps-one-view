"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
const C = require("../core.js"),
  O = require("../extension/observation.js");
const day = C.addDays(C.today(), 1),
  token = "test_operator_private_key_1234567890";
const facility = {
  id: "F1",
  service: "forest",
  name: "시험 숲",
  region: "제주",
  region_id: "9",
  operator: "공립",
};
const job = {
  id: "lease_one",
  date: day,
  state: "pending",
  facilities: [facility],
};
function worker(initial = {}, fail = null, actualOrigin = null) {
  let listener,
    removed,
    installed,
    persisted = structuredClone(initial);
  const requests = [],
    tabs = [];
  const runtime = {
    id: "operator-test",
    getURL: (name) => "chrome-extension://operator-test/" + name,
    getContexts: async () => [],
    onMessage: { addListener: (fn) => (listener = fn) },
    onInstalled: { addListener: (fn) => (installed = fn) },
  };
  vm.runInNewContext(
    fs.readFileSync(require.resolve("../operator/background.js"), "utf8"),
    {
      URL,
      Date,
      crypto,
      AbortSignal,
      ForestObservation: O,
      FOREST_OPERATOR_ORIGIN: actualOrigin || "http://127.0.0.1:8765",
      importScripts: () => {},
      chrome: {
        runtime,
        storage: {
          local: {
            get: async () => structuredClone(persisted),
            set: async (value) => {
              persisted = { ...persisted, ...structuredClone(value) };
            },
            setAccessLevel: async () => {},
          },
        },
        tabs: {
          query: async () => [],
          create: async (options) => {
            tabs.push(options);
            return { id: 17 };
          },
          update: async () => {},
          reload: async () => {},
          onRemoved: { addListener: (fn) => (removed = fn) },
        },
        action: { onClicked: { addListener: () => {} } },
      },
      fetch: async (url, options) => {
        requests.push({ url, options });
        if (actualOrigin) return fetch(url, options);
        const status = fail?.(url, options) || 200;
        return {
          ok: status === 200,
          status,
          json: async () =>
            url.endsWith("/job")
              ? { active: true, job: structuredClone(job) }
              : { ok: true },
        };
      },
    },
  );
  const ui = { id: runtime.id, url: runtime.getURL("index.html") },
    official = {
      id: runtime.id,
      url: "https://www.foresttrip.go.kr/rep/or/sssn/monthRsrvtStatus.do",
      tab: { id: 17 },
    };
  const invoke = (message, sender = ui) =>
    new Promise((resolve) => listener(message, sender, resolve));
  return {
    requests,
    tabs,
    removed,
    installed,
    official,
    invoke,
    stored: () => structuredClone(persisted),
    action: (action, body) => invoke({ type: "operator-ui", action, body }),
    page: (path, body, sender = official) =>
      invoke(
        { type: "forest-operator", path: "/api/bridge/" + path, body },
        sender,
      ),
  };
}
async function started() {
  const w = worker();
  assert.equal(
    (
      await w.action("configure", {
        server_url: "http://127.0.0.1:8765",
        token,
      })
    ).ok,
    true,
  );
  assert.equal((await w.action("start", { confirmSharing: true })).ok, true);
  return w;
}
test("operator requires the fixed destination, trusted UI, and explicit sharing consent", async () => {
  const w = worker();
  assert.equal(
    (
      await w.action("configure", {
        server_url: "https://other.example",
        token,
      })
    ).ok,
    false,
  );
  assert.equal(
    (
      await w.invoke(
        {
          type: "operator-ui",
          action: "configure",
          body: { server_url: "http://127.0.0.1:8765", token },
        },
        { id: "other", url: "https://other.example" },
      )
    ).ok,
    false,
  );
  assert.equal(
    (
      await w.action("configure", {
        server_url: "http://127.0.0.1:8765",
        token,
      })
    ).ok,
    true,
  );
  assert.equal((await w.action("start", {})).ok, false);
  assert.equal(w.tabs.length, 0);
  const status = await w.action("status");
  assert.equal(status.data.configured, true);
  assert.ok(!JSON.stringify(status).includes(token));
});
test("operator authenticates only fixed endpoints and uploads normalized booking fields", async () => {
  const w = await started();
  assert.equal((await w.page("job")).data.job.id, job.id);
  const item = {
    id: "F1",
    checked_at: new Date().toISOString(),
    cookies: "private",
    rooms: [
      {
        id: "r1",
        name: "객실",
        password: "private",
        days: { [day]: { state: "waitlist", next_rank: 2 } },
      },
    ],
  };
  assert.equal(
    (await w.page("result", { job_id: job.id, facility_id: "F1", item })).ok,
    true,
  );
  const upload = w.requests.find((r) => r.url.endsWith("/result"));
  assert.ok(upload);
  assert.ok(!upload.options.body.includes("private"));
  assert.equal(
    JSON.parse(upload.options.body).item.rooms[0].days[day].next_rank,
    2,
  );
  assert.equal(
    (await w.page("progress", { job_id: job.id, complete: true })).ok,
    true,
  );
  for (const request of w.requests) {
    assert.match(
      request.url,
      /^http:\/\/127\.0\.0\.1:8765\/api\/operator\/(health|pause|job|result|progress)$/,
    );
    assert.equal(request.options.headers.Authorization, "Bearer " + token);
    assert.equal(request.options.credentials, "omit");
    assert.equal(request.options.redirect, "error");
  }
  assert.equal((await w.action("status")).data.uploads, 1);
});
test("operator rejects unrelated official tabs, unknown paths, and stale job results", async () => {
  const w = await started();
  assert.equal(
    (await w.page("job", {}, { ...w.official, tab: { id: 99 } })).data.active,
    false,
  );
  assert.equal(
    (
      await w.page(
        "job",
        {},
        { ...w.official, url: "https://www.foresttrip.go.kr/other" },
      )
    ).ok,
    false,
  );
  await w.page("job");
  const before = w.requests.length;
  assert.equal(
    (await w.page("result", { job_id: "expired", facility_id: "F1" })).ok,
    false,
  );
  assert.equal(
    (await w.page("https://other.example", { job_id: job.id })).ok,
    false,
  );
  assert.equal(
    (await w.page("result", { job_id: job.id, facility_id: "F2" })).ok,
    false,
  );
  assert.equal(w.requests.length, before);
});
test("operator recovers stable identity and active lease after service-worker recreation", async () => {
  const w = await started();
  await w.page("job");
  const saved = w.stored();
  const restarted = worker(saved);
  await restarted.page("job");
  const request = restarted.requests.at(-1);
  assert.equal(request.options.headers["X-Active-Lease"], job.id);
  assert.equal(
    request.options.headers["X-Collector-ID"],
    saved.forestOperatorV1.collector_id,
  );
  assert.ok(!JSON.stringify(await restarted.action("status")).includes(token));
});
test("operator pause stops sharing and leaves server cache management to its authenticated queue", async () => {
  const w = await started();
  await w.page("job");
  await w.action("stop");
  assert.ok(w.requests.at(-1).url.endsWith("/pause"));
  const count = w.requests.length;
  assert.equal((await w.page("job")).data.active, false);
  assert.equal(w.requests.length, count);
  assert.equal(w.stored().forestOperatorV1.currentJob, null);
});
test("operator authentication failure preserves saved configuration and reports a safe error", async () => {
  const w = await started();
  await w.page("job");
  const failed = worker(w.stored(), (url) =>
    url.endsWith("/job") ? 403 : null,
  );
  assert.equal((await failed.page("job")).ok, false);
  const status = await failed.action("status");
  assert.match(status.data.error, /연결하지 못했습니다/);
  assert.ok(!JSON.stringify(status).includes(token));
  assert.equal(failed.stored().forestOperatorV1.token, token);
});

test("web search through real HTTP queue, operator worker and rendered monthly table returns public waiting rank", async (t) => {
  const path = require("node:path"),
    os = require("node:os"),
    { spawn } = require("node:child_process"),
    { once } = require("node:events"),
    { createInterface } = require("node:readline"),
    { JSDOM } = require("jsdom");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "forest-operator-flow-"));
  fs.writeFileSync(
    path.join(temp, "catalog.json"),
    JSON.stringify({ forests: [facility] }),
  );
  fs.writeFileSync(
    path.join(temp, "availability.json"),
    JSON.stringify({ schema_version: 1, sources: {}, items: [] }),
  );
  const script =
    "import server,sys; from pathlib import Path; from http.server import ThreadingHTTPServer; server.ROOT=Path(sys.argv[1]); http=ThreadingHTTPServer(('127.0.0.1',0),server.Handler); print(http.server_port,flush=True); http.serve_forever()";
  const child = spawn("python", ["-u", "-c", script, temp], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, FOREST_OPERATOR_KEY: token },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (data) => (stderr += data));
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill();
      await once(child, "exit");
    }
    fs.rmSync(temp, { recursive: true, force: true });
  });
  const lines = createInterface({ input: child.stdout });
  const [port] = await Promise.race([
    once(lines, "line"),
    new Promise((_, reject) => {
      const timer = setTimeout(
        () => reject(Error("Test HTTP server failed: " + stderr)),
        5000,
      );
      timer.unref();
    }),
  ]);
  lines.close();
  const origin = "http://127.0.0.1:" + port;
  let response = await fetch(origin + "/api/forest/search", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ date: day, region: "제주" }),
  });
  assert.equal(response.status, 202);
  assert.equal((await response.json()).refresh.pending, 1);
  const w = worker({}, null, origin);
  assert.equal(
    (await w.action("configure", { server_url: origin, token })).ok,
    true,
  );
  assert.equal((await w.action("start", { confirmSharing: true })).ok, true);
  const month = day.slice(0, 7).replace("-", ""),
    dateNumber = Number(day.slice(-2));
  const dom = new JSDOM(
    `<select id="srchSido"><option value="9">제주</option></select><select id="srchInstt"><option value="F1">시험 숲</option></select><select id="srchForest"><option value="01">숙소</option></select><select id="monthSelectBox"><option value="${month}">조회 월</option></select><input type="radio" id="inqurSctin01" checked><button id="searchBtn">검색</button><button id="reserve">예약</button><div id="monthRsrvtList"></div>`,
    { url: w.official.url, runScripts: "outside-only" },
  );
  t.after(() => dom.window.close());
  const page = dom.window,
    doc = page.document;
  let bookingClicks = 0;
  doc.getElementById("reserve").onclick = () => bookingClicks++;
  Object.defineProperty(doc, "cookie", {
    get() {
      throw Error("Cookie access forbidden");
    },
  });
  doc.getElementById("searchBtn").onclick = () => {
    doc.getElementById("monthRsrvtList").innerHTML =
      `<div class="list_left"><ul><li><a>[숲속의집]객실 (4인/26㎡)</a></li></ul></div><table id="dayListTable"><tr><th>${dateNumber}</th></tr><tr><td><span class="apt_mark" title="객실 ${day.replaceAll("-", ".")}">대2</span></td></tr></table>`;
  };
  const timeout = page.setTimeout.bind(page);
  page.setTimeout = (fn) => timeout(fn, 0);
  page.setInterval = () => 1;
  page.chrome = {
    runtime: { sendMessage: (message) => w.invoke(message, w.official) },
  };
  page.eval(
    fs.readFileSync(require.resolve("../browser-bridge/extractor.js"), "utf8"),
  );
  page.eval(
    fs
      .readFileSync(require.resolve("../extension/content.js"), "utf8")
      .replaceAll("forest-extension", "forest-operator"),
  );
  let result;
  for (let i = 0; i < 120; i++) {
    result = await (
      await fetch(origin + "/api/status?service=forest&date=" + day)
    ).json();
    if (result.refresh.fresh === 1) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(result.refresh.fresh, 1);
  assert.equal(result.refresh.pending, 0);
  assert.equal(result.items[0].rooms[0].days[day].next_rank, 2);
  assert.equal(bookingClicks, 0);
  assert.ok(!JSON.stringify(result).includes(token));
  assert.equal((await w.action("status")).data.uploads, 1);
  await w.action("stop");
});
