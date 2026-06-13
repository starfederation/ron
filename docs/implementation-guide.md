# RON Implementation Guide

This guide describes how to build a RON v1 implementation that matches the reference corpus.

Read first:

- `docs/ADR.md`
- `testdata/conformance/manifest.json`

## Required API Surface

A complete implementation should expose these operations, using language-appropriate names:

```text
RONToJSON(source, options) -> JSON bytes
JSONToRON(source, options) -> RON bytes
```

Options should include formatting flags, exposed as booleans, an option struct, variadic options, or idiomatic equivalents for the target language:

```text
isPretty = true | false
isCanonical = true | false
```

`isPretty` selects multiline pretty output or compact output. `isCanonical` sorts object keys lexicographically by Unicode code point sequence for stable byte-for-byte output. When `isCanonical=false`, preserve object member order from the parsed source when available.

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

Use `Number(text)`, not a binary float, for parser and formatter paths. This preserves large integers and exponent text.

When an object contains duplicate keys, keep the last value.

To support `isCanonical=false`, preserve object member order while parsing. If a duplicate key appears, the last occurrence wins and the surviving member should appear at the position of its last occurrence. Do not use unordered map iteration as given order.

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

1. `true` -> boolean true.
2. `false` -> boolean false.
3. `null` -> null.
4. JSON-number-shaped token -> Number(token).
5. Otherwise -> String(token).

### Object Keys

Object keys use string parsing only:

```text
,  -> comma-prefixed string token
'  -> apostrophe string or apostrophe token
"  -> quoted string
{ } [ ] -> error
else -> bare token as string
```

Do not coerce key tokens to booleans, null, or numbers.

### Comma-Prefixed Tokens

When a key or value starts with comma:

1. Start the token at the comma.
2. Consume bytes until a delimiter.
3. Return the whole token as a string.

Examples:

```text
,     -> ","
,@    -> ",@"
,foo  -> ",foo"
```

### Quoted Strings

A quoted string starts with one or more copies of `'` or `"`.

Algorithm:

1. Let `quote` be the first byte.
2. Count the opening run length `n`.
3. If the run is followed by EOF or a delimiter:
   - If `n` is even, consume the run and return empty string.
   - If `n >= 5` and `(n - 2) % 3 == 0`, consume the run and return `(n - 2) / 3` copies of `quote`.
4. Otherwise, the string content starts after the opening run.
5. Scan until a run of `quote` with length at least `n`.
6. Return the bytes before that closing run as the string content.
7. Consume exactly `n` quote bytes from the closing run.
8. If EOF occurs first, return unterminated string error.

There are no backslash escapes.

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

For object keys, render bare when the key is non-empty and has no structural rune or whitespace.

For values, render bare when the string is non-empty, has no structural rune or whitespace, is not `true`, `false`, or `null`, and is not a number.

Otherwise quote with single quotes:

```text
delimiter = repeat("'", longest run of "'" in value + 1)
output = delimiter + value + delimiter
```

Examples:

```text
"hello" -> hello
"true" -> 'true'
"it's fine" -> ''it's fine''
"'" -> '''''
```

### Pretty RON

Pretty RON uses two-space indentation in the corpus.

Rules:

- Enabled by `isPretty=true`.
- Always append one trailing newline.
- Use the selected object order: `isCanonical=true` sorts keys lexicographically by Unicode code point sequence; `isCanonical=false` preserves source order when available.
- Render empty objects as `{}` and empty arrays as `[]`.
- Inline arrays when every element can inline and total rendered size is at most 80 bytes.
- Inline objects only when they have exactly one key, the value can inline, and total rendered size is at most 80 bytes.
- Otherwise render one item or member per line.

### Compact RON

Compact RON rules:

- Enabled by `isPretty=false`.
- Root objects omit outer braces.
- Non-root objects keep braces.
- Arrays keep brackets.
- Use the selected object order: `isCanonical=true` sorts keys lexicographically by Unicode code point sequence; `isCanonical=false` preserves source order when available.
- Separate object members and array elements with a single space.
- Omit key/value space when the value starts with `{`, `[`, `'`, or `"`.
- Keep key/value space for null, booleans, numbers, bare strings, and any unsupported fallback.

Exact compact canonical output examples live in `expected.compact.ron` fixture files.

### Canonical RON Hashing

Canonical RON is compact output with canonical ordering: `isPretty=false` and `isCanonical=true`. Canonical mode has an extra cost because every object may require sorting its keys before rendering. Non-canonical compact output can preserve source order and avoid that sort when source order is available. For each valid manifest case, hash the exact canonical RON bytes with unseeded XXH3-64 and encode the result as 16 lowercase hexadecimal digits. The hash must match the manifest's `expectedCanonicalRONXXH3`.

## JSON Rendering

### Pretty JSON

Pretty JSON corpus settings:

```text
prefix = ""
indent = "  "
```

Rules:

- Use the selected object order: `isCanonical=true` sorts keys lexicographically by Unicode code point sequence; `isCanonical=false` preserves source order when available.
- Render non-empty arrays and objects multiline.
- Render empty arrays and objects as `[]` and `{}`.
- Do not require a trailing newline.

### Compact JSON

Rules:

- Use canonical object order for corpus fixtures.
- Emit no insignificant whitespace.
- Preserve number text.

## Conformance Harness

Use `testdata/conformance/manifest.json`. The manifest declares:

```text
expectedPrettyOptions: isPretty=true, isCanonical=true
expectedCompactOptions: isPretty=false, isCanonical=true
```

For each valid case:

1. For each path in `ronInputs`, read the RON file.
2. Convert RON -> compact JSON and exact-match `expectedCompactJSON` if compact mode exists.
3. Convert RON -> pretty JSON with `isCanonical=true` and exact-match `expectedPrettyJSON` if pretty mode exists.
4. Read `jsonInput`.
5. Convert JSON -> pretty RON with `isPretty=true` and `isCanonical=true`, then exact-match `expectedPrettyRON`.
6. Convert JSON -> compact canonical RON with `isPretty=false` and `isCanonical=true`, then exact-match `expectedCompactRON` if compact mode exists.
7. Hash compact canonical RON with unseeded XXH3-64 and exact-match `expectedCanonicalRONXXH3` if compact mode exists.
8. Parse all produced JSON and compare values with `jsonInput`.
9. Parse produced RON back to JSON and compare values with `jsonInput`.

For invalid cases:

- Every `invalidRON` path must fail RON parsing.
- Every `invalidJSON` path must fail JSON -> RON conversion.

## Implementation Order

1. Implement number-shape detection.
2. Implement token scanning and whitespace handling.
3. Implement RON parser to the JSON value model.
4. Implement compact JSON output.
5. Implement pretty JSON output.
6. Implement JSON parser to the same value model.
7. Implement string rendering.
8. Implement pretty RON output.
9. Implement compact RON output.
10. Add unseeded XXH3-64 checks for canonical RON output.
11. Wire a manifest-based conformance runner.

## Gotchas

- Top-level elided objects are tried before scalar parsing.
- Object keys never coerce to numbers, booleans, or null.
- Comma is a separator after a value but a string token at the start of a value.
- The standalone apostrophe token is a string with value `'`.
- JSON values must be compared structurally unless the fixture is an exact text golden.
- Preserve large numbers as text.
- Pretty corpus fixtures use canonical object order.
- Compact output is not necessarily canonical unless `isCanonical=true`.
- Canonical hash input is compact canonical RON bytes, not pretty RON, non-canonical compact RON, or JSON bytes.
- Pretty RON has a trailing newline; pretty JSON golden files do not require one.
