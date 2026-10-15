# Datum

Construction scheduling for people who still think in predecessors, lags, and the date the owner actually promised.

Datum is a local app: a small server on your machine and a browser UI. It schedules with the critical path method, opens the files superintendents already have, and keeps the decision log and the buyout board on the same job.

Version 0.2.1. Licensed under the [GNU Affero General Public License v3.0](LICENSE).

## What it does

- Critical path with FS, SS, FF, and SF links, lags and leads, constraints, total slack, and free slack.
- One baseline. A project calendar with weekends off and holidays you can name.
- Views: Gantt (drag to move, resize, and link), task sheet, 3-week look-ahead, milestones, a pulse dashboard, a decisions kanban, and a subcontractor buyout pipeline.
- Import `.mpp` and other MPXJ formats (needs Java), MS Project XML, and Primavera `.xer`.
- Export MS Project XML, which Project opens with File → Open. Nothing outside Project can write a real `.mpp`.
- Print and PDF for the Gantt, task sheet, look-ahead, and milestone report.
- Optional plain-English schedule edits, off until you point Datum at a model.
- Themes: Dark (default), Light, and Hue, with a steel, amber, or green accent. Glow on milestone dots can be turned off.

The sample job, **Cedar Ridge Elementary**, is fictional. Open it from the home screen with **School addition template**.

## Install

You need Node.js 22 or newer. Java is only required for `.mpp` and the other binary formats.

```bash
git clone <this-repo> datum
cd datum
npm install
npm test
npm run build
bin/datum
```

`bin/datum` starts the API on `127.0.0.1:4517` if it is not already running, then opens the app. Pass a file if you want it opened immediately:

```bash
bin/datum ~/Documents/Datum/cedar-ridge.xml
```

The same launcher works on Linux and macOS. It prefers a Chrome or Chromium app window and falls back to the default browser. Set `DATUM_BROWSER` to force a binary. There is no desktop-environment-specific launcher.

Data (recent files, print jobs, the server log) lives in `~/.local/share/datum`. Override it with `DATUM_DATA_DIR`. Override the port with `DATUM_PORT`.

### Develop

```bash
npm run dev:server   # API on 127.0.0.1:4517
npm run dev          # UI on 127.0.0.1:4731, proxies /api
```

`npm run build` writes `dist/` (UI) and `dist-server/` (API). `npm start` runs the built server, which also serves the built UI. `npm test` runs the scheduler, horizon, and facts-plugin tests. `npm run typecheck` is `tsc --noEmit`.

After a rebuild, `bin/datum-restart` stops whatever is listening on the API port and starts the new server. It uses `lsof` when that exists, and `ss` or `fuser` otherwise.

## Themes

Open **Theme** on the home screen or in the top bar, or open Project settings.

- **Dark** is the default. Charcoal glass over a faint site grid.
- **Light** is the trailer at noon: paper, concrete, and higher contrast.
- **Hue** washes the glass with the accent you pick: steel blue, amber, or green.

Milestone dots glow. In-progress pulses about every two seconds. At risk (overdue, or critical and due within a week) pulses about every second. Turn **Glow and motion** off to stop the pulses and the short view transitions. Datum also respects the system reduced-motion setting.

Appearance is stored in this browser. It is not written into the schedule file.

## Decisions, buyout, and the next 30 days

With a schedule open:

- The strip under the toolbar lists milestones in the next 30 days and anything overdue (milestones and open decisions). It follows the project status date.
- **Pulse** (Ctrl+5) is the same picture, larger, plus critical-task count and the buyout gap.
- **Decisions** (Ctrl+6) is a kanban: Pending Decision → Info Provided → Owner Review → Decided → Implemented. Drag cards. Open decisions are anything not Decided or Implemented. A due date before today, on an open card, is overdue.
- **Buyout** (Ctrl+7) is the package pipeline: Scope Defined → Bidding → Leveling → Awarded → Contract Executed → Mobilized. Concept and proposal dollars roll up against a target you type in. Awarded dollars are proposals (or concept, if no proposal yet) in Awarded, Contract Executed, and Mobilized.

These boards travel with a `.datum` or `.json` save. MS Project XML carries the schedule, not the boards.

## Microsoft Project files and Java

