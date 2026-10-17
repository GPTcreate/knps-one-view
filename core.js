/* Shared booking rules. No synthetic availability or waiting ranks. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ForestCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const FRESH_MS = 30 * 60 * 1000;
  function today(now = new Date()) {
    return new Date(now.getTime() + 9 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
  }
  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
      return false;
    const d = new Date(value + "T12:00:00Z");
    return (
      Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value
    );
  }
  function addDays(value, count) {
    if (!validDate(value)) throw new Error("잘못된 날짜");
    const d = new Date(value + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + count);
    return d.toISOString().slice(0, 10);
  }
  function nextSaturday(value = today()) {
    return addDays(
      value,
      (6 - new Date(value + "T12:00:00Z").getUTCDay() + 7) % 7,
    );
  }
  function freshness(timestamp, now = Date.now()) {
    const age = now - Date.parse(timestamp);
    return Number.isFinite(age) && age >= -60000 && age <= FRESH_MS;
  }
  function safeURL(value) {
    try {
      const u = new URL(value);
      return u.protocol === "https:" &&
        !u.username &&
        !u.password &&
        [
          "www.foresttrip.go.kr",
          "foresttrip.go.kr",
          "reservation.knps.or.kr",
        ].includes(u.hostname)
        ? u.href
        : "";
    } catch {
      return "";
    }
  }
  function escapeHTML(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }
  function roomStatus(room, date, timestamp, now = Date.now()) {
    if (!validDate(date) || date < today(new Date(now)))
      return { state: "unknown", reason: "지난 날짜" };
    const value = room.days?.[date];
    const observed = value?.checked_at || timestamp;
    if (!freshness(observed, now))
      return { state: "unknown", reason: observed ? "갱신 필요" : "미확인" };
    if (
      !value ||
      ![
        "available",
        "waitlist",
        "full",
        "closed",
        "priority",
        "lottery",
      ].includes(value.state)
    )
      return { state: "unknown", reason: "날짜 미확인" };
    return value;
  }
  function summarize(item, date, guests = 1, now = Date.now()) {
    const result = {
      available: 0,
      waitlist: 0,
      full: 0,
      closed: 0,
      priority: 0,
      lottery: 0,
      unknown: 0,
      rooms: [],
      nextRank: null,
      capacityUnknown: false,
    };
    const timestamp = item.checked_at;
    for (const room of item.rooms || []) {
      if (Number.isInteger(room.capacity) && room.capacity < guests) continue;
      if (!Number.isInteger(room.capacity)) result.capacityUnknown = true;
      const status = roomStatus(room, date, timestamp, now);
      result[status.state]++;
      result.rooms.push({ ...room, status });
      if (
        status.state === "waitlist" &&
        Number.isInteger(status.next_rank) &&
        status.next_rank > 0
      ) {
        result.nextRank =
          result.nextRank === null
            ? status.next_rank
            : Math.min(result.nextRank, status.next_rank);
      }
    }
    result.state = result.available
      ? "available"
      : result.waitlist
        ? "waitlist"
        : result.unknown || !result.rooms.length
          ? "unknown"
          : result.full
            ? "full"
            : result.priority
              ? "priority"
              : result.lottery
                ? "lottery"
                : "closed";
    result.fresh = freshness(timestamp, now);
    result.capacityExcluded = !!item.rooms?.length && !result.rooms.length;
    return result;
  }
  function filterItems(items, filters, now = Date.now()) {
    const q = (filters.query || "").trim().toLocaleLowerCase("ko");
    return items.filter((item) => {
      if (filters.service && item.service !== filters.service) return false;
      if (filters.region && item.region !== filters.region) return false;
      if (filters.operator && item.operator !== filters.operator) return false;
      if (filters.favoritesOnly && !filters.favorites?.includes(item.id))
        return false;
      const summary = summarize(item, filters.date, filters.guests, now);
      if (summary.capacityExcluded) return false;
      if (
        filters.roomType &&
        !summary.rooms.some((r) => r.type === filters.roomType)
      )
        return false;
      if (
        q &&
        ![
          item.name,
          item.park,
          item.region,
          ...summary.rooms.map((r) => r.name),
        ].some((x) =>
          String(x || "")
            .toLocaleLowerCase("ko")
            .includes(q),
        )
      )
        return false;
      if (
        filters.status === "opportunity" &&
        !summary.available &&
        !summary.waitlist
      )
        return false;
      if (filters.status === "available" && !summary.available) return false;
      if (filters.status === "waitlist" && !summary.waitlist) return false;
      return true;
    });
  }
  // Only transitions from a previously observed, fresh room state trigger an alert.
  // A new date, newly saved facility, initial load or expired sample is a baseline.
  function detectChanges(
    previous,
    current,
    date,
    favorites,
    guests = 1,
    now = Date.now(),
  ) {
    if (!previous || previous.date !== date || previous.guests !== guests)
      return [];
    const events = [];
    for (const item of current) {
      if (!favorites.includes(item.id)) continue;
      const before = previous.items.find((x) => x.id === item.id);
      if (
        !before ||
        !freshness(before.checked_at, now) ||
        !freshness(item.checked_at, now)
      )
        continue;
      if (Date.parse(item.checked_at) <= Date.parse(before.checked_at))
        continue;
      for (const room of item.rooms || []) {
        if (room.capacity && room.capacity < guests) continue;
        const oldRoom = before.rooms?.find((x) => x.id === room.id);
        if (!oldRoom) continue;
        const oldStatus = roomStatus(oldRoom, date, before.checked_at, now);
        const next = roomStatus(room, date, item.checked_at, now);
        if (oldStatus.state === "unknown") continue;
        if (
          Date.parse(next.checked_at || item.checked_at) <=
          Date.parse(oldStatus.checked_at || before.checked_at)
        )
          continue;
        if (
          (next.state === "available" && oldStatus.state !== "available") ||
          (next.state === "waitlist" &&
            oldStatus.state !== "available" &&
            (oldStatus.state !== "waitlist" ||
              (Number.isInteger(next.next_rank) &&
                Number.isInteger(oldStatus.next_rank) &&
                next.next_rank < oldStatus.next_rank)))
        ) {
          events.push({ facility: item.name, room: room.name, ...next });
        }
      }
    }
    return events;
  }
  function readSaved(storage, key, fallback) {
    try {
      const v = JSON.parse(storage.getItem(key));
      return Array.isArray(v) && v.every((x) => typeof x === "string")
        ? v
        : fallback;
    } catch {
      return fallback;
    }
  }
  function validatePayload(payload) {
    if (
      !payload ||
      payload.schema_version !== 1 ||
      !Array.isArray(payload.items) ||
      !payload.sources ||
      typeof payload.sources !== "object"
    )
      return false;
    const identities = new Set();
    for (const item of payload.items) {
      if (
        !item ||
        typeof item.id !== "string" ||
        !["forest", "knps"].includes(item.service) ||
        !Array.isArray(item.rooms)
      )
        return false;
      const identity = item.service + ":" + item.id;
      if (identities.has(identity)) return false;
      identities.add(identity);
      for (const room of item.rooms) {
        if (
          !room ||
          typeof room.id !== "string" ||
          typeof room.name !== "string" ||
          !room.days ||
          typeof room.days !== "object" ||
          Array.isArray(room.days)
        )
          return false;
        if (
          room.capacity != null &&
          (!Number.isInteger(room.capacity) || room.capacity < 1)
        )
          return false;
        for (const [day, status] of Object.entries(room.days)) {
          if (
            !validDate(day) ||
            !status ||
            ![
              "available",
              "waitlist",
              "full",
              "closed",
              "priority",
              "lottery",
              "unknown",
            ].includes(status.state)
          )
            return false;
          if (
            status.next_rank != null &&
            (status.state !== "waitlist" ||
              !Number.isInteger(status.next_rank) ||
              status.next_rank < 1 ||
              status.next_rank > 100)
          )
            return false;
        }
      }
    }
    return true;
  }
  return {
    FRESH_MS,
    today,
    validDate,
    addDays,
    nextSaturday,
    freshness,
    safeURL,
    escapeHTML,
    roomStatus,
    summarize,
    filterItems,
    detectChanges,
    readSaved,
    validatePayload,
  };
});
