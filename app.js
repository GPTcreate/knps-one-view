"use strict";
(() => {
  const C = ForestCore,
    $ = (id) => document.getElementById(id),
    h = C.escapeHTML;
  let storage;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  const initial = new URLSearchParams(location.hash.slice(1));
  const state = {
    date:
      C.validDate(initial.get("date")) && initial.get("date") >= C.today()
        ? initial.get("date")
        : C.addDays(C.today(), 1),
    region: initial.get("region") || "",
    service: initial.get("service") === "knps" ? "knps" : "forest",
    guests: [1, 2, 3, 4, 5, 6, 8, 10].includes(Number(initial.get("guests")))
      ? Number(initial.get("guests"))
      : 2,
    query: "",
    status: "all",
    operator: "",
    favoritesOnly: false,
    favorites: C.readSaved(
      storage,
      "forest_saved_v1",
      C.readSaved(storage, "knps_favs", []),
    ),
    sort: "opportunity",
    view: "list",
    limit: 20,
    expanded: new Set(),
    items: [],
    catalog: null,
    sources: {},
    loading: false,
    error: "",
    alerts: false,
    baseline: null,
    generation: 0,
    stripStart: null,
    forestJob: null,
    connected: false,
    collectJob: null,
  };
  let toastTimer, refreshTimer, requestController;
  function notify(text) {
    $("toast").textContent = text;
    $("toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ($("toast").hidden = true), 5500);
  }
  function dateText(date, options = {}) {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "UTC",
      month: "long",
      day: "numeric",
      weekday: "short",
      ...options,
    }).format(new Date(date + "T12:00:00Z"));
  }
  function timeText(timestamp) {
    if (!timestamp || !Number.isFinite(Date.parse(timestamp)))
      return "아직 확인하지 못했어요";
    return (
      new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(timestamp)) + " 확인"
    );
  }
  function saveSearch() {
    const p = new URLSearchParams({
      date: state.date,
      service: state.service,
      guests: String(state.guests),
    });
    if (state.region) p.set("region", state.region);
    history.replaceState(null, "", "#" + p);
  }
  function collectSearch() {
    const date = $("dateInput").value;
    if (!C.validDate(date) || date < C.today()) {
      notify("오늘 이후의 날짜를 선택해 주세요.");
      return false;
    }
    state.date = date;
    state.region = $("regionInput").value;
    state.guests = Number($("guestsInput").value);
    state.stripStart = C.addDays(
      date,
      -Math.min(
        3,
        Math.max(
          0,
          Math.round((Date.parse(date) - Date.parse(C.today())) / 86400000),
        ),
      ),
    );
    state.limit = 20;
    state.baseline = null;
    saveSearch();
    return true;
  }
  function currentItems() {
    return state.items.filter((x) => x.service === state.service);
  }
  function filteredItems() {
    const items = C.filterItems(state.items, state);
    const rank = {
      available: 0,
      waitlist: 1,
      full: 2,
      priority: 3,
      lottery: 3,
      closed: 4,
      unknown: 5,
    };
    return items.sort((a, b) => {
      if (state.sort === "region")
        return (
          a.region.localeCompare(b.region, "ko") ||
          a.name.localeCompare(b.name, "ko")
        );
      if (state.sort === "recent")
        return (
          (Date.parse(b.checked_at) || 0) - (Date.parse(a.checked_at) || 0) ||
          a.name.localeCompare(b.name, "ko")
        );
      if (state.sort === "opportunity") {
        const sa = C.summarize(a, state.date, state.guests),
          sb = C.summarize(b, state.date, state.guests);
        const diff =
          rank[sa.state] - rank[sb.state] || sb.available - sa.available;
        if (diff) return diff;
        if (
          sa.nextRank !== null &&
          sb.nextRank !== null &&
          sa.nextRank !== sb.nextRank
        )
          return sa.nextRank - sb.nextRank;
      }
      return a.name.localeCompare(b.name, "ko");
    });
  }
  function statusBadge(status) {
    const labels = {
      available: "예약 가능",
      waitlist: "예약대기 가능",
      full: "예약 마감",
      closed: "휴무·공사",
      priority: "우선예약 기간",
      lottery: "추첨 예약 기간",
      unknown: "미확인",
    };
    const label =
      status.state === "waitlist" && Number.isInteger(status.next_rank)
        ? `대기 ${status.next_rank}순위 신청 가능`
        : labels[status.state] || labels.unknown;
    return `<span class="badge ${h(status.state)}">${h(label)}</span>`;
  }
  function summaryBadges(summary, unit = "실") {
    const badges = [];
    if (summary.available)
      badges.push(
        `<span class="badge available">빈자리 ${summary.available}${unit}</span>`,
      );
    if (summary.waitlist)
      badges.push(
        `<span class="badge waitlist">예약대기 ${summary.waitlist}${unit}${summary.nextRank !== null ? ` · ${summary.nextRank}순위부터` : ""}</span>`,
      );
    if (!badges.length) badges.push(statusBadge({ state: summary.state }));
    if ((summary.available || summary.waitlist) && summary.unknown)
      badges.push(`<span class="badge">일부 미확인</span>`);
    return badges.join("");
  }
  function officialLink(item, summary, classes = "booking-link") {
    const url = C.safeURL(item.calendar_url || item.url);
    return url
      ? `<a class="${classes} ${summary.available || summary.waitlist ? "opportunity" : ""}" href="${h(url)}" target="_blank" rel="noopener noreferrer">공식 현황 확인 ↗</a>`
      : '<span class="badge">연결 미확인</span>';
  }
  function roomsHTML(item, summary) {
    if (!state.expanded.has(item.id)) return "";
    if (!summary.rooms.length)
      return '<div class="room-list"><p class="results-note">이 날짜의 실제 객실 현황을 아직 가져오지 못했어요. 공식 현황에서 확인해 주세요.</p></div>';
    const order = {
      available: 0,
      waitlist: 1,
      full: 2,
      priority: 3,
      lottery: 3,
      closed: 4,
      unknown: 5,
    };
    const rooms = [...summary.rooms].sort(
      (a, b) =>
        order[a.status.state] - order[b.status.state] ||
        (a.status.next_rank || 100) - (b.status.next_rank || 100) ||
        a.name.localeCompare(b.name, "ko"),
    );
    return `<div class="room-list">${rooms.map((r) => `<div class="room-row"><div><strong>${h(r.name)}</strong><small>${h(r.type || "")}${r.capacity ? ` · 최대 ${h(r.capacity)}명` : r.base_capacity ? ` · 기준 ${h(r.base_capacity)}명 · 최대인원 미제공` : " · 정원 미제공"}${r.area ? ` · ${h(r.area)}` : ""}</small></div>${statusBadge(r.status)}</div>`).join("")}</div>`;
  }
  function renderCard(item, index) {
    const s = C.summarize(item, state.date, state.guests),
      saved = state.favorites.includes(item.id),
      expanded = state.expanded.has(item.id);
    const roomCount = s.rooms.length;
    return `<article class="facility-card" data-id="${h(item.id)}"><div class="facility-main"><div class="facility-art" data-tone="${index % 3}" aria-hidden="true"><span>♠</span></div><div class="facility-body"><div class="facility-meta"><span class="operator-badge">${h(item.operator || "국립공원")}</span><span>${h(item.region)}${item.park ? ` · ${h(item.park)}` : ""}</span></div><div class="facility-name"><h3>${h(item.name)}</h3><button class="save-button ${saved ? "saved" : ""}" data-action="save" data-id="${h(item.id)}" aria-label="${h(item.name)} ${saved ? "저장 해제" : "저장"}" aria-pressed="${saved}">${saved ? "♥" : "♡"}</button></div><p class="facility-description">${roomCount ? `조건에 맞는 객실·영지 ${roomCount}곳${s.capacityUnknown ? " · 정원 미제공 포함" : ""}` : "숙박·야영 시설 · 공식 현황 확인"}${!s.fresh && item.checked_at ? " · 오래된 자료" : ""}</p><div class="status-row">${summaryBadges(s, item.service === "knps" ? "곳" : "실")}</div></div><div class="facility-side"><time${item.checked_at ? ` datetime="${h(item.checked_at)}"` : ""}>${h(timeText(item.checked_at))}</time>${officialLink(item, s)}</div></div><button class="rooms-toggle" data-action="expand" data-id="${h(item.id)}" aria-expanded="${expanded}">${expanded ? "객실 목록 접기 −" : roomCount ? `객실별 빈자리·예약대기 보기 (${roomCount}) +` : "객실 현황 안내 +"}</button>${roomsHTML(item, s)}</article>`;
  }
  function renderTable(items) {
    return `<div class="table-wrap"><table><thead><tr><th scope="col">저장</th><th scope="col">시설 / 지역</th><th scope="col">${h(dateText(state.date))} 현황</th><th scope="col">확인 시각</th><th scope="col">공식 예약</th></tr></thead><tbody>${items
      .map((item) => {
        const s = C.summarize(item, state.date, state.guests),
          saved = state.favorites.includes(item.id);
        return `<tr><td><button class="save-button ${saved ? "saved" : ""}" data-action="save" data-id="${h(item.id)}" aria-label="${h(item.name)} ${saved ? "저장 해제" : "저장"}" aria-pressed="${saved}">${saved ? "♥" : "♡"}</button></td><td><strong>${h(item.name)}</strong><small>${h(item.region)} · ${h(item.operator || "국립공원")}</small></td><td>${summaryBadges(s, item.service === "knps" ? "곳" : "실")}</td><td><small>${h(timeText(item.checked_at))}</small></td><td>${officialLink(item, s)}</td></tr>`;
      })
      .join("")}</tbody></table></div>`;
  }
  function renderDates() {
    const start =
      state.stripStart ||
      C.addDays(
        state.date,
        -Math.min(
          3,
          Math.max(
            0,
            Math.round(
              (Date.parse(state.date) - Date.parse(C.today())) / 86400000,
            ),
          ),
        ),
      );
    state.stripStart = start;
    const candidates = currentItems().filter(
      (x) => !state.region || x.region === state.region,
    );
    $("dateStrip").innerHTML = Array.from({ length: 7 }, (_, i) => {
      const date = C.addDays(start, i),
        d = new Date(date + "T12:00:00Z"),
        summaries = candidates.map((x) => C.summarize(x, date, state.guests));
      const available = summaries.filter((s) => s.available).length,
        wait = summaries.filter((s) => s.waitlist).length;
      const hint = available
        ? `빈자리 ${available}곳`
        : wait
          ? `예약대기 ${wait}곳`
          : summaries.some(
                (s) => s.fresh && s.rooms.length && s.state !== "unknown",
              )
            ? "예약 기회 없음"
            : "현황 미확인";
      return `<button class="date-card ${date === state.date ? "active" : ""} ${[0, 6].includes(d.getUTCDay()) ? "weekend" : ""}" data-date="${date}" aria-pressed="${date === state.date}" aria-label="${h(dateText(date))} ${h(hint)}"><span>${h(date === C.today() ? "오늘" : new Intl.DateTimeFormat("ko-KR", { timeZone: "UTC", weekday: "short" }).format(d))}</span><b>${d.getUTCMonth() + 1}.${String(d.getUTCDate()).padStart(2, "0")}</b><small>${h(hint)}</small></button>`;
    }).join("");
    $("previousDates").disabled = start <= C.today();
  }
  function renderBanner() {
    const source = state.sources[state.service] || {};
    const banner = $("sourceBanner");
    banner.className = "source-banner";
    $("cancelSearch").hidden =
      state.service !== "forest" || state.forestJob?.state !== "pending";
    if (state.service === "knps" && state.collectJob?.state === "running") {
      banner.textContent = `공식 현황 수집 중 · ${state.collectJob.done}/${state.collectJob.total}곳. 이전 확인 자료는 계속 비교할 수 있어요.`;
      return;
    }
    if (state.service === "forest" && state.forestJob?.state === "pending") {
      banner.textContent = state.connected
        ? `공식 현황 조회 중 · ${state.forestJob.done}/${state.forestJob.facilities.length}곳. 확인된 시설부터 비교 목록에 반영합니다.`
        : "조회 요청이 준비됐어요. 상단의 공식 현황 연결을 눌러 로그인된 숲나들e 탭을 연결해 주세요.";
      if (!state.connected) banner.classList.add("warning");
      return;
    }
    if (state.error) {
      banner.classList.add("error");
      banner.textContent = state.error;
      return;
    }
    if (
      state.service === "forest" &&
      ["paused", "cancelled"].includes(state.forestJob?.state)
    ) {
      banner.classList.add("warning");
      banner.textContent =
        state.forestJob.message ||
        "공식 조회를 중단했습니다. 확인된 자료는 보존했습니다.";
      return;
    }
    if (state.loading) {
      banner.textContent =
        "공식 현황을 확인하고 있어요. 기존 자료는 확인 시각과 함께 표시됩니다.";
      return;
    }
    if (source.state === "login_required") {
      if (state.connected) {
        banner.textContent =
          "공식 현황이 연결됐어요. 지역과 날짜를 선택하고 자리 찾아보기를 누르세요.";
        return;
      }
      banner.classList.add("warning");
      banner.textContent =
        "현재는 휴양림 목록을 탐색할 수 있어요. 실제 빈자리·예약대기는 공식 현황 연결 후 표시됩니다. 미확인은 매진이 아닙니다.";
      return;
    }
    const items = currentItems(),
      fresh = items.filter((x) => C.freshness(x.checked_at)).length;
    if (!fresh) {
      banner.classList.add("warning");
      banner.textContent =
        "유효한 최신 현황이 없어요. 확인되지 않은 시설·날짜는 미확인으로 표시합니다. 공식 현황에서 확인해 주세요.";
    } else {
      banner.textContent = `${items.length}곳 중 ${fresh}곳의 최근 30분 이내 관측 자료입니다. ${source.message || "예약 직전 공식 현황을 다시 확인해 주세요."}`;
      if (source.state === "partial") banner.classList.add("warning");
    }
  }
  function render() {
    const focused = document.activeElement;
    const restoreFocus =
      $("resultList").contains(focused) && focused?.dataset?.action
        ? { action: focused.dataset.action, id: focused.dataset.id }
        : null;
    const items = filteredItems(),
      visible = items.slice(0, state.limit);
    const context = C.filterItems(state.items, {
      ...state,
      status: "all",
      query: "",
      favoritesOnly: false,
      operator: state.operator,
    });
    const summaries = context.map((x) =>
      C.summarize(x, state.date, state.guests),
    );
    $("resultContext").textContent =
      `${state.region || "전국"} · ${dateText(state.date)} 체크인 · 1박 · ${state.guests}명${state.guests === 10 ? " 이상" : ""}`;
    $("resultTitle").textContent =
      state.service === "forest"
        ? "오늘의 숲, 한눈에 비교하기"
        : "국립공원 야영장 자리 찾기";
    $("totalStat").textContent = context.length + "곳";
    const known = summaries.some((s) => s.state !== "unknown");
    $("availableStat").textContent = known
      ? summaries.filter((s) => s.available).length + "곳"
      : "미확인";
    $("waitStat").textContent = known
      ? summaries.filter((s) => s.waitlist).length + "곳"
      : "미확인";
    const unknown = items.filter(
      (x) => C.summarize(x, state.date, state.guests).state === "unknown",
    ).length;
    $("resultCount").textContent =
      `${items.length}곳${items.length > state.limit ? ` 중 ${visible.length}곳 표시` : ""}${state.favoritesOnly ? " · 저장한 곳" : ""}${unknown ? ` · 미확인 ${unknown}곳` : ""}`;
    $("resultList").innerHTML =
      state.view === "table" && visible.length
        ? renderTable(visible)
        : visible.map(renderCard).join("");
    $("emptyState").hidden = items.length > 0;
    $("emptyDescription").textContent =
      state.status !== "all" && !known
        ? "아직 확인된 최신 현황이 없어요. 미확인 시설도 보려면 전체 보기를 선택해 주세요."
        : "다른 날짜나 지역을 선택하거나 필터를 넓혀보세요.";
    $("loadMore").hidden = items.length <= state.limit;
    $("savedCount").textContent = state.favorites.length;
    $("operatorField").hidden = state.service !== "forest";
    $("listView").classList.toggle("active", state.view === "list");
    $("tableView").classList.toggle("active", state.view === "table");
    $("listView").setAttribute("aria-pressed", String(state.view === "list"));
    $("tableView").setAttribute("aria-pressed", String(state.view === "table"));
    document.querySelectorAll(".service").forEach((button) => {
      const active = button.dataset.service === state.service;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    $("refreshButton").disabled =
      state.loading ||
      (state.service === "knps" && state.collectJob?.state === "running");
    $("results").setAttribute("aria-busy", String(state.loading));
    renderBanner();
    renderDates();
    if (restoreFocus) {
      const next = [
        ...$("resultList").querySelectorAll("button[data-action]"),
      ].find(
        (x) =>
          x.dataset.action === restoreFocus.action &&
          x.dataset.id === restoreFocus.id,
      );
      next?.focus({ preventScroll: true });
    }
  }
  function mergeData(payload) {
    const updates = new Map(
      (payload.items || []).map((x) => [`${x.service}:${x.id}`, x]),
    );
    state.items = state.items.map((item) => ({
      ...item,
      ...updates.get(`${item.service}:${item.id}`),
    }));
    for (const item of payload.items || [])
      if (
        !state.items.some((x) => x.id === item.id && x.service === item.service)
      )
        state.items.push(item);
    state.sources = payload.sources || {};
    state.forestJob = payload.forest_job || null;
    state.connected = !!payload.forest_connected;
    state.collectJob = payload.job || null;
    if (state.alerts) {
      const changes = C.detectChanges(
        state.baseline,
        state.items,
        state.date,
        state.favorites,
        state.guests,
      );
      if (changes.length) {
        notify(
          `${changes[0].facility} ${changes[0].room}: ${changes[0].state === "available" ? "빈자리 발생" : "예약대기 기회 변경"}${changes.length > 1 ? ` 외 ${changes.length - 1}건` : ""}`,
        );
        beep();
      }
    }
    state.baseline = {
      date: state.date,
      guests: state.guests,
      items: structuredClone(state.items),
    };
  }
  async function loadData() {
    const generation = ++state.generation;
    requestController?.abort();
    requestController = new AbortController();
    const signal = AbortSignal.any([
      requestController.signal,
      AbortSignal.timeout(20000),
    ]);
    state.loading = true;
    state.error = "";
    render();
    $("refreshButton").disabled = true;
    $("searchButton").disabled = true;
    try {
      let response = await fetch("/api/status?service=" + state.service, {
        cache: "no-store",
        signal,
      });
      if (response.status === 404)
        response = await fetch("availability.json", {
          cache: "no-store",
          signal,
        });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const payload = await response.json();
      if (generation !== state.generation) return;
      if (!C.validatePayload(payload)) throw new Error("invalid response");
      mergeData(payload);
    } catch {
      if (generation === state.generation)
        state.error =
          "현황을 가져오지 못했어요. 이전 자료는 확인 시각과 함께 남겨두었습니다. 잠시 후 새로고침하거나 공식 사이트에서 확인해 주세요.";
    } finally {
      if (generation === state.generation) {
        state.loading = false;
        $("searchButton").disabled = false;
        render();
      }
    }
  }
  function beep() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const audio = new AudioContext();
      const tone = audio.createOscillator(),
        gain = audio.createGain();
      tone.connect(gain);
      gain.connect(audio.destination);
      tone.frequency.value = 660;
      gain.gain.value = 0.06;
      tone.start();
      tone.stop(audio.currentTime + 0.18);
      tone.onended = () => audio.close();
    } catch {
      /* Text alert remains available. */
    }
  }
  function resetFilters() {
    state.query = "";
    state.status = "all";
    state.operator = "";
    state.favoritesOnly = false;
    state.limit = 20;
    $("queryInput").value = "";
    $("savedOnly").checked = false;
    document.querySelector("input[name=status][value=all]").checked = true;
    document.querySelector('input[name=operator][value=""]').checked = true;
    render();
  }
  async function searchForest() {
    if (
      state.favoritesOnly &&
      !state.favorites.some((id) =>
        state.items.some((x) => x.service === "forest" && x.id === id),
      )
    ) {
      notify("먼저 조회할 휴양림을 저장해 주세요.");
      return;
    }
    if (!state.connected) {
      await loadData();
      notify(
        "휴양림 목록을 검색했습니다. 실제 잔여·예약대기 조회는 공식 현황을 연결한 뒤 사용할 수 있어요.",
      );
      return;
    }
    try {
      const response = await fetch("/api/forest/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: state.date,
          region: state.region,
          operator: state.operator,
          ids: state.favoritesOnly ? state.favorites : undefined,
        }),
      });
      if (response.status === 409) {
        notify(
          "공식 조회가 진행 중입니다. 다른 조건으로 조회하려면 먼저 중단해 주세요.",
        );
        return;
      }
      if (!response.ok) throw new Error("search");
      state.forestJob = (await response.json()).job;
      notify(
        state.connected
          ? "로그인된 숲나들e에서 선택한 지역을 조회합니다."
          : "조회 요청을 준비했어요. 공식 현황 연결로 숲나들e 탭을 연결해 주세요.",
      );
      await loadData();
    } catch {
      notify(
        "로컬 연결 서버에서 실행해야 실제 휴양림 현황을 조회할 수 있어요.",
      );
    }
  }
  $("searchForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (collectSearch()) {
      state.service === "forest" ? searchForest() : loadData();
    }
  });
  $("dateStrip").addEventListener("click", (event) => {
    const button = event.target.closest("[data-date]");
    if (!button) return;
    state.date = button.dataset.date;
    $("dateInput").value = state.date;
    state.limit = 20;
    state.baseline = null;
    saveSearch();
    render();
    loadData();
  });
  $("previousDates").addEventListener("click", () => {
    state.stripStart = C.addDays(state.stripStart, -7);
    if (state.stripStart < C.today()) state.stripStart = C.today();
    renderDates();
  });
  $("nextDates").addEventListener("click", () => {
    state.stripStart = C.addDays(state.stripStart, 7);
    renderDates();
  });
  $("weekendButton").addEventListener("click", () => {
    $("dateInput").value = C.nextSaturday();
    if (collectSearch()) loadData();
  });
  document.querySelectorAll(".service").forEach((button) =>
    button.addEventListener("click", () => {
      state.service = button.dataset.service;
      state.operator = "";
      document.querySelector('input[name=operator][value=""]').checked = true;
      state.limit = 20;
      state.baseline = null;
      populateRegions();
      saveSearch();
      render();
      loadData();
    }),
  );
  document
    .querySelectorAll("input[name=status],input[name=operator]")
    .forEach((input) =>
      input.addEventListener("change", () => {
        state[input.name] = input.value;
        state.limit = 20;
        render();
      }),
    );
  $("queryInput").addEventListener("input", (event) => {
    state.query = event.target.value;
    state.limit = 20;
    render();
  });
  $("savedOnly").addEventListener("change", (event) => {
    state.favoritesOnly = event.target.checked;
    state.limit = 20;
    render();
  });
  $("savedTop").addEventListener("click", () => {
    state.favoritesOnly = !state.favoritesOnly;
    $("savedOnly").checked = state.favoritesOnly;
    state.limit = 20;
    render();
    $("results").scrollIntoView({
      block: "start",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  });
  $("sortInput").addEventListener("change", (event) => {
    state.sort = event.target.value;
    render();
  });
  $("resetFilters").addEventListener("click", resetFilters);
  $("emptyReset").addEventListener("click", resetFilters);
  $("loadMore").addEventListener("click", () => {
    state.limit += 20;
    render();
  });
  async function refreshNow() {
    if (state.service !== "knps") {
      await searchForest();
      return;
    }
    if (state.loading || state.collectJob?.state === "running") return;
    try {
      const response = await fetch("/api/refresh", {
        method: "POST",
        signal: AbortSignal.timeout(10000),
      });
      if (response.status === 404 || response.status === 405) {
        await loadData();
        return;
      }
      if (!response.ok) throw new Error("refresh");
      notify(
        "국립공원 공식 현황을 새로 수집합니다. 수집 중에도 이전 자료를 비교할 수 있어요.",
      );
      state.collectJob = {
        state: "running",
        done: 0,
        total: state.items.filter((x) => x.service === "knps").length,
      };
      await loadData();
    } catch {
      notify("새 현황 수집을 시작하지 못했어요. 기존 관측 자료를 확인합니다.");
      await loadData();
    }
  }
  $("refreshButton").addEventListener("click", refreshNow);
  $("listView").addEventListener("click", () => {
    state.view = "list";
    render();
  });
  $("tableView").addEventListener("click", () => {
    state.view = "table";
    render();
  });
  $("resultList").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = button.dataset.id;
    if (button.dataset.action === "expand") {
      state.expanded.has(id)
        ? state.expanded.delete(id)
        : state.expanded.add(id);
      render();
      return;
    }
    state.favorites = state.favorites.includes(id)
      ? state.favorites.filter((x) => x !== id)
      : [...state.favorites, id];
    try {
      storage?.setItem("forest_saved_v1", JSON.stringify(state.favorites));
    } catch {
      notify("브라우저 저장 공간을 사용할 수 없어 이 화면에서만 저장합니다.");
    }
    state.baseline = null;
    render();
  });
  $("alertButton").addEventListener("click", () => {
    state.alerts = !state.alerts;
    state.baseline = null;
    $("alertButton").setAttribute("aria-pressed", String(state.alerts));
    clearInterval(refreshTimer);
    if (state.alerts) {
      refreshTimer = setInterval(() => {
        if (!document.hidden) loadData();
      }, 60000);
      notify(
        "이 화면이 열려 있는 동안 저장한 시설의 새 현황을 1분마다 확인합니다.",
      );
      beep();
      loadData();
    } else notify("변화 알림을 껐습니다.");
  });
  $("helpButton").addEventListener("click", () => $("helpDialog").showModal());
  $("closeHelp").addEventListener("click", () => $("helpDialog").close());
  $("connectButton").addEventListener("click", async () => {
    const target = window.open("about:blank", "_blank");
    try {
      const response = await fetch("/api/bridge/setup");
      if (!response.ok) throw new Error();
      const setup = await response.json();
      if (target) target.location.href = setup.connect_url;
      else notify("팝업을 허용한 뒤 다시 연결해 주세요.");
    } catch {
      target?.close();
      notify("로컬 서버를 실행한 뒤 연결해 주세요.");
    }
  });
  $("cancelSearch").addEventListener("click", async () => {
    try {
      await fetch("/api/forest/cancel", { method: "POST" });
      await loadData();
    } catch {
      notify("조회 중단을 확인하지 못했어요.");
    }
  });
  setInterval(() => {
    if (
      !document.hidden &&
      (state.forestJob?.state === "pending" ||
        state.collectJob?.state === "running") &&
      !state.loading
    )
      loadData();
  }, 5000);
  setInterval(() => {
    if (!document.hidden) render();
  }, 60000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      $("dateInput").min = C.today();
      render();
    }
  });
  function populateRegions() {
    const regions = [...new Set(currentItems().map((x) => x.region))].sort(
      (a, b) => a.localeCompare(b, "ko"),
    );
    $("regionInput").innerHTML =
      '<option value="">전국 모든 지역</option>' +
      regions.map((x) => `<option value="${h(x)}">${h(x)}</option>`).join("");
    if (state.region && !regions.includes(state.region)) state.region = "";
    $("regionInput").value = state.region;
  }
  async function start() {
    $("dateInput").value = state.date;
    $("dateInput").min = C.today();
    $("guestsInput").value = String(state.guests);
    try {
      const [catalogResponse, metaResponse] = await Promise.all([
        fetch("catalog.json"),
        fetch("camps_meta.json"),
      ]);
      if (!catalogResponse.ok || !metaResponse.ok) throw new Error("catalog");
      state.catalog = await catalogResponse.json();
      const meta = await metaResponse.json();
      const regionMap = {
        설악산: "강원",
        오대산: "강원",
        치악산: "강원",
        태백산: "강원",
        북한산: "서울/인천/경기",
        월악산: "충북",
        소백산: "충북",
        계룡산: "대전/충남",
        태안해안: "대전/충남",
        가야산: "대구/경북",
        주왕산: "대구/경북",
        팔공산: "대구/경북",
        한려해상: "부산/경남",
      };
      state.items = [
        ...state.catalog.forests,
        ...meta.map((x) => ({
          id: x.dept_id,
          service: "knps",
          name: x.camp_name + " 야영장",
          park: x.park_name,
          region: regionMap[x.park_name] || "전라",
          operator: "국립공원",
          url: "https://reservation.knps.or.kr/reservation/searchSimpleCampReservation.do",
        })),
      ];
      $("forestCount").textContent = state.catalog.forests.length;
      $("campCount").textContent = meta.length;
      populateRegions();
      saveSearch();
      render();
      await loadData();
    } catch {
      state.error =
        "시설 목록을 불러오지 못했어요. 로컬 서버가 실행 중인지 확인하고 새로고침해 주세요.";
      render();
    }
  }
  start();
})();
