# RON Implementation Guide

This guide describes how to build a RON v1 implementation that matches the reference corpus.

Read first:

- `docs/ADR.md`
- `testdata/conformance/manifest.json`
- `testdata/rfc8785/manifest.json`
- `docs/vocabularies.md`
- `testdata/vocabularies/manifest.json`

## Required API Surface

A complete implementation should expose these operations, using language-appropriate names:

```text
RONToJSON(source, options) -> JSON bytes
JSONToRON(source, options) -> RON bytes
ReadNDRON(stream, options) -> incremental values/errors
WriteNDRON(stream, values, options)
ReadRONSequence(stream, options) -> incremental values/errors
WriteRONSequence(stream, values, options)
```

Stream APIs should be incremental and bounded rather than reading an unbounded stream into memory. Iterator, callback, channel, async-iterator, and language-native reader/writer forms are all acceptable.

Options should include one output mode, exposed as an enum, string, option struct, or idiomatic equivalent:

```text
mode = pretty | compact | canonical
```

`pretty` is the default. It renders multiline output. `compact` renders single-line output. Both preserve source/member order when available. `canonical` applies the complete RFC 8785 and I-JSON contract for the selected target format. Canonical RON is compact. Canonical JSON is RFC 8785 JSON.

Minimum support:

- Parse RON into a JSON value model.
- Render that model as JSON.
- Parse JSON into the same value model.
- Render that model as RON.
- Preserve number text when practical.
- Return errors for invalid input.

## Value Model

Use this internal model for canonical-only implementations:

```text
Null
Bool
Number(text)
String(text)
Array([]Value)
Object(map string Value)
```

Use `Number(text)`, not a binary float, for parser and formatter paths. This preserves large integers and exponent text. String values contain decoded characters; source escape spelling is not retained.

When an object contains duplicate keys, decode key escapes before comparing keys and keep the last value.

Preserve object member order while parsing. If a duplicate key appears, the last occurrence wins and the surviving member should appear at the position of its last occurrence. For an unordered host map, use and document a deterministic fallback order. Do not call that fallback source order or canonical output.

## RON Parser Algorithm

### Entry Point

1. Skip top-level space. Top-level space includes comma.
2. If the first remaining byte is neither `{` nor `[`, try elided object parsing from byte 0.
3. If elided object parsing succeeds, return that object.
4. Otherwise reset to byte 0 and parse one value.
5. Skip top-level space again.
6. If bytes remain, return trailing data error.

This fallback is important because scalar roots are valid. Root arrays and wrapped root objects are also valid; they skip elision because they start with `[` or `{` and are parsed directly as a single root value.

### Whitespace and Separators

Implement two skip functions:

```text
skipTopLevelSpace: ASCII space, tab, LF, CR, comma, and Unicode whitespace
skipWhitespace: ASCII space, tab, LF, CR, and Unicode whitespace
```

Inside arrays and objects, call `skipSeparators` after each parsed value:

```text
skipSeparators:
  repeat:
    skipWhitespace
    if next byte is comma, consume it
    else stop
```

Do not call `skipSeparators` before the first array value. A leading comma starts a comma-prefixed string token.

### Values

Dispatch on the current byte:

```text
{  -> object
[  -> array
,  -> comma-prefixed string token
'  -> apostrophe string or apostrophe token
"  -> quoted string
else -> bare token
```

Bare value token handling:

1. Scan the source token while consuming every backslash escape as one token atom, even when it decodes to whitespace or a structural delimiter.
2. Unescaped source `true` -> boolean true.
3. Unescaped source `false` -> boolean false.
4. Unescaped source `null` -> null.
5. Unescaped JSON-number-shaped source -> Number(source).
6. Otherwise decode JSON escapes and return String(decoded).

Classification happens before escape decoding. `tr\u0075e` and `\u0031` are strings, not a boolean and number.

### Object Keys

Object keys use string parsing only:

```text
,  -> comma-prefixed string token
'  -> apostrophe string or apostrophe token
"  -> quoted string
{ } [ ] -> error
else -> bare token as string
```

Decode JSON escapes in every key form. Do not coerce decoded key tokens to booleans, null, or numbers. Detect duplicates after decoding.

