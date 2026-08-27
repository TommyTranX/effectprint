# Behavioral contract reference

Effectprint contracts describe inputs and observable effects for one WebMCP tool. They do not replace the tool's JSON Schema. They add assertions about what the implementation may and must change when invoked.

## Configuration shape

```json
{
  "$schema": "https://raw.githubusercontent.com/TommyTranX/effectprint/main/schemas/config.schema.json",
  "version": 1,
  "url": "http://127.0.0.1:3000",
  "tools": {
    "search_products": {
      "input": { "query": "shoes" },
      "allow": [{ "kind": "dom" }],
      "forbid": [{ "kind": "network", "mutating": true }],
      "require": [{ "kind": "network", "method": "GET", "url": "*/api/products*" }],
      "strictEffects": false
    }
  }
}
```

The shape is defined by [`schemas/config.schema.json`](../schemas/config.schema.json). JavaScript configs use the same object shape, but are loaded only when explicitly passed because importing them executes code.

## Tool fields

| Field | Type | Meaning |
| --- | --- | --- |
| `input` | any JSON value | Exact deterministic tool input. If absent, Effectprint synthesizes input from the tool schema. |
| `execute` | boolean | Required as `true` before Effectprint runs a tool that is not explicitly read-only. |
| `skip` | boolean | Skip this tool even if it is read-only. |
| `allow` | matcher[] | Effects considered declared when `strictEffects` is enabled. |
| `forbid` | matcher[] | Every matching observed effect is a violation. |
| `require` | matcher[] | Each matcher must match at least one observed effect. |
| `strictEffects` | boolean | Treat every effect not matched by `allow` or `require` as undeclared. |

An `allow` matcher does not override `readOnlyHint`. A tool marked read-only fails if it attempts a persistent mutation, even when a matching effect is listed under `allow`.

## Effect matchers

Object matchers compare only the fields they contain. String fields support `*` and `?` globs.

```js
{ kind: "network", method: "GET", url: "*/api/products*" }
{ kind: "network", mutating: true }
{ kind: "dom", target: "#results" }
{ kind: "storage", operation: "localStorage.*" }
```

Compact string matchers compare `kind:operation:target`:

```js
"network:POST:*/checkout"
"storage:*:*"
```

Supported matcher fields are `kind`, `operation`, `method`, `target`, `url`, `mutating`, `blocked`, `crossOrigin`, and `source`. Boolean matchers require the field to be present; `{ "blocked": false }` does not match an effect with no `blocked` field.

Blocked attempts count as observed effects. To require a request that was allowed past the guard, include `"blocked": false`. This still establishes only what the browser observed, not that a remote system committed the operation.

## Effect kinds

| Kind | Common operations | Persistent mutation |
| --- | --- | --- |
| `network` | `GET`, `POST`, `PUT`, `PATCH`, `DELETE` | POST, PUT, PATCH, DELETE |
| `storage` | `localStorage.setItem`, `indexedDB.put`, `cache.put` | Yes |
| `cookie` | `cookie.set` | Yes |
| `form` | `form.submit`, `form.requestSubmit` | Yes |
| `navigation` | `page.navigate`, `history.pushState`, `window.open` | Yes |
| `dom` | `dom.mutate` | No by default |
| `clipboard` | `clipboard.write`, `clipboard.writeText` | Yes |
| `download` | `anchor.download` | Yes |

Effectprint treats network mutation, cookie, form, navigation, and storage effects as incompatible with `readOnlyHint: true`. DOM updates are allowed because many search and preview tools update the shared human interface.

## Stable violation codes

<a id="read-only-mutation"></a>
### `READ_ONLY_MUTATION`

`READ_ONLY_MUTATION` means a tool declared `annotations.readOnlyHint: true` but attempted a persistent mutation. Blocked attempts still count because the contract concerns implementation behavior.

<a id="forbidden-effect"></a>
### `FORBIDDEN_EFFECT`

`FORBIDDEN_EFFECT` means an observed effect matched a contract entry under `forbid`.

<a id="missing-effect"></a>
### `MISSING_EFFECT`

`MISSING_EFFECT` means no observed effect matched a contract entry under `require`.

<a id="undeclared-effect"></a>
### `UNDECLARED_EFFECT`

`UNDECLARED_EFFECT` means `strictEffects: true` was enabled and an observed effect matched neither `allow` nor `require`.

<a id="execution-failed"></a>
### `EXECUTION_FAILED`

`EXECUTION_FAILED` means the page's execute handler threw, rejected, navigated away, or otherwise failed to return normally.

<a id="execution-timeout"></a>
### `EXECUTION_TIMEOUT`

`EXECUTION_TIMEOUT` means the handler exceeded its deadline. A Node-side watchdog closes the disposable context even when synchronous page code prevents browser timers from firing.

<a id="input-synthesis-failed"></a>
### `INPUT_SYNTHESIS_FAILED`

`INPUT_SYNTHESIS_FAILED` means no deterministic input could be derived from the supplied JSON Schema subset. Add an explicit `input` to the contract.

<a id="effect-capture-truncated"></a>
### `EFFECT_CAPTURE_TRUNCATED`

`EFFECT_CAPTURE_TRUNCATED` means an effect quota was reached. The invocation fails because omitted evidence could hide a contract violation.

<a id="tool-not-found"></a>
### `TOOL_NOT_FOUND`

`TOOL_NOT_FOUND` is an audit diagnostic emitted when a configured or CLI-selected tool was not registered.

<a id="tool-not-audited"></a>
### `TOOL_NOT_AUDITED`

`TOOL_NOT_AUDITED` is an audit diagnostic emitted when an unannotated or write-capable tool was skipped without an explicit `skip: true`. This prevents a passing badge from hiding newly registered, unaudited tools.

<a id="no-tools-audited"></a>
### `NO_TOOLS_AUDITED`

`NO_TOOLS_AUDITED` is an audit diagnostic emitted when discovery found no imperative tool eligible for execution. Diagnostics appear as failures in JUnit and SARIF as well as the human reports.

## Input synthesis

Effectprint chooses values in this order: `examples[0]`, `example`, `default`, `const`, `enum[0]`, a format-aware safe example, then a deterministic type fallback. It includes required object properties and optional properties that provide a seed value.

Supported shapes include objects, arrays, strings, numbers, integers, booleans, null, `oneOf`, `anyOf`, and mergeable object `allOf`. Recursive references and arbitrary external `$ref` resolution are intentionally excluded from synthesis. Use explicit contract input for those schemas.
