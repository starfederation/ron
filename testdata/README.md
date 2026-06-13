# RON Test Data

## Layout

```text
conformance/  Language-neutral fixture corpus.
```

## Manifest

`conformance/manifest.json` is the source of truth for test runners. All paths in the manifest are relative to `testdata/conformance/`.

Top-level fields:

- `version`: corpus version.
- `formatting`: reference formatting knobs, expected formatter options, canonical RON definition, and hash algorithm.
- `valid`: valid conversion cases, including each case's `expectedCanonicalRONXXH3`.
- `invalidRON`: RON files that must fail RON parsing.
- `invalidJSON`: JSON files that must fail JSON parsing or JSON -> RON conversion.

## Valid Case Layout

Valid cases live under:

```text
conformance/valid/<group>/<case>/
```

Each case is a set of different textual views of one JSON value:

- `input.ron`: primary RON input.
- `input_*.ron`: alternate valid RON inputs for the same JSON value.
- `input.json`: JSON input for JSON -> RON.
- `expected.compact.json`: compact JSON output for RON -> JSON.
- `expected.pretty.json`: pretty JSON output for RON -> JSON.
- `expected.compact.ron`: compact canonical RON output for JSON -> RON and canonical RON hash input.
- `expected.pretty.ron`: pretty canonical RON output for JSON -> RON.
- `expectedCanonicalRONXXH3`: unseeded XXH3-64 of `expected.compact.ron`, encoded as 16 lowercase hexadecimal digits in the manifest.

A language implementation should generate its own actual outputs in memory or in its own temporary/build directory. Do not write generated outputs back into this corpus during normal test runs.

## Valid Case Data Flow

For each entry in `valid`, use this flow.

```text
ronInputs[]
  -> parse RON
  -> JSON value model
  -> emit compact JSON
  -> exact compare with expectedCompactJSON

ronInputs[]
  -> parse RON
  -> JSON value model
  -> emit pretty JSON
  -> exact compare with expectedPrettyJSON

jsonInput
  -> parse JSON
  -> JSON value model
  -> emit compact canonical RON
  -> exact compare with expectedCompactRON
  -> hash with unseeded XXH3-64
  -> exact compare lowercase hex with expectedCanonicalRONXXH3

jsonInput
  -> parse JSON
  -> JSON value model
  -> emit pretty RON
  -> exact compare with expectedPrettyRON
```

Then run semantic round-trip checks:

```text
generated JSON
  -> parse JSON
  -> compare value with input.json value

generated RON
  -> parse RON
  -> JSON value model
  -> compare value with input.json value
```

The exact-text checks prove formatter compatibility. The manifest hash checks prove canonical byte stability. The semantic checks prove value compatibility.

## Exact Comparison Rules

Exact means byte-for-byte against the fixture file using LF line endings.

- Pretty JSON and pretty RON use `formatting.expectedPrettyOptions`: `isPretty=true`, `isCanonical=true`.
- Compact JSON and compact RON use `formatting.expectedCompactOptions`: `isPretty=false`, `isCanonical=true`.
- Pretty JSON uses `formatting.jsonPrefix` and `formatting.jsonIndent` from the manifest.
- Pretty RON uses `formatting.ronIndent` from the manifest.
- Pretty RON files include the trailing newline when `formatting.prettyRONTrailingNewline` is true.
- Object keys are emitted in canonical order described by `formatting.objectKeyOrder`.
- Compact JSON emits no insignificant whitespace.
- Compact RON emits no newlines and may elide root object braces.
- Canonical RON is compact RON with canonical ordering, equivalent to `isPretty=false` and `isCanonical=true`.
- Canonical hashes use unseeded XXH3-64 over exact compact canonical RON bytes.

Formatters may also expose non-canonical given-order output with `isCanonical=false`. Given-order output is intentionally not part of this shared fixture corpus because it depends on source text order.

If an implementation does not support one output mode yet, mark that mode unsupported in that implementation's own test suite. Do not change these fixtures to match a partial implementation.

## Invalid Case Flow

Invalid cases live under:

```text
conformance/invalid/ron/
conformance/invalid/json/
```

For every `invalidRON` manifest path:

```text
invalid RON file
  -> parse RON
  -> must return an error
```

For every `invalidJSON` manifest path:

```text
invalid JSON file
  -> parse JSON or convert JSON -> RON
  -> must return an error
```

Do not assert exact error strings across languages. Error text is implementation-specific. Assert only that the operation fails.

## Adding or Regenerating Cases

Normal language implementations should consume these fixtures, not regenerate them.

When the reference format changes or a new edge case is added:

1. Add or edit the input fixture files.
2. Generate all expected files from the accepted reference behavior, not from an implementation under test.
3. Update `conformance/manifest.json` so every new file is reachable and every valid case has `expectedCanonicalRONXXH3`.
4. Verify each manifest hash matches unseeded XXH3-64 of the expected compact canonical RON bytes.
5. Verify each valid case still represents one JSON value across all RON and JSON files.
6. Verify invalid cases still fail for the intended reason.

A new valid case is complete only when it has all four expected outputs: compact JSON, pretty JSON, compact canonical RON, pretty canonical RON, and a canonical XXH3 hash.
