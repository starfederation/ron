# ADR-0001: Define the Reference RON Format

## Status

Accepted

## Date

2026-06-12

## Context

Large JSON-shaped documents are often noisy to author and expensive to include in LLM context. Repeated quotes, colons, commas, and braces add visual friction for humans and token overhead for models.

RON, Readable Object Notation, keeps the JSON value model but removes avoidable syntax where the meaning is unambiguous. This repository is the format reference. It documents the decisions and carries conformance fixtures for both conversion directions:

- RON -> JSON.
- JSON -> RON.
- Compact output.
- Pretty output.
- Invalid input rejection.

## Decision

Define RON v1 as a compact, human-writeable JSON notation optimized for large JSON-shaped documents and LLM token efficiency.

### Data model

RON maps to the JSON value model:

- null
- boolean
- number
- string
- array
- object with string keys

Application-level marker strings, small objects, and punctuation tokens are not special to RON; they convert as ordinary JSON strings and objects.

Example RON:

```ron
{
  id ?id
  ref {# 200}
  temp #_ada
  tokens [
    ','
    ',@'
  ]
}
```

Example JSON:

```json
{
  "id": "?id",
  "ref": {
    "#": 200
  },
  "temp": "#_ada",
  "tokens": [
    ",",
    ",@"
  ]
}
```

### Tokens and whitespace

ASCII structural delimiters are:

```text
{ } [ ] " ' , space tab LF CR
```

Unicode whitespace also separates tokens. Non-ASCII non-whitespace bytes are token content.

A bare value token is interpreted as:

1. `true`, `false`, or `null` when it exactly matches those bytes.
2. A number when it matches the JSON number grammar used by the reference parser.
3. A string otherwise.

Object keys are always strings. A bare object key such as `true`, `123`, or `null` is a string key, not a boolean, number, or null.

### Numbers

A number token has this shape:

```text
-? (0 | [1-9][0-9]*) (.[0-9]+)? ([eE][+-]?[0-9]+)?
```

Leading `+`, leading zeroes such as `01`, trailing decimal points such as `1.`, `NaN`, and infinities are not numbers. They become strings unless quoted rules or parser context reject them.

Implementations should preserve number text when converting RON -> JSON and when rendering JSON numbers to RON. Do not force numbers through a binary float if that would lose precision.

### Strings

RON supports bare strings and quoted strings.

Use a bare string when it is non-empty, is not `true`, `false`, or `null`, is not a number, and contains no structural delimiter or whitespace.

