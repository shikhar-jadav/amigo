import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  isValidCron,
  humanizeCron,
  getNextCronRuns,
  formatRelativeTime,
  humanizeInterval,
  humanizeSchedule,
  buildCronFromConfig,
} from '../cronHelpers.ts';

describe('cronHelpers', () => {
  describe('isValidCron', () => {
    it('accepts valid 5-part cron expressions', () => {
      assert.strictEqual(isValidCron('0 9 * * *'), true);
      assert.strictEqual(isValidCron('*/15 * * * *'), true);
      assert.strictEqual(isValidCron('0 8 * * 1-5'), true);
      assert.strictEqual(isValidCron('30 18 1 * *'), true);
      assert.strictEqual(isValidCron('0,30 * * * *'), true);
    });

    it('rejects invalid cron expressions', () => {
      assert.strictEqual(isValidCron(''), false);
      assert.strictEqual(isValidCron('invalid'), false);
      assert.strictEqual(isValidCron('0 9 * *'), false); // 4 parts
      assert.strictEqual(isValidCron('0 9 * * * *'), false); // 6 parts
      assert.strictEqual(isValidCron('60 9 * * *'), false); // minute > 59
      assert.strictEqual(isValidCron('0 25 * * *'), false); // hour > 23
      assert.strictEqual(isValidCron('0 9 32 * *'), false); // day > 31
      assert.strictEqual(isValidCron('0 9 * 13 *'), false); // month > 12
      assert.strictEqual(isValidCron('0 9 * * 8'), false); // dow > 7
    });
  });

  describe('humanizeCron', () => {
    it('translates common cron expressions to plain English', () => {
      assert.strictEqual(humanizeCron('0 9 * * *'), 'Every day at 9:00 AM');
      assert.strictEqual(humanizeCron('0 18 * * *'), 'Every day at 6:00 PM');
      assert.strictEqual(humanizeCron('*/30 * * * *'), 'Every 30 minutes');
      assert.strictEqual(humanizeCron('0 * * * *'), 'Every hour, on the hour');
      assert.strictEqual(humanizeCron('0 9 * * 1-5'), 'Every weekday (Mon–Fri) at 9:00 AM');
      assert.strictEqual(humanizeCron('0 10 * * 0,6'), 'Every weekend (Sat–Sun) at 10:00 AM');
      assert.strictEqual(humanizeCron('0 8 1 * *'), 'Monthly on the 1st at 8:00 AM');
    });

    it('handles invalid cron safely', () => {
      assert.strictEqual(humanizeCron('invalid cron'), 'Invalid schedule expression');
    });
  });

  describe('getNextCronRuns', () => {
    it('computes next run times chronologically', () => {
      const baseDate = new Date('2026-10-23T08:00:00Z');
      const runs = getNextCronRuns('0 9 * * *', 3, baseDate);
      assert.strictEqual(runs.length, 3);
      assert.strictEqual(runs[0].getMinutes(), 0);
      assert.strictEqual(runs[0].getHours(), 9);
      assert.strictEqual(runs[1].getHours(), 9);
    });

    it('returns empty array for invalid cron', () => {
      assert.deepStrictEqual(getNextCronRuns('invalid'), []);
    });
  });

  describe('buildCronFromConfig', () => {
    it('constructs correct cron expressions', () => {
      assert.strictEqual(
        buildCronFromConfig({
          frequency: 'daily',
          hour: 9,
          minute: 30,
          weekdays: [],
          intervalMinutes: 15,
          dayOfMonth: 1,
        }),
        '30 9 * * *'
      );

      assert.strictEqual(
        buildCronFromConfig({
          frequency: 'hourly',
          hour: 0,
          minute: 0,
          weekdays: [],
          intervalMinutes: 15,
          dayOfMonth: 1,
        }),
        '0 * * * *'
      );

      assert.strictEqual(
        buildCronFromConfig({
          frequency: 'interval',
          hour: 0,
          minute: 0,
          weekdays: [],
          intervalMinutes: 15,
          dayOfMonth: 1,
        }),
        '*/15 * * * *'
      );
    });
  });

  describe('humanizeInterval', () => {
    it('formats seconds into human intervals', () => {
      assert.strictEqual(humanizeInterval(30), 'Every 30s');
      assert.strictEqual(humanizeInterval(60), 'Every minute');
      assert.strictEqual(humanizeInterval(300), 'Every 5 minutes');
      assert.strictEqual(humanizeInterval(3600), 'Every hour');
      assert.strictEqual(humanizeInterval(7200), 'Every 2 hours');
    });
  });

  describe('humanizeSchedule', () => {
    it('never says "Periodic pulse" for scheduled tasks', () => {
      const scheduledWithCron = {
        trigger_type: 'scheduled',
        schedule: { cron: '0 9 * * *' },
      };
      assert.strictEqual(humanizeSchedule(scheduledWithCron), 'Every day at 9:00 AM');

      const scheduledWithoutCron = {
        trigger_type: 'scheduled',
        schedule: {},
      };
      assert.strictEqual(humanizeSchedule(scheduledWithoutCron), 'Manual trigger only');
    });

    it('formats heartbeat and event schedules accurately', () => {
      const heartbeat = {
        trigger_type: 'heartbeat',
        schedule: { interval_seconds: 3600 },
      };
      assert.strictEqual(humanizeSchedule(heartbeat), 'Every hour');

      const event = {
        trigger_type: 'event',
        metadata: { event_trigger: 'process_crash' },
      };
      assert.strictEqual(humanizeSchedule(event), 'On dev server / process crash');
    });
  });

  describe('formatRelativeTime', () => {
    it('formats future and past timestamps', () => {
      const nowSec = Math.floor(Date.now() / 1000);
      assert.strictEqual(formatRelativeTime(nowSec), 'Just now');
      assert.strictEqual(formatRelativeTime(nowSec + 120), 'in 2m');
      assert.strictEqual(formatRelativeTime(nowSec - 180), '3m ago');
    });
  });
});
