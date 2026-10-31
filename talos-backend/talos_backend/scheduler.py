"""Persistent scheduler for cron expressions, one-shot times, and intervals."""
import asyncio
import datetime as dt
import time
from typing import Callable
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .storage import Store


def validate_timezone(timezone_name: str) -> None:
    if not timezone_name or timezone_name != timezone_name.strip():
        raise ValueError("Timezone must be 'local' or a valid IANA timezone")
    if timezone_name == "local":
        return
    try:
        ZoneInfo(timezone_name)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise ValueError(f"Unknown IANA timezone: {timezone_name}") from exc


def _field_values(expression: str, minimum: int, maximum: int, *, sunday: bool = False) -> set[int]:
    values: set[int] = set()
    for part in expression.split(","):
        if not part:
            raise ValueError("Empty cron field item")
        base, slash, step_text = part.partition("/")
        step = int(step_text) if slash else 1
        if step < 1:
            raise ValueError("Cron step must be positive")
        if base == "*":
            start, end = minimum, maximum
        elif "-" in base:
            start_text, end_text = base.split("-", 1)
            start, end = int(start_text), int(end_text)
        else:
            start = int(base)
            end = maximum if slash else start
        field_maximum = 7 if sunday else maximum
        if start < minimum or start > field_maximum or end < start or end > field_maximum:
            raise ValueError(f"Cron value must be between {minimum} and {field_maximum}")
        values.update(range(start, end + 1, step))
    if sunday and 7 in values:
        values.discard(7)
        values.add(0)
    return values


def validate_schedule(expression: str) -> None:
    fields = expression.split()
    if len(fields) != 5:
        raise ValueError("Cron schedule must have five fields")
    _field_values(fields[0], 0, 59)
    _field_values(fields[1], 0, 23)
    _field_values(fields[2], 1, 31)
    _field_values(fields[3], 1, 12)
    _field_values(fields[4], 0, 6, sunday=True)


def parse_run_at(value: str) -> float:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("One-shot schedule requires an ISO-8601 runAt timestamp")
    try:
        timestamp = dt.datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("runAt must be a valid ISO-8601 timestamp") from exc
    if timestamp.tzinfo is None or timestamp.utcoffset() is None:
        raise ValueError("runAt must include a UTC offset or Z")
    return timestamp.timestamp()


def validate_interval(interval_seconds: int) -> None:
    if isinstance(interval_seconds, bool) or not isinstance(interval_seconds, int) or not 1 <= interval_seconds <= 31_536_000:
        raise ValueError("intervalSeconds must be an integer between 1 and 31536000")


def matches(expression: str, moment: dt.datetime, timezone_name: str | None = None) -> bool:
    try:
        validate_schedule(expression)
        if timezone_name:
            validate_timezone(timezone_name)
            moment = moment.astimezone() if timezone_name == "local" else moment.astimezone(ZoneInfo(timezone_name))
        minute, hour, day, month, weekday = expression.split()
        minute_ok = moment.minute in _field_values(minute, 0, 59)
        hour_ok = moment.hour in _field_values(hour, 0, 23)
        day_set = _field_values(day, 1, 31)
        weekday_set = _field_values(weekday, 0, 6, sunday=True)
        day_ok = moment.day in day_set
        weekday_ok = (moment.weekday() + 1) % 7 in weekday_set
        month_ok = moment.month in _field_values(month, 1, 12)
        day_of_month_restricted = day != "*"
        day_of_week_restricted = weekday != "*"
        calendar_ok = day_ok or weekday_ok if day_of_month_restricted and day_of_week_restricted else day_ok and weekday_ok
        return minute_ok and hour_ok and month_ok and calendar_ok
    except (ValueError, TypeError):
        return False


class CronScheduler:
    def __init__(self, store: Store, run_job: Callable[[dict], object]):
        self.store = store
        self.run_job = run_job
        self.task: asyncio.Task | None = None
        self.last_minute: str | None = None

    async def start(self) -> None:
        if self.task is None or self.task.done():
            self.task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        if self.task and not self.task.done():
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
            self.task = None

    async def _loop(self) -> None:
        while True:
            await self.tick(dt.datetime.now(dt.timezone.utc))
            await asyncio.sleep(1)

    async def tick(self, now: dt.datetime) -> None:
        if now.tzinfo is None or now.utcoffset() is None:
            raise ValueError("Scheduler tick time must be timezone-aware")
        now = now.astimezone(dt.timezone.utc)
        stamp = now.replace(second=0, microsecond=0).isoformat()
        cron_minute_changed = stamp != self.last_minute
        if cron_minute_changed:
            self.last_minute = stamp

        for job in self.store.list_cron():
            if not job["enabled"]:
                continue
            kind = job.get("schedule_kind", "cron")
            due = False
            if kind == "cron" and cron_minute_changed:
                due = matches(job["schedule"], now, job.get("timezone", "local"))
            elif kind == "at":
                due = job.get("run_at") is not None and float(job["run_at"]) <= now.timestamp()
            elif kind == "every":
                due = job.get("next_run_at") is not None and float(job["next_run_at"]) <= now.timestamp()
            if due and self.store.claim_cron_job(job["id"], kind, now.timestamp()):
                await self.run_job(job)


class HeartbeatScheduler:
    def __init__(self, store: Store, run_heartbeat: Callable[[], object]):
        self.store = store
        self.run_heartbeat = run_heartbeat
        self.task: asyncio.Task | None = None

    async def start(self) -> None:
        if self.task is None or self.task.done():
            self.task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        if self.task and not self.task.done():
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
            self.task = None

    async def _loop(self) -> None:
        while True:
            with self.store._connect() as db:
                row = db.execute("SELECT enabled,last_run,interval_seconds FROM heartbeat_state WHERE id=1").fetchone()
            if row and row["enabled"] and (not row["last_run"] or time.time() - row["last_run"] >= row["interval_seconds"]):
                result = self.run_heartbeat()
                if hasattr(result, "__await__"):
                    await result
            await asyncio.sleep(30)
