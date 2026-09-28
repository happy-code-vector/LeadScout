/**
 * Recipient-local send windows (spec: Sending rules).
 * America/New_York for NYC; for other areas, derive the timezone from the
 * business's state.
 */

const STATE_TZ: Record<string, string> = {
  NY: "America/New_York",
  NJ: "America/New_York",
  CT: "America/New_York",
  PA: "America/New_York",
  MA: "America/New_York",
  RI: "America/New_York",
  NH: "America/New_York",
  VT: "America/New_York",
  ME: "America/New_York",
  DE: "America/New_York",
  MD: "America/New_York",
  DC: "America/New_York",
  VA: "America/New_York",
  WV: "America/New_York",
  OH: "America/New_York",
  MI: "America/Detroit",
  IN: "America/Indiana/Indianapolis",
  KY: "America/New_York",
  TN: "America/Chicago",
  IL: "America/Chicago",
  WI: "America/Chicago",
  MN: "America/Chicago",
  IA: "America/Chicago",
  MO: "America/Chicago",
  AR: "America/Chicago",
  LA: "America/Chicago",
  MS: "America/Chicago",
  AL: "America/Chicago",
  TX: "America/Chicago",
  OK: "America/Chicago",
  KS: "America/Chicago",
  NE: "America/Chicago",
  SD: "America/Chicago",
  ND: "America/Chicago",
  MT: "America/Denver",
  WY: "America/Denver",
  CO: "America/Denver",
  NM: "America/Denver",
  UT: "America/Denver",
  AZ: "America/Phoenix",
  ID: "America/Boise",
  WA: "America/Los_Angeles",
  OR: "America/Los_Angeles",
  CA: "America/Los_Angeles",
  NV: "America/Los_Angeles",
  AK: "America/Anchorage",
  HI: "Pacific/Honolulu",
};

export function timezoneForState(state: string | null | undefined): string {
  if (!state) return "America/New_York";
  return STATE_TZ[state.toUpperCase()] ?? "America/New_York";
}

export interface SendWindow {
  startHour: number;
  endHour: number;
  daysOfWeek: number[]; // 0 (Sunday) … 6 (Saturday)
}

export function parseSendWindow(raw: string | null | undefined): SendWindow {
  const fallback: SendWindow = { startHour: 9, endHour: 16, daysOfWeek: [1, 2, 3, 4, 5] };
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<SendWindow>;
    return {
      startHour: Number.isInteger(parsed.startHour) ? parsed.startHour! : fallback.startHour,
      endHour: Number.isInteger(parsed.endHour) ? parsed.endHour! : fallback.endHour,
      daysOfWeek:
        Array.isArray(parsed.daysOfWeek) && parsed.daysOfWeek.every((d) => Number.isInteger(d))
          ? parsed.daysOfWeek!
          : fallback.daysOfWeek,
    };
  } catch {
    return fallback;
  }
}

/** Local hour and weekday (0=Sun…6=Sat) in the given IANA timezone. */
export function localHourAndDay(date: Date, timeZone: string): { hour: number; day: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    weekday: "short",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return { hour: hour % 24, day: days.indexOf(weekday) };
}

export function isWithinSendWindow(
  date: Date,
  window: SendWindow,
  timeZone: string,
): boolean {
  const { hour, day } = localHourAndDay(date, timeZone);
  if (!window.daysOfWeek.includes(day)) return false;
  return hour >= window.startHour && hour < window.endHour;
}
