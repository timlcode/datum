# Contributing to Datum

Datum is licensed under the GNU Affero General Public License v3.0. By contributing, you agree that your work is licensed the same way. See [LICENSE](LICENSE).

## Setup

```bash
npm install
npm test
npm run dev:server
npm run dev
```

The UI is at `http://127.0.0.1:4731`. The API is at `http://127.0.0.1:4517`.

Java and the MPXJ jars are optional. `npm run fetch:mpxj` downloads them when you want to work on `.mpp` or `.xer` import. Do not commit the jars.

## Tests

`npm test` covers the calendar, the critical path (including FS, SS, FF, and SF), predecessor text, the horizon and buyout math, and the facts plugin. Add a test when you change scheduling behavior. `npm run typecheck` should stay clean.

Browser checks under `scripts/` talk to a running server with `playwright-core` and a system Chromium. They are not part of `npm test`.

## Project shape

Keep scheduling rules in `src/engine/`. The UI and the server both import that code. Do not fork a second scheduler.

Boards (decisions, buyout) and the next-30-days strip live in `src/engine/boards.ts` so the definitions of "overdue" and "awarded" stay in one place.

Appearance (theme, accent, motion) is a browser preference. Do not store it on the project.

## Optional integrations

AI and the facts source are off unless environment variables say otherwise. Do not add a default host, a default model binary, or a default network call. If you add a provider, document the variables in the README and keep the unconfigured path working.

## What not to commit

- Personal paths, hostnames, email addresses, or real project names. Sample data stays fictional.
- `vendor/mpxj/*.jar` and anything under `uploads/`.
- Secrets. `.env` is ignored.

## Commit style

Write commit messages about the change a scheduler would notice. Mention the view, the link type, or the bug. Keep them free of personal names and machine names.