### String Escapes

Every string form uses the JSON escape set:

```text
\"  \\  \/  \b  \f  \n  \r  \t  \uXXXX
```

Implement one escape scanner/decoder and reuse it for bare values, keys, comma-prefixed tokens, and quoted strings. It must:

1. Reject a trailing backslash, unknown escape, short `\u` escape, or non-hex `\u` digit.
2. Decode the simple escapes exactly as JSON does.
3. Decode `\uXXXX`; combine a valid high/low UTF-16 surrogate pair into one non-BMP character.
4. Reject unpaired high or low surrogates.
5. Reject unescaped U+0000 through U+001F in string content.
6. Treat an escape as one scanner atom before delimiter detection. Thus `a\u0020b`, `a\"b`, and `a\nb` are each one bare token.

Do not decode escapes in booleans, null, or number tokens because only exact unescaped source forms select those types.

### Comma-Prefixed Tokens

When a key or value starts with comma:

1. Start the token at the comma.
2. Consume source atoms until an unescaped delimiter.
3. Decode escapes across the whole token and return it as a string.

Examples:

```text
,       -> ","
,@      -> ",@"
,foo    -> ",foo"
,\nfoo  -> the string containing comma, LF, "foo"
```

### Quoted Strings

A quoted string starts with one or more copies of `'` or `"`. Quoting controls framing only; its content uses the same JSON escape decoder as every other string.

Algorithm:

1. Let `quote` be the first byte.
2. Count the opening run length `n`.
3. If the run is followed by EOF or a delimiter:
   - If `n` is even, consume the run and return empty string.
   - If `quote` is apostrophe, `n >= 5`, and `(n - 2) % 3 == 0`, consume the run and return `(n - 2) / 3` apostrophes. A double-quote run never uses this compatibility form.
4. Otherwise, the string content starts after the opening run.
5. Scan source atoms. When backslash appears, consume and validate the complete JSON escape before looking for a closing delimiter. Reject unescaped U+0000 through U+001F.
6. When an unescaped run of `quote` appears, treat a run shorter than `n` as content and stop at a run of at least `n`. The other quote byte is ordinary content.
7. Decode the collected content and return it.
8. Consume exactly `n` quote bytes from the closing run.
9. If EOF occurs first, return unterminated string error.

Apostrophe has one extra compatibility rule: if apostrophe quoted-string parsing fails and the next byte is EOF or a delimiter, consume one apostrophe and return the string token `'`.

## JSON Parser Requirements

Use a standards-compliant JSON parser with these constraints:

- Preserve numbers as source text if possible.
- Reject malformed JSON.
- Reject multiple root values.
- Reject trailing non-whitespace data.

The conformance invalid JSON fixtures cover malformed objects, multiple roots, and trailing data.

## RON Rendering

### String Rendering

First escape backslashes and controls in string content:

1. `\` -> `\\`.
2. Backspace, form feed, LF, CR, and tab -> `\b`, `\f`, `\n`, `\r`, and `\t`.
3. Other U+0000 through U+001F -> lowercase `\u00xx`.
4. Keep `"`, `/`, and all other Unicode characters unescaped.

Apply the transformations by character, not by repeated textual replacement, so newly written backslashes are not escaped again.

For object keys, render the escaped content bare when it is non-empty and has no unescaped structural rune or whitespace.

For values, render escaped content bare when it is non-empty, has no unescaped structural rune or whitespace, is not exactly `true`, `false`, or `null`, and is not a number.

Otherwise quote with single quotes:

```text
delimiter = repeat("'", longest run of "'" in escapedContent + 1)
output = delimiter + escapedContent + delimiter
```

Examples:

```text
"hello"        -> hello
"true"         -> 'true'
"a<LF>b"       -> a\nb
"a\\nb"        -> a\\nb
"a<TAB>b"      -> a\tb
"a\"b"         -> 'a"b'
"it's fine"    -> ''it's fine''
"'"            -> '''''
```

### Pretty RON

Pretty RON uses two-space indentation in the corpus.

Rules:

