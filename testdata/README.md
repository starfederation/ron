# RON Test Data

## Layout

```text
conformance/  Language-neutral RON fixture corpus.
rfc8785/      RFC 8785 canonical JSON fixture corpus.
vocabularies/ Typed vocabulary fixture corpus.
```

## Manifest

`conformance/manifest.json` is the source of truth for test runners. All paths in the manifest are relative to `testdata/conformance/`.

Top-level fields:

- `version`: corpus version.
- `formatting`: reference formatting knobs, expected formatter options, canonical RON definition, and hash algorithm.
- `valid`: valid conversion cases, including each case's `expectedCanonicalRONXXH3`.
- `invalidRON`: RON files that must fail RON parsing.
- `invalidJSON`: JSON files that must fail JSON parsing or JSON -> RON conversion.
- `jsonToRONRendering`: JSON -> RON rendering cases, including root object elision and typed value hooks.

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
- `expectedCanonicalRONXXH3`: unseeded XXH3-128 of `expected.compact.ron`, encoded as 32 lowercase hexadecimal digits in the manifest.

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
  -> hash with unseeded XXH3-128
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
- Canonical hashes use unseeded XXH3-128 over exact compact canonical RON bytes.

Formatters may also expose non-canonical given-order output with `isCanonical=false`. Given-order output is intentionally not part of this shared fixture corpus because it depends on source text order.

If an implementation does not support one output mode yet, mark that mode unsupported in that implementation's own test suite. Do not change these fixtures to match a partial implementation.

## JSON-to-RON Rendering Option Cases

The `jsonToRONRendering` manifest entries are option-specific JSON -> RON cases. Each entry includes:

- `jsonInput`: JSON source file.
- `options`: rendering options such as `isPretty` and `isCanonical`.
- `typedValueHooks`: optional path replacement rules for typed rendering.
- `expectedRON`: exact RON output.

Use this flow:

```text
jsonInput
  -> parse JSON
  -> apply typedValueHooks when present
  -> render RON with options
  -> exact compare with expectedRON
  -> parse generated RON back to JSON
  -> compare with transformed value when hooks are present, otherwise input value
```

Pretty JSON-to-RON rendering of a root object emits root members at indentation level 0 with the normal pretty RON trailing newline. Empty root objects render as `{}` because there are no members to elide.

A typed value hook is a rendering transform, not new syntax. Path elements are object keys or zero-based array indexes. `replaceWith` is the JSON value to render at that path. For example, replacing `"BE"` at path `["tx"]` with `{ "#": "BE" }` renders as `tx {# BE}`.

## RFC 8785 Canonical JSON Fixtures

`rfc8785/manifest.json` is the source of truth for RFC 8785 JSON Canonicalization Scheme fixtures. All paths in that manifest are relative to `testdata/rfc8785/`.

Top-level fields:

- `version`: corpus version.
- `standard`: RFC 8785 JSON Canonicalization Scheme (JCS).
- `source`: RFC URL.
- `canonicalJSON`: canonical byte definition, object key order, and hash algorithm.
- `valid`: RFC-derived valid canonicalization cases.
- `numberSerialization`: RFC 8785 Appendix B number serialization vectors.
- `invalidIJSON`: JSON text that is syntactically valid or parser-adjacent but invalid for RFC 8785/I-JSON canonicalization.

For each valid RFC 8785 case:

```text
inputJSON
  -> parse as I-JSON
  -> canonicalize per RFC 8785
  -> exact compare with expectedCanonicalJSON
  -> compare UTF-8 bytes as lowercase hex with expectedCanonicalUTF8Hex
  -> hash canonical JSON bytes with unseeded XXH3-128
  -> exact compare lowercase hex with expectedCanonicalJSONXXH3
```

For `numbers/appendix-b.json`, serialize each finite IEEE 754 value to JSON and exact-match `expectedJSON`. Reject each `rejectedNativeValues` entry if the implementation accepts native floating-point input.

For `invalidIJSON`, canonicalization must fail. Do not assert exact error strings.

## Typed Vocabulary Fixtures

`vocabularies/manifest.json` is the source of truth for typed vocabulary fixtures. All paths in that manifest are relative to `testdata/vocabularies/`.

Top-level fields:

- `version`: corpus version.
- `description`: fixture corpus purpose.
- `vocabularies`: vocabulary profile map. `true` means required support, `false` means optional support.
- `registry`: machine-readable tag registry for codegen-oriented consumers.
- `valid`: valid typed value rendering cases.
- `invalid`: typed values that vocabulary-aware implementations must reject.
- `invalidProfiles`: vocabulary profiles that must be rejected by implementations that cannot satisfy required vocabularies.

For each valid vocabulary case:

```text
inputJSON
  -> parse JSON
  -> optionally map enabled typed tags to native values
  -> render RON
  -> exact compare with expectedRON
  -> parse generated RON back to JSON
  -> compare structurally with inputJSON when no native mapping is asserted
```

Base implementations may use these as ordinary JSON/RON fixtures. Vocabulary-aware implementations should additionally validate payloads and assert native type/codegen mappings from `docs/vocabularies.md`.

For each invalid vocabulary case:

```text
inputJSON
  -> parse JSON
  -> apply vocabulary-aware validation for listed vocabularies
  -> must return an error
```

For each invalid profile case:

```text
profile
  -> load vocabulary requirements
  -> must return an error if any vocabulary marked true is unknown or unsupported
```

Do not assert exact error strings. Error text is implementation-specific. Assert only that validation fails.

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
4. Verify each manifest hash matches unseeded XXH3-128 of the expected compact canonical RON bytes.
5. Verify each valid case still represents one JSON value across all RON and JSON files.
6. Verify invalid cases still fail for the intended reason.

A new valid case is complete only when it has all four expected outputs: compact JSON, pretty JSON, compact canonical RON, pretty canonical RON, and a canonical XXH3 hash.