Quoted strings use either `'` or `"` as a repeated delimiter. The opening delimiter is one or more copies of the same quote byte. The closing delimiter must use the same quote byte and at least the same run length. Content is raw bytes between delimiters; there are no backslash escapes. This repeated-delimiter string style is inspired by [Janet](https://janet-lang.org/docs/syntax.html).

Rendering uses single quote delimiters and chooses one more quote than the longest single-quote run inside the value.

Examples:

| JSON string | RON |
| --- | --- |
| empty string | `''` |
| `Ada Lovelace` | `'Ada Lovelace'` |
| `true` | `'true'` |
| `123` | `'123'` |
| `it's fine` | `''it's fine''` |
| `'` | `'''''` |
| `contains '' inside` | `'''contains '' inside'''` |

A standalone apostrophe can also be the string token `'`. The conformance corpus covers quote-token edge cases.

### Objects

Objects are key/value pairs:

```ron
{
  age 37
  name Ada
}
```

Rules:

- Keys are strings.
- Values are any RON value.
- Whitespace or a value-start delimiter separates key and value.
- Commas after values are optional separators.
- Duplicate keys are allowed while parsing; the last value wins.
- JSON and RON formatters sort object keys lexicographically.

### Top-level object elision

When the first non-top-level-space input byte is not `{` or `[`, a parser first attempts to read the document as an object without outer braces. Top-level space includes commas.

```ron
age 37
name Ada
```

This maps to:

```json
{
  "age": 37,
  "name": "Ada"
}
```

If elided-object parsing fails, the parser falls back to reading a single root value. This allows scalar roots such as `true`, `null`, `123`, and `hello`.

Inputs that begin with `{` or `[` do not use elision. They are parsed directly as a single root object or array, so `[foo bar baz]` is a valid root array and maps to `["foo","bar","baz"]`.

### Arrays

Arrays contain values separated by whitespace and optional comma separators:

```ron
[
  a
  1
  b
  2
  false
  null
]

[
  a,
  1,
  b,
  2,
  false,
  null,
]
```

Both map to:

```json
[
  "a",
  1,
  "b",
  2,
  false,
  null
]
```

At the start of a key or value, a comma begins a comma-prefixed string token. This RON:

```ron
[
  ,
  ,foo
  ,@
  xs
]
```

maps to this JSON:

```json
[
  ",",
  ",foo",
  ",@",
  "xs"
]
```

### Formatting

Reference formatting has four output modes in the corpus.

#### Pretty JSON

- Prefix: empty string.
- Indent: two spaces.
- Objects and arrays are multiline when non-empty.
- Object keys are sorted lexicographically.
- No trailing newline is required in golden files.

#### Compact JSON

- No insignificant whitespace.
- Object keys are sorted lexicographically.
- Duplicate object keys have already collapsed to the last value.

#### Pretty RON

- Indent: two spaces.
- Output ends with a trailing newline.
- Root objects are wrapped with braces.
- Object keys are sorted lexicographically.
- Empty arrays and objects render as `[]` and `{}`.
- Arrays inline when every element can inline and the rendered size is at most 80 bytes.
- Objects inline only when they have one key, the value can inline, and the rendered size is at most 80 bytes.

#### Compact RON

- No newlines.
- Root object braces are elided.
- Object keys are sorted lexicographically.
- Key/value space is omitted before array, object, or quoted-string values when unambiguous.

## Corpus Decision

Keep language-neutral conformance fixtures indexed by `testdata/conformance/manifest.json`.

Each valid conformance case contains:

- RON input variants.
- JSON input.
- Expected compact JSON.
- Expected pretty JSON.
- Expected compact RON.
- Expected pretty RON.

Invalid RON and invalid JSON fixtures are listed separately in the manifest.

## Alternatives Considered

### Continue using raw JSON only

Pros:

- Universal parser support.
- No new syntax to learn.
- Existing tooling already understands it.

Cons:

- Large hand-authored documents are noisy and repetitive.
- Quotes, colons, commas, and object braces consume extra LLM tokens.
- The format optimizes machine interchange over human authoring.

Rejected because the goal is an easier-to-write notation that still maps directly to JSON.

### Use JSON5

Pros:

- Existing ecosystem and parsers.
- Familiar syntax for JavaScript users.

Cons:

- JSON5 adds browser-oriented JavaScript syntax rather than a minimal JSON-shaped notation.
- JSON5 keeps much of JSON's punctuation overhead.
- It does not give this corpus a small, exact, whitespace-oriented syntax.

Rejected because RON intentionally keeps a smaller and more predictable surface.

### Use EDN / `EDN--`

Pros:

- [EDN](https://github.com/edn-format/edn) is beautiful: small, readable, data-first, and pleasant for Lisp-minded humans.
- EDN already demonstrates that whitespace-oriented data can be nicer to author than raw JSON.
- A reduced EDN-like notation, or `EDN--`, is close in spirit to what RON wants for authoring.

Cons:

- EDN's native value model is not the JSON value model.
- Keywords, symbols, sets, lists, tagged literals, ratios, chars, and namespaced values need language-specific handling or lossy JSON mapping.
- EDN is natural in Clojure, but it is not a lowest-common-denominator interchange format across languages.
- Most language standard libraries do not include EDN support, and third-party parser behavior varies.

Rejected as a direct dependency because RON must be JSON-shaped first. RON keeps the EDN-like readability goal, subtracts the non-JSON value space, and makes exact JSON conversion the contract.

### Use YAML

Pros:

- Human-authored and widely implemented.

Cons:

- Larger and more ambiguous surface area.
- More surprising scalar coercions.
- Harder to make compact nested data forms exact across languages.

Rejected because RON intentionally has a small JSON-shaped value set.

## Consequences

- RON v1 compatibility is defined by this ADR plus the conformance corpus.
- New implementations should be built against `testdata/conformance/manifest.json`.
- Format changes require a new ADR and new or versioned fixtures.
- Pretty-format behavior is part of the reference, not an implementation detail.
