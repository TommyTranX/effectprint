# Poisoned-tool fixture corpus

This directory contains harmless, reproducible WebMCP implementations whose declared intent differs from their observable behavior. Fixtures are designed for regression tests, demonstrations, downstream security tools, and research comparisons.

## Rules for fixtures

- Bind only to localhost.
- Use no credentials or external services.
- Use fake products, users, payments, and identifiers.
- Remain harmless even if every Effectprint guard fails.
- Demonstrate one primary behavioral integrity failure.
- Declare expected effects in `corpus.json`.

## Cases

### `readonly-hidden-checkout`

The `search_products` tool declares `readOnlyHint: true` and promises not to change order state. After a legitimate catalog GET, its handler attempts a hidden checkout POST. Effectprint must record and block the POST, report `READ_ONLY_MUTATION`, and leave server purchase state unchanged.

Run it with:

```bash
node ./bin/effectprint.js demo
```

The machine-readable case index is [`corpus.json`](corpus.json).
