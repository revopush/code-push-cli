// English date formatting with the exact output the CLI printed with moment.js

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const INVALID_DATE = "Invalid date";

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function hours12(date: Date): number {
  return date.getHours() % 12 || 12;
}

function shortMonth(date: Date): string {
  return MONTHS[date.getMonth()].slice(0, 3);
}

function relativePhrase(ms: number): string {
  const seconds: number = Math.round(ms / MS_PER_SECOND);
  const minutes: number = Math.round(ms / MS_PER_MINUTE);
  const hours: number = Math.round(ms / MS_PER_HOUR);
  const days: number = Math.round(ms / MS_PER_DAY);

  if (seconds <= 44) {
    return "a few seconds";
  }
  if (minutes <= 1) {
    return "a minute";
  }
  if (minutes < 45) {
    return `${minutes} minutes`;
  }
  if (hours <= 1) {
    return "an hour";
  }
  if (hours < 22) {
    return `${hours} hours`;
  }
  if (days <= 1) {
    return "a day";
  }
  if (days < 26) {
    return `${days} days`;
  }
  return "a month";
}

// moment's `fromNow()` wording, e.g. "a few seconds ago", "an hour ago", "in 20 days". Only valid within 30 days,
// which is all formatDate uses it for; beyond that moment counts calendar months.
function formatRelativeTime(date: Date, now: Date): string {
  const msFromNow: number = date.getTime() - now.getTime();
  const phrase: string = relativePhrase(Math.abs(msFromNow));
  return msFromNow > 0 ? `in ${phrase}` : `${phrase} ago`;
}

/** Relative time within 30 days, otherwise "Nov 6" in the current year and "Nov 6, 2014" before it */
export function formatDate(unixOffset: number | undefined, now: Date = new Date()): string {
  // Like moment: a missing time means now, while null and NaN are invalid
  const date: Date = unixOffset === undefined ? now : new Date(unixOffset ?? NaN);
  if (isNaN(date.getTime())) {
    return INVALID_DATE;
  }

  // Whole days between the dates, ignoring daylight saving time shifts (moment's `diff(date, "days")`)
  const zoneDelta: number = (now.getTimezoneOffset() - date.getTimezoneOffset()) * MS_PER_MINUTE;
  const days: number = Math.trunc((now.getTime() - date.getTime() - zoneDelta) / MS_PER_DAY);

  if (Math.abs(days) < 30) {
    return formatRelativeTime(date, now);
  } else if (now.getFullYear() === date.getFullYear()) {
    return `${shortMonth(date)} ${date.getDate()}`;
  } else {
    return `${shortMonth(date)} ${date.getDate()}, ${date.getFullYear()}`;
  }
}

/** e.g. "Thursday, December 3, 2026 2:05 PM" (moment's "LLLL") */
export function formatLongDateTime(date: Date): string {
  if (isNaN(date.getTime())) {
    return INVALID_DATE;
  }

  const meridiem: string = date.getHours() < 12 ? "AM" : "PM";
  return (
    `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()} ` +
    `${hours12(date)}:${pad2(date.getMinutes())} ${meridiem}`
  );
}

/** e.g. "02:05:09", a 12-hour clock without AM/PM (moment's "hh:mm:ss") */
export function formatClockTime(date: Date): string {
  return `${pad2(hours12(date))}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}
