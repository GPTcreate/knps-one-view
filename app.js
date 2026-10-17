"use strict";
(() => {
  const C = ForestCore,
    T = ForestTransport,
    $ = (id) => document.getElementById(id),
    h = C.escapeHTML;
  let storage;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  const initial = new URLSearchParams(location.hash.slice(1));
  const maxDate = () => C.addDays(C.today(), T.mode === "web" ? 90 : 365);
  const state = {
    date:
      C.validDate(initial.get("date")) &&
      initial.get("date") >= C.today() &&
      initial.get("date") <= maxDate()
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
    refresh: null,
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
    if (!C.validDate(date) || date < C.today() || date > maxDate()) {
      notify(
        `오늘부터 ${T.mode === "web" ? 90 : 365}일 이내 날짜를 선택해 주세요.`,
      );
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
      return `<button class="date-card ${date === state.date ? "active" : ""} ${[0, 6].includes(d.getUTCDay()) ? "weekend" : ""}" data-date="${date}" ${date > maxDate() ? "disabled" : ""} aria-pressed="${date === state.date}" aria-label="${h(dateText(date))} ${h(hint)}"><span>${h(date === C.today() ? "오늘" : new Intl.DateTimeFormat("ko-KR", { timeZone: "UTC", weekday: "short" }).format(d))}</span><b>${d.getUTCMonth() + 1}.${String(d.getUTCDate()).padStart(2, "0")}</b><small>${h(hint)}</small></button>`;
    }).join("");
    $("previousDates").disabled = start <= C.today();
    $("nextDates").disabled = C.addDays(start, 7) > maxDate();
  }
  function renderBanner() {
    const source = state.sources[state.service] || {};
    if (
      T.mode === "web" &&
      state.service === "forest" &&
      state.refresh &&
      !state.error &&
      !state.loading
    ) {
      const current = state.refresh,
        banner = $("sourceBanner");
      banner.className = "source-banner";
      $("cancelSearch").hidden = true;
      if (current.pending) {
        banner.classList.add("warning");
        banner.textContent = current.offline
          ? `갱신 대기 · ${current.pending}곳의 새 현황을 요청했습니다. 수집기 연결을 기다리는 동안 이전 결과와 확인 시각을 볼 수 있어요.`
          : `새 현황 확인 중 · ${current.running}곳 조회 중, ${current.queued}곳 대기. ${current.total}곳 중 ${current.fresh}곳은 최근 5분 이내 관측 자료입니다.`;
      } else if (current.failed) {
        banner.classList.add("warning");
        banner.textContent = `${current.failed}곳의 새 현황을 확인하지 못했습니다. 이전 관측값과 시각을 유지하며, 만료된 자료는 미확인으로 표시합니다.`;
      } else if (current.fresh) {
        banner.textContent = `선택한 ${current.total}곳 중 ${current.fresh}곳은 최근 5분 이내 관측 자료입니다. 운영자가 공식 화면에서 확인한 결과이며 예약 전 공식 현황을 다시 확인해 주세요.`;
      } else {
        banner.classList.add("warning");
        banner.textContent =
          "새 현황이 필요합니다. 지역과 날짜를 선택해 검색하면 오래된 시설·월만 갱신을 요청합니다. 확인되지 않은 자료는 미확인으로 표시합니다.";
      }
      return;
    }
    if (
      state.service === "forest" &&
      T.mode === "web" &&
      ["login_required", "pending_integration"].includes(source.state) &&
      !state.error &&
      !state.loading
    ) {
      $("sourceBanner").className = "source-banner warning";
      $("sourceBanner").textContent =
        "휴양림 실시간 현황은 공식 데이터 연계 준비 중입니다. 지금은 시설을 찾아 저장하고 공식 현황으로 이동할 수 있어요. 설치나 로그인은 필요하지 않습니다.";
      $("cancelSearch").hidden = true;
      return;
    }
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
        : "조회가 중단됐어요. 숲나들e 연결 상태를 확인한 뒤 다시 검색해 주세요.";
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
    if (["login_required", "connection_required"].includes(source.state)) {
      if (state.connected) {
        banner.textContent =
          "공식 현황이 연결됐어요. 지역과 날짜를 선택하고 자리 찾아보기를 누르세요.";
        return;
      }
      banner.classList.add("warning");
      banner.textContent =
        "숲나들e 연결을 누르고 공식 화면에서 로그인하면 여러 휴양림을 한 번에 조회할 수 있어요. 미확인은 매진이 아닙니다.";
      return;
    }
    if (state.service === "forest" && source.state === "empty") {
      banner.textContent =
        "숲나들e 연결이 준비됐어요. 지역과 날짜를 선택해 검색하세요.";
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
    state.items = state.items.map((item) => {
      const update = updates.get(`${item.service}:${item.id}`);
      if (update) return { ...item, ...update };
      if (item.service === state.service) {
        const { rooms, checked_at, ...catalogOnly } = item;
        return catalogOnly;
      }
      return item;
    });
    for (const item of payload.items || [])
      if (
        !state.items.some((x) => x.id === item.id && x.service === item.service)
      )
        state.items.push(item);
    state.sources = payload.sources || {};
    state.forestJob = payload.forest_job || null;
    state.connected = !!payload.forest_connected;
    state.collectJob = payload.job || null;
    state.refresh = payload.refresh || null;
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
      const payload = await T.status(state.service, {
        signal,
        conditions: searchConditions(),
      });
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
  function searchConditions() {
    let ids;
    if (state.favoritesOnly) ids = state.favorites;
    if (state.query) {
      const matched = C.filterItems(state.items, {
        ...state,
        status: "all",
      }).map((item) => item.id);
      ids = ids ? ids.filter((id) => matched.includes(id)) : matched;
    }
    return {
      date: state.date,
      region: state.region,
      operator: state.operator,
      ...(ids ? { ids } : {}),
    };
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
    if (T.mode === "web") {
      const conditions = searchConditions();
      if (conditions.ids && !conditions.ids.length) {
        notify("검색 조건에 맞는 시설이 없습니다. 필터를 넓혀 주세요.");
        return;
      }
      $("searchButton").disabled = true;
      $("refreshButton").disabled = true;
      try {
        await T.start(conditions);
      } catch (error) {
        notify(error.message);
      }
      await loadData();
      return;
    }
    try {
      if (!state.connected) {
        await loadData();
        if (!state.connected) {
          notify("상단의 숲나들e 연결을 누르고 공식 화면에서 로그인해 주세요.");
          return;
        }
      }
      await T.start(searchConditions());
      await loadData();
    } catch (error) {
      notify(
        error.message ||
          "조회를 시작하지 못했습니다. 연결 상태를 확인해 주세요.",
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
    if (!button || button.disabled) return;
    state.date = button.dataset.date;
    $("dateInput").value = state.date;
    state.limit = 20;
    state.baseline = null;
    saveSearch();
    render();
    state.service === "forest" ? searchForest() : loadData();
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
    if (collectSearch())
      state.service === "forest" ? searchForest() : loadData();
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
    try {
      await T.connect();
      notify("열린 숲나들e 탭에서 로그인한 뒤 돌아와 검색하세요.");
    } catch (error) {
      notify(error.message);
    }
  });
  $("cancelSearch").addEventListener("click", async () => {
    try {
      await T.cancel();
      await loadData();
    } catch (error) {
      notify(error.message || "조회 중단을 확인하지 못했어요.");
    }
  });
  $("clearData").addEventListener("click", async () => {
    try {
      await T.clear();
      state.items = state.catalog.forests.map((item) => ({ ...item }));
      state.baseline = null;
      await loadData();
      notify(
        "이 확장에 저장된 객실 조회 기록을 삭제했습니다. 찜은 유지됩니다.",
      );
    } catch (error) {
      notify(error.message);
    }
  });
  setInterval(() => {
    if (
      !document.hidden &&
      (state.forestJob?.state === "pending" ||
        state.collectJob?.state === "running" ||
        state.refresh?.pending) &&
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
      $("dateInput").max = maxDate();
      render();
      if (!state.loading) loadData();
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
    $("connectButton").hidden = T.mode !== "extension";
    $("clearData").hidden = T.mode !== "extension";
    $("privacyLink").hidden = T.mode !== "extension";
    document.querySelector(".version").textContent =
      T.mode === "extension" ? "확장 1.0 RC" : "웹 미리보기";
    if (T.mode === "extension") {
      state.service = "forest";
      document.querySelector('[data-service="knps"]').hidden = true;
    }

    $("dateInput").value = state.date;
    $("dateInput").min = C.today();
    $("dateInput").max = maxDate();
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