- Selected by `mode=pretty`. It is the default.
- Always append one trailing newline.
- Render root object members at indentation level 0 without outer braces.
- Render empty root objects as `{}` because there are no members to elide.
- Preserve source/member order when available.
- Render empty objects as `{}` and empty arrays as `[]`.
- Inline arrays when every element can inline and total rendered size is at most 80 bytes.
- Inline objects only when they have exactly one key, the value can inline, and total rendered size is at most 80 bytes.
- Otherwise render one item or member per line.

### Typed Value Rendering Hooks

JSON-to-RON renderers should expose an optional hook for application-specific typed rendering. The hook is a pre-render transform with this shape in language-neutral terms:

```text
mapValue(path, value) -> (replacementValue, replaced)
```

Rules:

- `path` is the location in the original JSON tree. Object path elements are strings. Array path elements are zero-based integers. The root path is empty.
- If `replaced=false`, render the original value normally.
- If `replaced=true`, render `replacementValue` at that path and do not apply the same hook again inside the returned replacement subtree.
- `replacementValue` must be a valid JSON value in the RON data model.
- The hook is a rendering API only. It does not change parser behavior or make typed marker objects special in base RON.
- Prefer official tags from `docs/vocabularies.md` when a hook emits typed values.

Examples:

```text
path ["tx"], value "BE" -> {"#":"BE"} -> tx {# BE}
path ["committed"], value "2026-06-13T00:00:00Z" -> {"#utc":"2026-06-13T00:00:00Z"} -> committed {#utc 2026-06-13T00:00:00Z}
```

### Compact RON

Compact RON rules:

- Selected by `mode=compact`.
- Root objects omit outer braces.
- Non-root objects keep braces.
- Arrays keep brackets.
- Preserve source/member order when available.
- Separate object members and array elements with a single space.
- Omit key/value space when the value starts with `{`, `[`, `'`, or `"`.
- Keep key/value space for null, booleans, numbers, bare strings, and any unsupported fallback.

Exact compact output examples live in `expected.compact.ron` fixture files.

### Canonical RON

Canonical RON is compact UTF-8 RON for an RFC 8785 I-JSON value. It is not key sorting alone. Canonical input parsing must retain ordered object members and decoded names through duplicate-name validation. Do not collapse a base RON last-wins object first. Before rendering, reject duplicate decoded object names, invalid Unicode, and lone surrogates. Reject direct or escaped Unicode noncharacters, NaN, and infinities. Reject a source number when conversion to IEEE 754 double precision produces a non-finite value. RFC 7493 Section 2.1 defines the noncharacter rule. A finite source number can round during conversion. Serialize numbers with the RFC 8785 ECMAScript algorithm, including minus-zero normalization. Do not normalize Unicode. Then apply the canonical RON string renderer and recursively sort keys by UTF-16 code units.

`mode=canonical` renders compact RON. `mode=pretty` and `mode=compact` are non-canonical. Hash canonical RON with SHA-256. The `testdata/rfc8785/manifest.json` entries contain exact RON bytes and hashes. The Appendix B number entries contain exact scalar RON bytes and hashes.

## Stream Framing

### NDRON

An NDRON encoder renders each value as one single-line RON text and writes one LF after it. Use `mode=compact` or `mode=canonical`. Reject pre-rendered records containing raw LF or CR rather than emitting an ambiguous stream.

An NDRON parser:

1. Reads incrementally through LF.
2. Removes one CR immediately before LF when present, then rejects any remaining raw CR in the record.
3. Applies the documented configurable empty-line policy.
4. Parses every non-empty line as one complete RON text.
5. Reports an unterminated final line as incomplete input.
6. Enforces configurable record-size and nesting limits.

### RON text sequences

A RON text-sequence encoder writes RS (`0x1E`), one complete RON text, and LF (`0x0A`) for each value. If pretty RON already ends in LF, that LF is the terminator; do not append another. Validate pre-rendered input before framing it.

A sequence parser scans incrementally for RS. Report non-empty bytes before the first RS as an invalid preamble, then recover at that RS. Bytes through the next RS, or through EOF, are one possible element. Parse each possible element independently. On failure, report the element error and resume at the next RS unless the caller selected fail-fast behavior. Ignore consecutive RS bytes rather than yielding empty values.

