# RON Test Data

## Layout

```text
conformance/  Language-neutral single-text RON fixture corpus.
rfc8785/      RFC 8785 canonical JSON fixture corpus.
vocabularies/ Typed vocabulary fixture corpus.
```

## Manifest

`conformance/manifest.json` is the source of truth for test runners. All paths in the manifest are relative to `testdata/conformance/`.

Top-level fields:

- `version`: corpus version.
- `formatting`: reference formatting knobs, the default mode, and mode expectations.
- `valid`: valid ordinary RON conversion cases.
- `canonicalRON`: RON-source-only canonical RON cases. The RFC 8785 manifest defines JSON-source canonical RON cases.
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
- `expected.pretty.json`: pretty JSON output for RON -> JSON.
- `expected.compact.json`: compact JSON output for RON -> JSON.
- `expected.canonical.json`: canonical JSON output for RON -> JSON.
- `expected.pretty.ron`: pretty RON output for JSON -> RON.
- `expected.compact.ron`: compact RON output for JSON -> RON.
- `expected.canonical.ron`: canonical RON output for JSON -> RON.
- `expectedCanonicalJSON`: the manifest path to `expected.canonical.json`.
- `expectedCanonicalJSONSHA256`: SHA-256 of `expectedCanonicalJSON`, encoded as 64 lowercase hexadecimal digits.
- `expectedCanonicalRON`: the manifest path to `expected.canonical.ron`.
- `expectedCanonicalRONSHA256`: SHA-256 of `expectedCanonicalRON`, encoded as 64 lowercase hexadecimal digits.

A language implementation should generate its own actual outputs in memory or in its own temporary/build directory. Do not write generated outputs back into this corpus during normal test runs.

## Valid Case Data Flow

For each entry in `valid`, use this flow.

```text
ronInputs[]
  -> parse RON
  -> JSON value model
  -> emit pretty JSON
  -> exact compare with expectedPrettyJSON
  -> emit compact JSON
  -> exact compare with expectedCompactJSON
  -> emit canonical JSON
  -> exact compare with expectedCanonicalJSON
  -> hash canonical JSON bytes with SHA-256
  -> exact compare lowercase hex with expectedCanonicalJSONSHA256

jsonInput
  -> parse JSON
  -> JSON value model
  -> emit pretty RON
  -> exact compare with expectedPrettyRON
  -> emit compact RON
  -> exact compare with expectedCompactRON
  -> emit canonical RON
  -> exact compare with expectedCanonicalRON
  -> hash canonical RON bytes with SHA-256
  -> exact compare lowercase hex with expectedCanonicalRONSHA256
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

The exact-text checks prove formatter compatibility. The separate canonical corpus hashes prove canonical byte stability. The semantic checks prove value compatibility.

String cases additionally cover JSON escape decoding in every string form. Backslash escapes are semantic before bare/quoted presentation: `a\nb`, `'a\nb'`, and `"a\nb"` all contain an LF. Quote framing is delimiter-aware: apostrophe strings accept raw double quotes, and an N-quoted string treats same-quote runs shorter than N as content. Renderers escape backslashes and controls canonically, keep double quotes raw, and then select bare or repeated-apostrophe output.

## Exact Comparison Rules

Exact means byte-for-byte against the fixture file using LF line endings.

- `formatting.defaultMode` is `pretty`.
- Pretty JSON and pretty RON use `formatting.expectedPrettyOutput`: `mode=pretty`.
- Compact JSON and compact RON use `formatting.expectedCompactOutput`: `mode=compact`.
- Canonical JSON and canonical RON use `formatting.expectedCanonicalOutput`: `mode=canonical`.
- Pretty JSON uses `formatting.jsonPrefix` and `formatting.jsonIndent` from the manifest.
- Pretty RON uses `formatting.ronIndent` from the manifest.
- Pretty RON files include the trailing newline when `formatting.prettyRONTrailingNewline` is true.
- Pretty and compact output preserve source/member order when available.
- Compact JSON emits no insignificant whitespace.
- Compact RON emits no newlines and may elide root object braces.
- `expectedCompactRON` and `expectedPrettyRON` test non-canonical formatting.
- Every valid case has six explicit expected-output paths and SHA-256 hashes for both canonical outputs.
- Canonical RON is compact and follows the RFC 8785 corpus.

If an implementation receives an unordered host map, it must use and document a deterministic fallback order. That fallback is not source order or canonical output.

If an implementation does not support one output mode yet, mark that mode unsupported in that implementation's own test suite. Do not change these fixtures to match a partial implementation.

## Canonical RON Source Boundaries

`conformance/manifest.json` has a `canonicalRON` section for RON-only canonicalization boundaries. The RFC 8785 manifest is the authority for JSON-source canonical RON cases.

For each `canonicalRON.validRON` case:

```text
inputRON
  -> parse RON
  -> validate RFC 8785 and I-JSON constraints
  -> render compact canonical RON
  -> exact compare with expectedCanonicalRON
  -> hash canonical RON bytes with SHA-256
  -> exact compare lowercase hex with expectedCanonicalRONSHA256
