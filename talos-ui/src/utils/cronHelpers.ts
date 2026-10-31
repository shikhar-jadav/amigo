/**
 * Pure scheduling, cron validation, humanization, and relative time helpers for Talos Proactive Automations.
 * Zero external dependencies.
 */

export interface FriendlyScheduleConfig {
  frequency: 'daily' | 'weekly' | 'hourly' | 'interval' | 'monthly';
  hour: number; // 0-23
  minute: number; // 0-59
  weekdays: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  intervalMinutes: number;
  dayOfMonth: number;
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Validates whether a given string is a valid standard 5-part cron expression.
 */
export function isValidCron(cron: string): boolean {
  if (!cron || typeof cron !== 'string') return false;
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [min, hr, dom, mon, dow] = parts;

  const partRegex = /^(\*|\d+|\*\/\d+|\d+-\d+|\d+(,\d+)+)$/;
  if (![min, hr, dom, mon, dow].every((p) => partRegex.test(p))) return false;

  const validateRange = (val: string, minLimit: number, maxLimit: number): boolean => {
    if (val === '*') return true;
    if (val.startsWith('*/')) {
      const step = parseInt(val.slice(2), 10);
      return !isNaN(step) && step > 0 && step <= maxLimit;
    }
    if (val.includes('-')) {
      const [start, end] = val.split('-').map((v) => parseInt(v, 10));
      return !isNaN(start) && !isNaN(end) && start >= minLimit && end <= maxLimit && start <= end;
    }
    if (val.includes(',')) {
      const nums = val.split(',').map((v) => parseInt(v, 10));
      return nums.every((n) => !isNaN(n) && n >= minLimit && n <= maxLimit);
    }
    const num = parseInt(val, 10);
    return !isNaN(num) && num >= minLimit && num <= maxLimit;
  };

  return (
    validateRange(min, 0, 59) &&
    validateRange(hr, 0, 23) &&
    validateRange(dom, 1, 31) &&
    validateRange(mon, 1, 12) &&
    validateRange(dow, 0, 7) // 0 or 7 is Sunday
  );
}

/**
 * Formats hour and minute into 12-hour AM/PM string, e.g. "9:00 AM".
 */
export function formatTime12h(hour: number, minute: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  const m = minute.toString().padStart(2, '0');
  const ampm = hour < 12 ? 'AM' : 'PM';
  return `${h}:${m} ${ampm}`;
}

/**
 * Translates a 5-part cron expression into human-readable plain English.
 */
export function humanizeCron(cron: string): string {
  if (!cron || !isValidCron(cron)) return 'Invalid schedule expression';

  const parts = cron.trim().split(/\s+/);
  const [min, hr, dom, mon, dow] = parts;

  // Every N minutes
  if (min.startsWith('*/') && hr === '*' && dom === '*' && mon === '*' && dow === '*') {
    const step = min.slice(2);
    return `Every ${step} minute${step === '1' ? '' : 's'}`;
  }

  // Every hour on the minute
  if (min !== '*' && !min.includes('/') && hr === '*' && dom === '*' && mon === '*' && dow === '*') {
    const m = parseInt(min, 10);
    return m === 0 ? 'Every hour, on the hour' : `Every hour at minute ${m}`;
  }

  // Daily at specific time
  if (
    !min.includes('*') &&
    !min.includes('/') &&
    !min.includes(',') &&
    !hr.includes('*') &&
    !hr.includes('/') &&
    !hr.includes(',') &&
    dom === '*' &&
    mon === '*'
  ) {
    const h = parseInt(hr, 10);
    const m = parseInt(min, 10);
    const formatted = formatTime12h(h, m);

    // Weekdays
    if (dow === '1-5') {
      return `Every weekday (Mon–Fri) at ${formatted}`;
    }
    // Weekends
    if (dow === '0,6' || dow === '6,0' || dow === '6-7') {
      return `Every weekend (Sat–Sun) at ${formatted}`;
    }
    // Specific single day of week
    if (/^[0-7]$/.test(dow)) {
      const dayIdx = parseInt(dow, 10) % 7;
      return `Every ${WEEKDAY_NAMES[dayIdx]} at ${formatted}`;
    }
    // All days
    if (dow === '*') {
      return `Every day at ${formatted}`;
    }
  }

  // Monthly on specific day
  if (dom !== '*' && !dom.includes('/') && !dom.includes(',') && mon === '*' && dow === '*') {
    const day = parseInt(dom, 10);
    const h = parseInt(hr, 10) || 0;
    const m = parseInt(min, 10) || 0;
    const suffix =
      day === 1 || day === 21 || day === 31
        ? 'st'
        : day === 2 || day === 22
        ? 'nd'
        : day === 3 || day === 23
        ? 'rd'
        : 'th';
    return `Monthly on the ${day}${suffix} at ${formatTime12h(h, m)}`;
  }

  // General fallback
  return `At ${hr}:${min.padStart(2, '0')}, days: ${dow === '*' ? 'all' : dow}`;
}

/**
 * Calculates the next `count` run dates for a 5-part cron expression.
 */
export function getNextCronRuns(cron: string, count: number = 3, fromDate: Date = new Date()): Date[] {
  if (!isValidCron(cron)) return [];

  const parts = cron.trim().split(/\s+/);
  const [minPart, hrPart, , , dowPart] = parts;

  const results: Date[] = [];
  const current = new Date(fromDate.getTime() + 1000); // Start 1s into the future
  current.setSeconds(0, 0);

  // Maximum search horizon: 60 days
  const maxIterations = 60 * 24 * 60;
  let iterations = 0;

  while (results.length < count && iterations < maxIterations) {
    iterations++;

    const m = current.getMinutes();
    const h = current.getHours();
    const dow = current.getDay();

    const matchMin =
      minPart === '*' ||
      (minPart.startsWith('*/') && m % parseInt(minPart.slice(2), 10) === 0) ||
      minPart.split(',').map((v) => parseInt(v, 10)).includes(m);

    const matchHr =
      hrPart === '*' ||
      (hrPart.startsWith('*/') && h % parseInt(hrPart.slice(2), 10) === 0) ||
      hrPart.split(',').map((v) => parseInt(v, 10)).includes(h);

    const matchDow =
      dowPart === '*' ||
      (dowPart === '1-5' && dow >= 1 && dow <= 5) ||
      (dowPart === '0,6' && (dow === 0 || dow === 6)) ||
      dowPart.split(',').map((v) => parseInt(v, 10) % 7).includes(dow);

    if (matchMin && matchHr && matchDow) {
      results.push(new Date(current.getTime()));
      // Advance by at least 1 minute
      current.setMinutes(current.getMinutes() + 1);
    } else {
      current.setMinutes(current.getMinutes() + 1);
    }
  }

  return results;
}

/**
 * Converts a friendly config object into a valid 5-part cron expression.
 */
export function buildCronFromConfig(cfg: FriendlyScheduleConfig): string {
  switch (cfg.frequency) {
    case 'hourly':
      return `0 * * * *`;
    case 'interval':
      return `*/${Math.max(1, Math.min(59, cfg.intervalMinutes))} * * * *`;
    case 'weekly': {
      const days = cfg.weekdays.length > 0 ? cfg.weekdays.sort().join(',') : '*';
      return `${cfg.minute} ${cfg.hour} * * ${days}`;
    }
    case 'monthly':
      return `${cfg.minute} ${cfg.hour} ${cfg.dayOfMonth} * *`;
    case 'daily':
    default:
      return `${cfg.minute} ${cfg.hour} * * *`;
  }
}

/**
 * Formats a UNIX timestamp (seconds or ms) into human relative time.
 * e.g., "in 2h 15m", "in 45s", "12m ago", "Just now".
 */
export function formatRelativeTime(timestampSecOrMs?: number | null): string {
  if (!timestampSecOrMs) return 'Never';

  // Normalize to ms
  const ms = timestampSecOrMs < 10000000000 ? timestampSecOrMs * 1000 : timestampSecOrMs;
  const now = Date.now();
  const diffSec = Math.round((ms - now) / 1000);

  if (Math.abs(diffSec) < 10) return 'Just now';

  // Future
  if (diffSec > 0) {
    if (diffSec < 60) return `in ${diffSec}s`;
    const min = Math.round(diffSec / 60);
    if (min < 60) return `in ${min}m`;
    const hr = Math.floor(min / 60);
    const remMin = min % 60;
    if (hr < 24) return remMin > 0 ? `in ${hr}h ${remMin}m` : `in ${hr}h`;
    const days = Math.floor(hr / 24);
    return `in ${days}d`;
  }

  // Past
  const pastSec = Math.abs(diffSec);
  if (pastSec < 60) return `${pastSec}s ago`;
  const pastMin = Math.round(pastSec / 60);
  if (pastMin < 60) return `${pastMin}m ago`;
  const pastHr = Math.floor(pastMin / 60);
  if (pastHr < 24) return `${pastHr}h ago`;
  const pastDays = Math.floor(pastHr / 24);
  return `${pastDays}d ago`;
}

/**
 * Translates interval in seconds to friendly text, e.g. "Every 5 minutes".
 */
export function humanizeInterval(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return 'Periodic interval';
  if (seconds < 60) return `Every ${seconds}s`;
  if (seconds === 60) return 'Every minute';
  if (seconds < 3600) {
    const mins = Math.round(seconds / 60);
    return `Every ${mins} minute${mins === 1 ? '' : 's'}`;
  }
  if (seconds === 3600) return 'Every hour';
  const hrs = Math.round(seconds / 3600);
  return `Every ${hrs} hour${hrs === 1 ? '' : 's'}`;
}

/**
 * Produces an accurate human-readable description of any task schedule.
 * Guarantees that scheduled tasks never say "Periodic pulse".
 */
export function humanizeSchedule(task: {
  trigger_type: string;
  schedule?: {
    cron?: string;
    exact_timestamp?: number;
    interval_seconds?: number;
    next_run_at?: number;
  };
  metadata?: Record<string, unknown>;
}): string {
  if (task.trigger_type === 'heartbeat') {
    return humanizeInterval(task.schedule?.interval_seconds || 300);
  }

  if (task.trigger_type === 'event') {
    const eventType = (task.metadata?.event_trigger as string) || (task.metadata?.event_type as string);
    const targetPath = (task.metadata?.target_path as string) || '';
    if (eventType === 'process_crash') return 'On dev server / process crash';
    if (eventType === 'file_change') return targetPath ? `On file change in ${targetPath}` : 'On workspace file modification';
    if (eventType === 'git_commit') return 'On git commit or push';
    if (eventType === 'webhook') return 'On incoming webhook trigger';
    return 'On configured system event';
  }

  // Scheduled task
  if (task.schedule?.cron) {
    return humanizeCron(task.schedule.cron);
  }

  if (task.schedule?.exact_timestamp) {
    const dt = new Date(task.schedule.exact_timestamp * 1000);
    return `Once on ${dt.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${formatTime12h(
      dt.getHours(),
      dt.getMinutes()
    )}`;
  }

  return 'Manual trigger only';
}
