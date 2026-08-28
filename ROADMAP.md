# Effectprint roadmap

Effectprint develops around one promise: produce deterministic, reviewable evidence about what an audited WebMCP tool invocation attempted to change. Priorities may move as the WebMCP proposal and real-world usage evolve.

## Now: harden the 0.2 line

- Test against representative open-source WebMCP applications and publish reproducible, sanitized examples.
- Reduce false positives while keeping safe mode fail-closed.
- Publish a provenance-backed npm package and streamline first-run setup.
- Expand the harmless poisoned-fixture corpus for storage, navigation, popup, cookie, and network behavior.

## Next: make regression testing easier

- Add framework-oriented quickstarts and complete CI examples.
- Improve comparison of stable effect fingerprints across pull requests.
- Broaden effect capture where browser APIs can be observed reliably.
- Make reports easier to review in code scanning, test dashboards, and pull requests.

## Later: follow the platform carefully

- Evaluate declarative WebMCP execution after that part of the proposal stabilizes.
- Explore deterministic input matrices beyond a single synthesized invocation.
- Add integrations requested by maintainers of real WebMCP applications.

## Non-goals

Effectprint is not a W3C certification suite, a containment boundary for hostile pages, or a model tool-selection evaluator. A passing result applies only to the captured invocation and input.

## Shape the roadmap

Open a focused [feature proposal](https://github.com/TommyTranX/effectprint/issues/new?template=feature.yml) describing the missing behavior, a harmless example, and false-positive or safety considerations. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before implementing new effect categories or changing contract semantics.
