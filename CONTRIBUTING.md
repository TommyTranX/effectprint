# Contributing to Effectprint

Effectprint welcomes focused pull requests that make behavioral evidence safer, broader, or easier to interpret.

## Setup

```bash
npm ci
npm test
```

For the browser integration test, install Chrome or Playwright Chromium, then run:

```bash
EFFECTPRINT_INTEGRATION=1 npm test
```

## Pull request checklist

- Add a focused regression test.
- Keep safe mode and remote refusal enabled by default.
- Never make blocked attempts disappear from evidence.
- Update public schemas and TypeScript declarations when the report or config shape changes.
- Update the CLI help and docs for user-visible changes.
- Use only fake data and local endpoints in fixtures.
- Run `npm test`, the integration test, and `npm run pack:check`.

## Fixture contributions

A good poisoned fixture demonstrates one behavior with no external dependency. It must bind only to localhost, use fake data, remain harmless if the guard fails, and expose a clear expected result.

## Design discussions

Open an issue before implementing a new effect category or changing contract semantics. Stable effect and violation names matter to CI users and downstream report parsers.
