import { strict as assert } from "assert";
import { formatClockTime, formatDate, formatLongDateTime } from "../script/utils/date-utils";

// Expected strings are what moment.js printed for the same dates (test/setup.ts fixes the time zone)
describe("date-utils", () => {
  const now = new Date(2026, 9, 15, 12, 0, 0);
  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  describe("formatDate", () => {
    const relativeCases: Array<[offset: number, expected: string]> = [
      [-10 * SECOND, "a few seconds ago"],
      [-44 * SECOND, "a few seconds ago"],
      [-45 * SECOND, "a minute ago"],
      [-89 * SECOND, "a minute ago"],
      [-90 * SECOND, "2 minutes ago"],
      [-44 * MINUTE, "44 minutes ago"],
      [-45 * MINUTE, "an hour ago"],
      [-2 * HOUR, "2 hours ago"],
      [-21 * HOUR, "21 hours ago"],
      [-22 * HOUR, "a day ago"],
      [-36 * HOUR, "2 days ago"],
      [-25 * DAY, "25 days ago"],
      [-26 * DAY, "a month ago"],
      [-29 * DAY, "a month ago"],
      [20 * DAY, "in 20 days"],
    ];

    for (const [offset, expected] of relativeCases) {
      it(`shows "${expected}" within 30 days`, () => {
        assert.equal(formatDate(now.getTime() + offset, now), expected);
      });
    }

    it("shows the month and day for older dates in the current year", () => {
      assert.equal(formatDate(new Date(2026, 7, 31, 9, 30).getTime(), now), "Aug 31");
    });

    it("adds the year for dates in earlier years", () => {
      assert.equal(formatDate(new Date(2014, 10, 6, 9, 30).getTime(), now), "Nov 6, 2014");
    });

    it("treats a missing time as now and an invalid one like moment", () => {
      assert.equal(formatDate(undefined, now), "a few seconds ago");
      assert.equal(formatDate(null, now), "Invalid date");
      assert.equal(formatDate(NaN, now), "Invalid date");
    });

    it("counts days across a daylight saving time change", () => {
      // 30 days back from Nov 15 crosses the Nov 1 clock change, which adds an hour
      const later = new Date(2026, 10, 15, 12, 0);
      assert.equal(formatDate(new Date(2026, 9, 16, 13, 0).getTime(), later), "a month ago");
      assert.equal(formatDate(new Date(2026, 9, 16, 12, 0).getTime(), later), "Oct 16");
    });
  });

  describe("formatLongDateTime", () => {
    it("formats the weekday, date and 12-hour time", () => {
      assert.equal(formatLongDateTime(new Date(2026, 11, 3, 14, 5)), "Thursday, December 3, 2026 2:05 PM");
    });

    it("shows an invalid date like moment", () => {
      assert.equal(formatLongDateTime(new Date(NaN)), "Invalid date");
    });

    it("shows midnight and noon as 12", () => {
      assert.equal(formatLongDateTime(new Date(2026, 0, 1, 0, 0)), "Thursday, January 1, 2026 12:00 AM");
      assert.equal(formatLongDateTime(new Date(2026, 0, 1, 12, 0)), "Thursday, January 1, 2026 12:00 PM");
    });
  });

  describe("formatClockTime", () => {
    it("pads a 12-hour time without AM/PM", () => {
      assert.equal(formatClockTime(new Date(2026, 9, 15, 14, 5, 9)), "02:05:09");
      assert.equal(formatClockTime(new Date(2026, 9, 15, 0, 0, 0)), "12:00:00");
    });
  });
});