```

Each `canonicalRON.invalidRON` input must parse as base RON when applicable but fail canonical RON conversion. These cases cover literal and escaped duplicate names, direct and escaped Unicode noncharacters, and nonfinite IEEE 754 values. Canonical input implementations must retain ordered members and decoded names through duplicate-name validation. They must not collapse a base RON last-wins object first.

## JSON-to-RON Rendering Option Cases

The `jsonToRONRendering` manifest entries are option-specific JSON -> RON cases. Each entry includes:

- `jsonInput`: JSON source file.
- `options`: one rendering `mode`: `pretty`, `compact`, or `canonical`.
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

## RFC 8785 Canonical JSON and RON Fixtures

`rfc8785/manifest.json` is the source of truth for RFC 8785 JSON Canonicalization Scheme fixtures. All paths in that manifest are relative to `testdata/rfc8785/`.

Top-level fields:

- `version`: corpus version.
- `standard`: RFC 8785 JSON Canonicalization Scheme (JCS).
- `source`: RFC URL.
- `canonicalJSON`: canonical JSON byte definition, object key order, and hash algorithm.
- `canonicalRON`: canonical RON value constraints, number rules, string rules, key order, and hash algorithm.
- `valid`: RFC-derived valid cases with canonical JSON and canonical RON output.
- `numberSerialization`: RFC 8785 Appendix B number vectors with canonical JSON and canonical RON output.
- `invalidIJSON`: JSON text that is syntactically valid or parser-adjacent but invalid for RFC 8785/I-JSON canonicalization.

For each valid RFC 8785 case:

```text
inputJSON
  -> parse as I-JSON
  -> canonicalize per RFC 8785
  -> exact compare with expectedCanonicalJSON
  -> compare UTF-8 bytes as lowercase hex with expectedCanonicalUTF8Hex
  -> hash canonical JSON bytes with SHA-256
  -> exact compare lowercase hex with expectedCanonicalJSONSHA256
  -> render canonical RON
  -> exact compare with expectedCanonicalRON
  -> hash canonical RON bytes with SHA-256
  -> exact compare lowercase hex with expectedCanonicalRONSHA256
```

For `numbers/appendix-b.json`, serialize each finite IEEE 754 value to JSON and RON. Exact-match `expectedJSON` and `expectedCanonicalRON`. Hash the RON bytes and compare `expectedCanonicalRONSHA256`. Reject each `rejectedNativeValues` entry if the implementation accepts native floating-point input.

For `invalidIJSON`, canonical JSON and canonical RON conversion must fail. Do not assert exact error strings.

## Typed Vocabulary Fixtures

`vocabularies/manifest.json` is the source of truth for typed vocabulary fixtures. All paths in that manifest are relative to `testdata/vocabularies/`.

Top-level fields:

- `version`: corpus version.
- `description`: fixture corpus purpose.
- `vocabularies`: vocabulary profile map. `true` means required support, `false` means optional support.
- `registry`: machine-readable tag registry for codegen-oriented consumers.
- `schemas`: path to the repository's typed vocabulary JSON Schema directory, relative to `testdata/vocabularies/`.
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

Base implementations may use these as ordinary JSON/RON fixtures. Vocabulary-aware implementations should additionally validate payloads and assert native type/codegen mappings from `docs/vocabularies.md`. JSON Schema files under `schemas/vocabularies/` validate typed object shape and payload shape; semantic checks such as masked CIDR, RFC 5952 IPv6 text, and GeoJSON ring validity may need additional implementation validation.

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
3. Update `conformance/manifest.json` so every new single-text file is reachable.
4. For canonical RON, update `rfc8785/manifest.json` and verify each canonical RON SHA-256 value.
5. Verify each valid case still represents one JSON value across all RON and JSON files.
6. Verify invalid cases still fail for the intended reason.

A new ordinary valid case is complete only when its directory contains `expected.pretty.json`, `expected.compact.json`, `expected.canonical.json`, `expected.pretty.ron`, `expected.compact.ron`, and `expected.canonical.ron`. The manifest records every path and both canonical SHA-256 hashes. RFC vectors, Appendix B vectors, invalid cases, and RON-source canonical boundaries are specialized test groups.
