"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const C = require("../core.js"),
  O = require("../extension/observation.js");
const root = path.resolve(__dirname, "..");
const day = C.addDays(C.today(), 1);
const directory = [
  {
    id: "0101",
    service: "forest",
    name: "조회 시설 하나",
    region: "강원",
    region_id: "2",
    operator: "국립",
  },
  {
    id: "0103",
    service: "forest",
    name: "조회 시설 둘",
    region: "강원",
    region_id: "2",
    operator: "공립",
  },
];
function worker(initial = {}) {
  let listener, removed, installed, clicked;
  let persisted = structuredClone(initial);
  const requests = [],
    tabs = [],
    contexts = [],
    updates = [],
    writes = [];
  const runtime = {
    id: "test-extension",
    getURL: (name) => "chrome-extension://test-extension/" + name,
    getContexts: async () => structuredClone(contexts),
    onMessage: {
      addListener: (fn) => {
        listener = fn;
      },
    },
    onInstalled: {
      addListener: (fn) => {
        installed = fn;
      },
    },
  };
  const context = vm.createContext({
    URL,
    Date,
    crypto,
    structuredClone,
    console,
    chrome: {
      runtime,
      action: {
        onClicked: {
          addListener(fn) {
            clicked = fn;
          },
        },
      },
      tabs: {
        query: async () => [],
        update: async (id, options) => {
          updates.push({ id, options });
        },
        reload: async () => {},
        create: async (options) => {
          tabs.push(options);
          return { id: 17 };
        },
        onRemoved: {
          addListener: (fn) => {
            removed = fn;
          },
        },
      },
      storage: {
        local: {
          get: async () => structuredClone(persisted),
          set: async (value) => {
            writes.push(structuredClone(value));
            persisted = { ...persisted, ...structuredClone(value) };
          },
          setAccessLevel: async () => {},
        },
      },
    },
    fetch: async (url) => {
      requests.push(url);
      assert.equal(url, runtime.getURL("catalog.json"));
      return { json: async () => ({ forests: directory }) };
    },
    importScripts: () => {},
    ForestCore: C,
    ForestObservation: O,
  });
  vm.runInContext(
    fs.readFileSync(path.join(root, "extension/background.js"), "utf8"),
    context,
  );
  const ui = { id: runtime.id, url: runtime.getURL("index.html") };
  const official = {
    id: runtime.id,
    url: "https://www.foresttrip.go.kr/rep/or/sssn/monthRsrvtStatus.do",
    tab: { id: 17 },
  };
  const invoke = (message, sender = ui) =>
    new Promise((resolve) => listener(message, sender, resolve));
  return {
    invoke,
    ui,
    official,
    requests,
    tabs,
    removed,
    installed,
    clicked: () => clicked(),
    contexts,
    updates,
    writes,
    stored: () => structuredClone(persisted),
    action: (action, body) => invoke({ type: "forest-ui", action, body }),
    page: (route, body, sender = official) =>
      invoke(
        { type: "forest-extension", path: "/api/bridge/" + route, body },
        sender,
      ),
  };
}
async function started() {
  const w = worker();
  assert.equal((await w.action("connect")).ok, true);
  assert.equal((await w.page("job")).ok, true);
  const result = await w.action("start", { date: day, region: "강원" });
  assert.equal(result.ok, true);
  return { ...w, job: result.data.job };
}
const observation = (id = "0101", state = "waitlist") => ({
  id,
  checked_at: new Date().toISOString(),
  cookies: "must not survive",
  rooms: [
    {
      id: "room:one",
      name: "객실 하나",
      password: "must not survive",
      days: {
        [day]: { state, ...(state === "waitlist" ? { next_rank: 2 } : {}) },
      },
    },
  ],
});
test("standalone extension uses only local storage and packaged catalog; no localhost or external server", async () => {
  const w = await started();
  assert.equal(w.tabs.length, 1);
  assert.equal(w.job.facilities.length, 2);
  assert.deepEqual(w.requests, [
    "chrome-extension://test-extension/catalog.json",
  ]);
  assert.equal(
    (await w.page("progress", { job_id: w.job.id, complete: true })).ok,
    false,
  );
  for (const id of ["0101", "0103"])
    assert.equal(
      (
        await w.page("result", {
          job_id: w.job.id,
          facility_id: id,
          item: observation(id),
        })
      ).ok,
      true,
    );
  assert.equal(
    (await w.page("progress", { job_id: w.job.id, complete: true })).ok,
    true,
  );
  const result = (await w.action("status")).data;
  assert.equal(result.forest_job.done, 2);
  assert.equal(result.items[0].rooms[0].days[day].next_rank, 2);
  assert.doesNotMatch(
    JSON.stringify(w.stored()),
    /must not survive|password|cookies/,
  );
});
test("standalone background binds jobs to the selected official tab and rejects other origins or extension pages", async () => {
  const w = await started();
  for (const sender of [
    { ...w.ui, id: "other-extension" },
    { ...w.ui, url: "https://attacker.example/index.html" },
  ])
    assert.equal(
      (await w.invoke({ type: "forest-ui", action: "status" }, sender)).ok,
      false,
    );
  assert.equal(
    (
      await w.page("job", undefined, {
        ...w.official,
        url: "https://www.foresttrip.go.kr.evil.example/rep/or/sssn/monthRsrvtStatus.do",
      })
    ).ok,
    false,
  );
  const unrelated = await w.page("job", undefined, {
    ...w.official,
    tab: { id: 18 },
  });
  assert.equal(unrelated.data.active, false);
  assert.equal(unrelated.data.job, null);
});
test("duplicate results are idempotent and a failed facility can be replaced by a verified result", async () => {
  const w = await started(),
    body = { job_id: w.job.id, facility_id: "0101" };
  await w.page("result", body);
  await w.page("result", { ...body, item: observation() });
  assert.equal(
    (await w.page("result", { ...body, item: observation() })).data.duplicate,
    true,
  );
  const result = (await w.action("status")).data;
  assert.equal(result.forest_job.done, 1);
  assert.equal(result.forest_job.success, 1);
  assert.equal(result.forest_job.failed, 0);
});
test("cancellation and clearing reject late observations without discarding retained data", async () => {
  const w = await started(),
    body = { job_id: w.job.id, facility_id: "0101", item: observation() };
  await w.page("result", body);
  await w.action("cancel");
  assert.equal((await w.page("result", body)).ok, false);
  assert.equal((await w.action("status")).data.items.length, 1);
  await w.action("clear");
  assert.equal((await w.action("status")).data.items.length, 0);
  assert.equal((await w.page("result", body)).ok, false);
});
test("service worker recreation retains a job and selected tab; a closed tab pauses collection", async () => {
  const first = await started();
  await first.page("result", {
    job_id: first.job.id,
    facility_id: "0101",
    item: observation(),
  });
  const restored = worker(first.stored());
  const job = (await restored.page("job")).data.job;
  assert.equal(job.id, first.job.id);
  assert.equal(job.completed_ids[0], "0101");
  restored.removed(17);
  const result = (await restored.action("status")).data;
  assert.equal(result.forest_job.state, "paused");
  assert.equal(result.items.length, 1);
});
test("invalid search and observations cannot change stored inventory", async () => {
  const w = await started();
  await w.action("cancel");
  for (const input of [
    { date: day, ids: [] },
    { date: "2026-02-30" },
    { date: day, region: "없는 지역" },
  ])
    assert.equal((await w.action("start", input)).ok, false);
  assert.throws(() => O.normalize(observation(), directory[1], day));
  const bad = observation();
  bad.rooms[0].days[day].next_rank = true;
  assert.throws(() => O.normalize(bad, directory[0], day));
});
test("date-level observation time is retained across months and storage eviction preserves actual times", () => {
  const fresh = O.normalize(observation(), directory[0], day);
  const other = C.addDays(day, 32);
  const prior = {
    ...fresh,
    checked_at: "2025-01-01T00:00:00Z",
    rooms: [
      {
        ...fresh.rooms[0],
        days: {
          [other]: { state: "full", checked_at: "2025-01-01T00:00:00Z" },
        },
      },
    ],
  };
  const merged = O.merge(prior, fresh);
  assert.equal(merged.rooms[0].days[other].checked_at, "2025-01-01T00:00:00Z");
  assert.equal(O.fit([fresh], 10).length, 0);
});
test("release permissions are limited to storage and Foresttrip; no cookies, scripting, broad browsing, or loopback", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "extension/manifest.json")),
  );
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.deepEqual(manifest.host_permissions, [
    "https://www.foresttrip.go.kr/*",
  ]);
  assert.equal(manifest.externally_connectable, undefined);
  assert.equal(manifest.web_accessible_resources, undefined);
});
test("extension action reuses only its own dashboard contexts without enumerating browser history", async () => {
  const w = worker();
  await w.clicked();
  assert.equal(w.tabs[0].url, "chrome-extension://test-extension/index.html");
  w.contexts.push({
    documentUrl: "chrome-extension://test-extension/index.html#date=2030-01-01",
    tabId: 44,
  });
  await w.clicked();
  assert.equal(w.tabs.length, 1);
  assert.equal(w.updates[0].id, 44);
});
test("connection heartbeats update only small metadata instead of rewriting all room records", async () => {
  const w = await started();
  await w.page("result", {
    job_id: w.job.id,
    facility_id: "0101",
    item: observation(),
  });
  const prior = w.stored().forestSeatObservationsV1;
  await w.page("job");
  assert.equal("forestSeatObservationsV1" in w.writes.at(-1), false);
  assert.deepEqual(w.stored().forestSeatObservationsV1, prior);
});