The LF terminator is a truncation canary. Without trailing RON whitespace, accept only values made self-delimiting by a closing object, array, or quote delimiter. Drop bare scalars and top-level elided objects that reach RS or EOF without trailing whitespace because they may be truncated. Never publish partial parser results before the full element is accepted.

Raw RS cannot occur in valid RON string content: it is U+001E and must render as `\u001e`. This is what makes resynchronization safe.

## JSON Rendering

### Pretty JSON

Pretty JSON corpus settings:

```text
prefix = ""
indent = "  "
```

Rules:

- `mode=pretty` preserves source/member order when available.
- Render non-empty arrays and objects multiline.
- Render empty arrays and objects as `[]` and `{}`.
- Do not require a trailing newline.

### Compact JSON

Rules:

- `mode=compact` preserves source/member order when available.
- Emit no insignificant whitespace.
- Preserve number text.

## Typed Vocabularies

Typed vocabularies are optional semantic layers over the JSON value model. A typed value is a single-key object whose key starts with `#`, for example `{ "#utc": "2026-06-13T00:00:00Z" }` or `{ "#f3v": [1, 2, 3] }`.

Base RON parsers and renderers do not need typed vocabulary support. They must preserve typed values as ordinary JSON objects. Vocabulary-aware decoders may map enabled tags to native types after parsing, and vocabulary-aware renderers may emit official tags from native typed values.

Use `docs/vocabularies.md` for the normative tag registry, payload rules, vocabulary profile model, custom extension contract, and vocabulary fixtures. Use `testdata/vocabularies/registry.json` as the machine-readable registry for codegen-oriented consumers, `schemas/vocabularies/` for JSON Schema Draft 2020-12 validation/codegen aids, and `testdata/vocabularies/manifest.json` for vocabulary fixtures. Registry schema paths are repository-root relative.

## RFC 8785 Canonical JSON

RFC 8785 canonical JSON is a separate JSON byte contract from RON compact output. It is the JSON Canonicalization Scheme (JCS): no insignificant whitespace, primitive serialization as ECMAScript `JSON.stringify()`, recursive object property sorting by raw property names interpreted as UTF-16 code unit arrays, and final UTF-8 bytes.

Use `testdata/rfc8785/manifest.json` for the RFC fixture corpus. Each valid case has an input JSON file, expected canonical JSON bytes, expected UTF-8 hex, and a SHA-256 hash in `expectedCanonicalJSONSHA256`. The corpus also includes RFC 8785 Appendix B number serialization samples and I-JSON rejection cases.

Non-canonical JSON and RON output can preserve number text when practical. Canonical JSON and canonical RON serialize numbers as IEEE 754 double-precision ECMAScript numbers.

## Conformance Harness

Use `testdata/conformance/manifest.json` for single RON texts. The manifest declares:

```text
defaultMode: pretty
expectedPrettyOutput: mode=pretty
expectedCompactOutput: mode=compact
expectedCanonicalOutput: mode=canonical
```

For each valid case:

1. For each path in `ronInputs`, read the RON file.
2. Convert RON -> pretty JSON with `mode=pretty`, then exact-match `expectedPrettyJSON`.
3. Convert RON -> compact JSON with `mode=compact`, then exact-match `expectedCompactJSON`.
4. Convert RON -> canonical JSON with `mode=canonical`, then exact-match `expectedCanonicalJSON` and its SHA-256 hash.
5. Read `jsonInput`.
6. Convert JSON -> pretty RON with `mode=pretty`, then exact-match `expectedPrettyRON`.
7. Convert JSON -> compact RON with `mode=compact`, then exact-match `expectedCompactRON`.
8. Convert JSON -> canonical RON with `mode=canonical`, then exact-match `expectedCanonicalRON` and its SHA-256 hash.
9. Parse all produced JSON and compare values with `jsonInput`.
10. Parse produced RON back to JSON and compare values with `jsonInput`.

String conformance cases must additionally prove:

