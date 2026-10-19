"use strict";
importScripts("core.js", "observation.js");
const OFFICIAL = "https://www.foresttrip.go.kr/rep/or/sssn/monthRsrvtStatus.do";
const STORE = "forestSeatStateV1";
const RECORDS = "forestSeatObservationsV1";
let queue = Promise.resolve(),
  directory;
async function catalog() {
  if (!directory)
    directory = (
      await (await fetch(chrome.runtime.getURL("catalog.json"))).json()
    ).forests;
  return directory;
}
async function read(includeItems = false) {
  const values = await chrome.storage.local.get(
    includeItems ? [STORE, RECORDS] : STORE,
  );
  const stored = values[STORE];
  const state =
    stored && typeof stored === "object"
      ? stored
      : { job: null, tabId: null, connectedAt: 0 };
  state.items =
    includeItems && Array.isArray(values[RECORDS]) ? values[RECORDS] : [];
  const last = Math.max(
    state.connectedAt || 0,
    Date.parse(state.job?.created_at) || 0,
  );
  if (state.job?.state === "pending" && Date.now() - last > 120000)
    state.job.state = "paused";
  return state;
}
async function save(state, includeItems = false) {
  const { items, ...metadata } = state;
  const update = { [STORE]: metadata };
  if (includeItems) update[RECORDS] = ForestObservation.fit(items);
  await chrome.storage.local.set(update);
}
function publicJob(job) {
  if (!job) return null;
  const { results, tabId, ...publicFields } = job;
  return { ...publicFields, completed_ids: Object.keys(results || {}) };
}
function counts(job) {
  const values = Object.values(job.results);
  Object.assign(job, {
    done: values.length,
    success: values.filter((x) => x === "success").length,
    failed: values.filter((x) => x === "failed").length,
  });
}
function officialSender(sender) {
  try {
    const url = new URL(sender.url || sender.tab?.url);
    return (
      sender.id === chrome.runtime.id &&
      url.origin === "https://www.foresttrip.go.kr" &&
      url.pathname === "/rep/or/sssn/monthRsrvtStatus.do" &&
      Number.isInteger(sender.tab?.id)
    );
  } catch {
    return false;
  }
}
function uiSender(sender) {
  try {
    const url = new URL(sender.url);
    return (
      sender.id === chrome.runtime.id &&
      url.origin === new URL(chrome.runtime.getURL("index.html")).origin &&
      url.pathname === "/index.html"
    );
  } catch {
    return false;
  }
}
async function handle(message, sender) {
  const state = await read(
    message.action === "status" ||
      message.action === "clear" ||
      message.path === "/api/bridge/result",
  );
  if (message.type === "forest-ui") {
    if (!uiSender(sender)) throw Error("허용되지 않은 화면입니다.");
    switch (message.action) {
      case "status": {
        if (state.job?.state === "paused") await save(state);
        const connected = Date.now() - state.connectedAt < 20000;
        return {
          schema_version: 1,
          items: state.items,
          forest_connected: connected,
          forest_job: publicJob(state.job),
          sources: {
            forest: {
              state: state.items.length
                ? "partial"
                : connected
                  ? "empty"
                  : "connection_required",
              message:
                "이 Chrome에서 직접 확인한 공식 월별 현황입니다. 미조회 시설·날짜는 미확인으로 표시합니다.",
            },
          },
        };
      }
      case "connect": {
        if (state.job?.state === "pending")
          throw Error(
            "조회 중에는 연결 탭을 바꾸지 마세요. 먼저 조회를 중단해 주세요.",
          );
        const tabs = await chrome.tabs.query({ url: OFFICIAL + "*" });
        let tab = tabs.find((t) => t.id === state.tabId) || tabs[0];
        if (tab) {
          await chrome.tabs.update(tab.id, { active: true });
          await chrome.tabs.reload(tab.id);
        } else
          tab = await chrome.tabs.create({
            url: OFFICIAL + "?hmpgId=FRIP&menuId=001004",
            active: true,
          });
        state.tabId = tab.id;
        state.connectedAt = 0;
        await save(state);
        return { opened: true };
      }
      case "start": {
        if (state.job?.state === "pending")
          throw Error(
            "이미 조회 중입니다. 조건을 바꾸려면 먼저 중단해 주세요.",
          );
        if (Date.now() - state.connectedAt >= 20000)
          throw Error("숲나들e 연결을 누르고 공식 화면에서 로그인해 주세요.");
        const input = message.body || {};
        if (
          !ForestCore.validDate(input.date) ||
          input.date < ForestCore.today() ||
          input.date > ForestCore.addDays(ForestCore.today(), 365)
        )
          throw Error("조회 날짜를 확인해 주세요.");
        let facilities = (await catalog()).filter(
          (f) =>
            (!input.region || f.region === input.region) &&
            (!input.operator || f.operator === input.operator),
        );
        if (input.ids !== undefined) {
          if (
            !Array.isArray(input.ids) ||
            !input.ids.length ||
            input.ids.some((id) => typeof id !== "string")
          )
            throw Error("조회할 저장 시설이 없습니다.");
          facilities = facilities.filter((f) => input.ids.includes(f.id));
        }
        if (!facilities.length) throw Error("조건에 맞는 시설이 없습니다.");
        state.job = {
          id: crypto.randomUUID(),
          state: "pending",
          date: input.date,
          facilities,
          done: 0,
          success: 0,
          failed: 0,
          results: {},
          tabId: state.tabId,
          created_at: new Date().toISOString(),
        };
        await save(state);
        return { job: publicJob(state.job) };
      }
      case "cancel":
        if (state.job)
          Object.assign(state.job, {
            state: "cancelled",
            message:
              "공식 조회를 중단했습니다. 이미 확인한 결과는 보존했습니다.",
          });
        await save(state);
        return { ok: true };
      case "clear":
        state.items = [];
        state.job = null;
        await save(state, true);
        return { ok: true };
      default:
        throw Error("지원하지 않는 요청입니다.");
    }
  }
  if (message.type !== "forest-extension" || !officialSender(sender))
    throw Error("허용되지 않은 요청입니다.");
  if (sender.tab.id !== state.tabId) return { active: false, job: null };
  if (message.path === "/api/bridge/job") {
    state.connectedAt = Date.now();
    await save(state);
    return { active: true, job: publicJob(state.job) };
  }
  const body = message.body;
  if (
    !body ||
    !state.job ||
    state.job.state !== "pending" ||
    state.job.id !== body.job_id ||
    state.job.tabId !== sender.tab.id
  )
    throw Error("Job is no longer active");
  if (message.path === "/api/bridge/result") {
    const facility = state.job.facilities.find(
      (f) => f.id === body.facility_id,
    );
    if (!facility) throw Error("조회 대상 시설이 아닙니다.");
    if (state.job.results[facility.id] === "success")
      return { duplicate: true };
    if (body.item) {
      const item = ForestObservation.normalize(
        body.item,
        facility,
        state.job.date,
      );
      if (!ForestObservation.fit([item]).length)
        throw Error("이 시설의 현황이 기기 저장 한도를 초과했습니다.");
      const prior = state.items.find((x) => x.id === item.id);
      state.items = state.items
        .filter((x) => x.id !== item.id)
        .concat(ForestObservation.merge(prior, item));
      state.job.results[facility.id] = "success";
    } else state.job.results[facility.id] = "failed";
    counts(state.job);
    await save(state, true);
    return { ok: true };
  }
  if (message.path === "/api/bridge/progress") {
    if (body.paused)
      Object.assign(state.job, {
        state: "paused",
        message:
          "공식 조회가 중단됐어요. 로그인과 연결 상태를 확인한 뒤 다시 조회해 주세요.",
      });
    if (body.complete) {
      counts(state.job);
      if (state.job.done !== state.job.facilities.length)
        throw Error("조회하지 못한 시설이 남아 있습니다.");
      Object.assign(state.job, {
        state: "complete",
        message: `공식 조회 완료 · 성공 ${state.job.success}곳, 미확인 ${state.job.failed}곳`,
      });
    }
    await save(state);
    return { ok: true };
  }
  throw Error("허용되지 않은 경로입니다.");
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (!["forest-ui", "forest-extension"].includes(message?.type)) return;
  const task = queue.then(() => handle(message, sender));
  queue = task.catch(() => {});
  task.then(
    (data) => reply({ ok: true, data }),
    (error) =>
      reply({
        ok: false,
        error: String(error.message || "요청을 처리하지 못했습니다.").slice(
          0,
          180,
        ),
      }),
  );
  return true;
});
chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL("index.html");
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["TAB"] });
  const dashboard = contexts.find(
    (context) => context.documentUrl?.split("#")[0] === url,
  );
  if (dashboard) await chrome.tabs.update(dashboard.tabId, { active: true });
  else await chrome.tabs.create({ url, active: true });
});
chrome.tabs.onRemoved.addListener((tabId) => {
  const task = queue.then(async () => {
    const state = await read();
    if (state.tabId === tabId) {
      state.connectedAt = 0;
      if (state.job?.state === "pending")
        Object.assign(state.job, {
          state: "paused",
          message:
            "숲나들e 연결 탭이 닫혀 조회를 중단했습니다. 기존 결과는 보존했습니다.",
        });
      await save(state);
    }
  });
  queue = task.catch(() => {});
});
chrome.runtime.onInstalled.addListener(() =>
  chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
);
