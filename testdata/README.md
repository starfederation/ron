# RON Test Data

## Layout

```text
conformance/  Language-neutral fixture corpus.
```

## Manifest

`conformance/manifest.json` is the source of truth for test runners. All paths in the manifest are relative to `testdata/conformance/`.

Top-level fields:

- `version`: corpus version.
- `formatting`: reference formatting knobs for pretty JSON and pretty RON.
- `valid`: valid conversion cases.
- `invalidRON`: RON files that must fail RON parsing.
- `invalidJSON`: JSON files that must fail JSON parsing or JSON -> RON conversion.

## Valid Case Layout

Valid cases live under:

```text
conformance/valid/<group>/<case>/
```

Each case is a set of different textual views of one JSON value:

- `input.ron`: canonical RON input.
- `input_*.ron`: alternate valid RON inputs for the same JSON value.
- `input.json`: JSON input for JSON -> RON.
- `expected.compact.json`: compact JSON output for RON -> JSON.
- `expected.pretty.json`: pretty JSON output for RON -> JSON.
- `expected.compact.ron`: compact RON output for JSON -> RON.
- `expected.pretty.ron`: pretty RON output for JSON -> RON.

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
  -> emit compact RON
  -> exact compare with expectedCompactRON

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

The exact-text checks prove formatter compatibility. The semantic checks prove value compatibility.

## Exact Comparison Rules

Exact means byte-for-byte against the fixture file using LF line endings.

- Pretty JSON uses `formatting.jsonPrefix` and `formatting.jsonIndent` from the manifest.
- Pretty RON uses `formatting.ronIndent` from the manifest.
- Pretty RON files include the trailing newline when `formatting.prettyRONTrailingNewline` is true.
- Object keys are emitted in `formatting.objectKeyOrder`.
- Compact JSON emits no insignificant whitespace.
- Compact RON emits no newlines and may elide root object braces.

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
3. Update `conformance/manifest.json` so every new file is reachable.
4. Verify each valid case still represents one JSON value across all RON and JSON files.
5. Verify invalid cases still fail for the intended reason.

A new valid case is complete only when it has all four expected outputs: compact JSON, pretty JSON, compact RON, and pretty RON.