Reading `.mpp` uses [MPXJ](https://www.mpxj.org/) (LGPL-2.1) through a local Java process:

```text
java -cp vendor/mpxj/* org.mpxj.sample.MpxjConvert
```

The jars are not in git. Fetch the versions listed in `vendor/mpxj/JARS.txt`:

```bash
npm run fetch:mpxj
java -version
```

That script downloads MPXJ **16.6.0** (saved as `vendor/mpxj/mpxj.jar`) plus the dependency jars named in `JARS.txt`, including Jackson 2.22.1, Apache POI 5.5.1, jsoup 1.22.2, and sqlite-jdbc 3.51.2.0. See `scripts/fetch-mpxj.sh`. A short license note is written beside the jars when the download finishes.

Without Java, or without the jars, Datum still opens and writes MS Project XML (`.xml`), Datum JSON (`.datum`), and still schedules, prints, and runs the boards. `.xer` import needs the same Java setup.

Datum writes Project XML only. Save As `.xml` when the file has to go back to Microsoft Project.

## Optional AI

Plain-English build, review, and edit are off until you configure a provider. Datum does not call any host by default. The home screen says **Set up AI** until a provider is ready, then names that provider.

Keys stay in the data directory on this computer (`ai-config.json`, mode 0600). Datum sends a key only to the provider you picked, and only while running a request. Nothing is written into the schedule file or the git repo.

### After install

Open **AI** on the home screen (or **AI provider** in Project settings), pick a provider, paste a key, pick a model, and **Save**. The home-screen status flips to ready without a restart. **Test connection** sends a tiny ping and does not change the schedule. **Clear** turns the active provider off and leaves saved keys on disk until you **Forget key**.

1. **Anthropic** — create a key in the [Claude Console](https://platform.claude.com/settings/keys). Datum calls the Messages API at `https://api.anthropic.com` with the `x-api-key` and `anthropic-version` headers. The default model is `claude-sonnet-5-5`. `claude-opus-5-5` and `claude-haiku-5-5` are in the list. Any other model id can be typed in.
2. **Grok (xAI)** — create a key at [console.x.ai](https://console.x.ai). Datum uses the OpenAI-compatible chat completions endpoint at `https://api.x.ai/v1`. The default model is `grok-4.7` (the current public default). `grok-4.6` and `grok-4.5` are listed, and a custom model id is allowed.
3. **DeepSeek** — create a key at [platform.deepseek.com](https://platform.deepseek.com/api_keys). Datum posts to `https://api.deepseek.com/chat/completions` (`https://api.deepseek.com/v1` is also accepted). The default model is `deepseek-flash`. `deepseek-v4-pro`, `deepseek-chat`, and `deepseek-reasoner` are selectable, and a custom model id is allowed.
4. **Off** — clears the active provider. AI stays optional.
5. **Custom** — any OpenAI-compatible base URL, the same shape as `DATUM_AI_BASE_URL`. The key is optional.

### Environment variables

Environment variables override the saved file. Set them before starting the server. A restart is required for env changes. Saving a provider in the panel does not require a restart.

```bash
export DATUM_AI_BASE_URL="https://your-endpoint.example/v1"   # wins over the file
export DATUM_AI_API_KEY="secret"          # optional bearer; also overrides a saved key
export DATUM_AI_MODEL="your-model-name"   # also overrides a saved model
```

Datum posts to `{DATUM_AI_BASE_URL}/chat/completions` and expects a JSON object back.

**Local command** (used when `DATUM_AI_BASE_URL` is unset; also wins over the file):

```bash
export DATUM_AI_COMMAND="/usr/local/bin/your-scheduler-model"
export DATUM_AI_ARGS=""                    # optional
```

The program reads one JSON object on stdin (`prompt`, `rules`, `schema`, `model`, `effort`) and writes either one JSON result, or newline-delimited events (`status`, `thought`, `text`, `result`, `error`), to stdout.

Precedence is `DATUM_AI_BASE_URL`, then `DATUM_AI_COMMAND`, then `ai-config.json`. If only `DATUM_AI_API_KEY` or `DATUM_AI_MODEL` is set, that value replaces the saved key or model and the saved provider is still used.

If a request fails, the dialog says so and the schedule is left unchanged until you apply a preview. API responses that echo the saved settings mask the key.

### Optional facts source

Some edit instructions ask to verify a live date. Datum will only call out for facts when `DATUM_FACTS_URL` is set. That URL receives `POST { "projectName", "instruction" }` and should return:

```json
{ "ok": true, "items": [{ "date": "2026-10-02", "summary": "Permit comments returned", "source": "meeting minutes" }] }
```

`DATUM_FACTS_TOKEN` is sent as a bearer token when set. With no URL, Datum tells the model not to invent dates and edits from the schedule and the instruction only. This plugin is off by default.

## Layout

- `src/engine/` — calendar, CPM, predecessor text, MPXJ import, Project XML export, health checks, look-ahead, boards and the 30-day horizon. Shared by the UI and the server.
- `src/components/` — UI. `src/print/` — print layouts. `src/state/store.ts` — project state, undo, and autosave.
- `server/` — Express API: files, open/save, PDF (headless Chromium via `playwright-core`), optional AI.
- `server/plugins/facts.ts` — optional facts source, off unless configured.
- `bin/datum` — launcher. `scripts/fetch-mpxj.sh` — jar download.
- `vendor/mpxj/JARS.txt` — jar names and the sizes they were checked against.

## License

Datum is free software under the AGPL-3.0. If you run a modified version as a network service, the AGPL requires you to offer the corresponding source to its users. See [LICENSE](LICENSE) and [CONTRIBUTING.md](CONTRIBUTING.md).
