/* Normalizes only room observations; never stores account or browser data. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ForestObservation = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const states = new Set([
    "available",
    "waitlist",
    "full",
    "closed",
    "priority",
    "lottery",
    "unknown",
  ]);
  function normalize(raw, facility, date, now = Date.now()) {
    if (
      !raw ||
      raw.id !== facility.id ||
      !Array.isArray(raw.rooms) ||
      !raw.rooms.length ||
      raw.rooms.length > 2000
    )
      throw Error("시설 응답을 확인할 수 없습니다.");
    const time = Date.parse(raw.checked_at);
    if (!Number.isFinite(time) || Math.abs(now - time) > 300000)
      throw Error("조회 시각이 올바르지 않습니다.");
    const identities = new Set();
    const rooms = raw.rooms.map((room) => {
      if (
        typeof room.id !== "string" ||
        !room.id ||
        room.id.length > 500 ||
        identities.has(room.id) ||
        !room.days ||
        typeof room.days !== "object" ||
        Array.isArray(room.days)
      )
        throw Error("객실 응답을 확인할 수 없습니다.");
      identities.add(room.id);
      const days = {};
      if (Object.keys(room.days).length > 31)
        throw Error("조회 월을 확인할 수 없습니다.");
      for (const [day, status] of Object.entries(room.days)) {
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
          new Date(day + "T12:00:00Z").toISOString().slice(0, 10) !== day ||
          day.slice(0, 7) !== date.slice(0, 7) ||
          !states.has(status?.state)
        )
          throw Error("날짜별 응답을 확인할 수 없습니다.");
        const value = {
          state: status.state,
          checked_at: new Date(time).toISOString(),
        };
        if (status.next_rank !== undefined) {
          if (
            status.state !== "waitlist" ||
            !Number.isInteger(status.next_rank) ||
            status.next_rank < 1 ||
            status.next_rank > 100
          )
            throw Error("대기 신청 순위가 올바르지 않습니다.");
          value.next_rank = status.next_rank;
        }
        days[day] = value;
      }
      const positive = (value) =>
        Number.isInteger(value) && value > 0 && value <= 1000 ? value : null;
      return {
        id: room.id,
        name: String(room.name || "").slice(0, 200),
        type: String(room.type || "숙소").slice(0, 80),
        area: String(room.area || "").slice(0, 50),
        capacity: positive(room.capacity),
        base_capacity: positive(room.base_capacity),
        days,
      };
    });
    if (!rooms.some((room) => Object.keys(room.days).length))
      throw Error("확인된 날짜가 없습니다.");
    return { ...facility, checked_at: new Date(time).toISOString(), rooms };
  }
  function merge(old, current) {
    const rooms = new Map(
      (old?.rooms || []).map((room) => [
        room.id,
        {
          ...room,
          days: Object.fromEntries(
            Object.entries(room.days).map(([day, status]) => [
              day,
              { ...status, checked_at: status.checked_at || old.checked_at },
            ]),
          ),
        },
      ]),
    );
    for (const room of current.rooms)
      rooms.set(room.id, {
        ...room,
        days: { ...rooms.get(room.id)?.days, ...room.days },
      });
    const today = new Date().toLocaleDateString("sv-SE", {
      timeZone: "Asia/Seoul",
    });
    return {
      ...current,
      rooms: [...rooms.values()].map((room) => ({
        ...room,
        days: Object.fromEntries(
          Object.entries(room.days).filter(([day]) => day >= today),
        ),
      })),
    };
  }
  function fit(items, maxBytes = 6000000) {
    const sorted = [...items].sort(
      (a, b) => Date.parse(b.checked_at) - Date.parse(a.checked_at),
    );
    while (sorted.length && JSON.stringify(sorted).length * 3 > maxBytes)
      sorted.pop();
    return sorted;
  }
  return { normalize, merge, fit };
});