- Every JSON escape works in bare, single-quoted, double-quoted, repeated-delimiter, comma-prefixed, and key contexts where applicable.
- Escaped whitespace and delimiters remain in one token.
- Apostrophe strings accept raw double quotes, and N-quoted strings preserve same-quote runs shorter than N.
- Runs of the active quote at least as long as N close an N-quoted string.
- Classification occurs before decoding.
- Backslashes and control characters render with canonical escapes while double quotes render raw inside apostrophe delimiters.
- Unknown, truncated, malformed Unicode, unpaired-surrogate, and raw-control inputs fail.

For each case in `jsonToRONRendering`:

1. Read `jsonInput`.
2. Apply the declared options and typed value hooks.
3. Convert JSON -> RON.
4. Exact-match `expectedRON`.
5. Parse produced RON back to JSON. For typed value hook cases, compare with the transformed value, not the original `jsonInput`.

For invalid cases:

- Every `invalidRON` path must fail RON parsing.
- Every `invalidJSON` path must fail JSON -> RON conversion.

Use `testdata/sequences/manifest.json` for NDRON and RON text-sequence cases. Exact-match encoded stream bytes, parse all valid streams into the declared JSON value array, and run malformed/truncated recovery cases according to the manifest's expected values and error counts.

Use `testdata/vocabularies/manifest.json` for typed vocabulary cases. For each valid vocabulary case:

1. Read `inputJSON`.
2. If vocabulary support is enabled, validate and map each single-key typed object whose tag belongs to the case vocabularies.
3. Render RON and exact-match `expectedRON`.
4. Parse produced RON back to JSON.
5. Base implementations may skip typed mapping and compare the JSON value structurally; vocabulary-aware implementations should also assert native type mapping.

For each invalid vocabulary case, parse `inputJSON`, apply vocabulary-aware validation for the listed vocabularies, and assert validation fails. For each invalid profile case, load the profile and reject it if any vocabulary marked `true` is unknown or unsupported. Do not assert exact error strings.

## Implementation Order

1. Implement number-shape detection.
2. Implement JSON escape scanning, decoding, and canonical encoding.
3. Implement token scanning and whitespace handling with escape atoms.
4. Implement RON parser to the JSON value model.
5. Implement compact JSON output.
6. Implement pretty JSON output.
7. Implement JSON parser to the same value model.
8. Implement escaped string rendering.
9. Implement pretty RON output.
10. Implement compact RON output.
11. Add pretty root object elision for JSON-to-RON output.
12. Add typed value hook support for JSON-to-RON rendering.
13. Add SHA-256 checks for canonical RON output.
14. Wire the single-text manifest-based conformance runner.
15. Add incremental NDRON readers and writers.
16. Add incremental RON text-sequence readers and writers.
17. Wire the sequence manifest-based conformance runner.

## Gotchas

- Top-level elided objects are tried before scalar parsing.
- Object keys never coerce to numbers, booleans, or null, but their escapes must decode before duplicate detection.
- Type classification uses unescaped source spelling; escape decoding happens only after selecting a string.
- Backslash always starts a JSON escape in every string form. Literal backslashes require `\\`.
- Escape-aware scanners must consume `\"` and `\u0020` before delimiter checks.
- Raw quotes are content only inside a quoted string when they differ from the active delimiter or form a run shorter than that delimiter.
- Unescaped C0 controls are invalid string content.
- Comma is a separator after a value but a string token at the start of a value.
- The standalone apostrophe token is a string with value `'`.
- JSON values must be compared structurally unless the fixture is an exact text golden.
- Preserve large number text only in non-canonical output.
- Pretty and compact corpus fixtures preserve source/member order.
- `mode=canonical` validates and canonicalizes the value.
- Canonical hash input is the compact canonical RON bytes from the RFC 8785 corpus.
- Pretty RON has a trailing newline; pretty JSON golden files do not require one.
- NDRON records are always single-line and LF-terminated; pretty RON is not an NDRON record mode.
- A pretty RON text's existing trailing LF is the RON text-sequence terminator.
- RON text-sequence parsers recover at RS and must not publish partial values from invalid elements.
- Pretty root object elision is a JSON-to-RON rendering behavior, not a parsing mode.
- Typed value hooks intentionally change rendered output values; compare typed-hook round trips against the transformed value.
