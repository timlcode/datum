# Changelog

## 0.2.0

First public release of Datum as a standalone local app.

- Critical path scheduling kept: FS, SS, FF, SF, lags, constraints, slack, one baseline, and a project calendar with holidays.
- Gantt, task sheet, 3-week look-ahead, and milestones, plus a pulse view, a decisions kanban, and a subcontractor buyout pipeline.
- A next-30-days and overdue strip on every open schedule.
- Dark, Light, and Hue themes, with steel, amber, and green accents. Frosted panels. Milestone dots glow, and motion can be turned off.
- Import via MPXJ (Java, jars fetched rather than vendored), MS Project XML, and Primavera XER. Export Project XML and PDF.
- Plain-English AI edits are optional. Configure an OpenAI-compatible endpoint or a local command. Nothing is called until you do.
- Optional facts source for live-date checks, off unless `DATUM_FACTS_URL` is set.
- Portable `bin/datum` launcher for Linux and macOS.
- Sample schedule is the fictional Cedar Ridge Elementary classroom addition.
- Tests cover the critical path, link types, the horizon, buyout totals, and the facts plugin.

## 0.1.2

Earlier private snapshot this release was built from. Not part of the public history.
