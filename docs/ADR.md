# ADR-0001: Define the Reference RON Format

## Status

Accepted

## Date

2026-06-12

## Context

Large JSON-shaped documents are often noisy to author and expensive to include in LLM context. Repeated quotes, colons, commas, and braces add visual friction for humans and token overhead for models.

RON, Readable Object Notation, keeps the JSON value model but removes avoidable syntax where the meaning is unambiguous. This repository is the format reference. It documents the decisions and carries conformance fixtures for:

- RON -> JSON.
- JSON -> RON.
- Compact output.
- Pretty output.
- Invalid input rejection.
- Newline-delimited RON (NDRON).
- RON text sequences.

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

Unicode whitespace also separates tokens. Non-ASCII non-whitespace UTF-8 bytes are token content. Backslash is an escape introducer, not a delimiter. A scanner must consume a complete valid escape before testing the decoded character for whitespace or delimiter meaning. For example, the eight source bytes `a\u0020b` form one bare token whose value is `a b`.

A bare value token is interpreted from its source bytes before escape decoding:

1. `true`, `false`, or `null` when it exactly matches those unescaped bytes.
2. A number when the unescaped token matches the JSON number grammar used by the reference parser.
3. A string otherwise; decode escapes after selecting the string type.

Therefore `true` is a boolean, while `\u0074rue` is the string `true`. Object keys are always strings and always decode escapes. A bare object key such as `true`, `123`, or `null` is a string key, not a boolean, number, or null. Duplicate-key comparison happens after escape decoding, so `a` and `\u0061` name the same key.

### Numbers

A number token has this shape:

```text
-? (0 | [1-9][0-9]*) (.[0-9]+)? ([eE][+-]?[0-9]+)?
```

Leading `+`, leading zeroes such as `01`, trailing decimal points such as `1.`, `NaN`, and infinities are not numbers. They become strings unless quoted rules or parser context reject them.

Implementations should preserve number text when converting RON -> JSON and when rendering JSON numbers to RON. Do not force numbers through a binary float if that would lose precision.

### Strings

RON supports bare strings and quoted strings. Escape decoding is part of every string token, independent of whether the token is bare, single-quoted, double-quoted, comma-prefixed, or used as an object key.

RON uses exactly the JSON escape sequences:

```text
\"  \\  \/  \b  \f  \n  \r  \t  \uXXXX
```

The four `\u` digits are hexadecimal and case-insensitive. A non-BMP character may use the JSON UTF-16 surrogate-pair form, such as `\uD83D\uDE00` for U+1F600. A high surrogate must be followed immediately by a low surrogate, and a low surrogate must follow a high surrogate; unpaired surrogates are invalid RON. Unknown escapes, truncated escapes, and unescaped U+0000 through U+001F characters inside string content are invalid. A literal backslash must therefore be written as `\\`.

Quoting only frames a token; it does not select different escape decoding. These all encode the same three-character string containing an LF between `a` and `b`:

```ron
a\nb
'a\nb'
"a\nb"
'''a\nb'''
```

Quote framing is delimiter-aware. If the opening delimiter is `n` copies of `'` or `"`, an unescaped run of the same quote byte closes the string only when its length is at least `n`; shorter runs are content. The other quote byte is always content. Outside quoted strings, raw quote bytes remain structural. The `\"` escape remains accepted in every string form.

```ron
'{"coordinates":[12.5,-42.25],"type":"Point"}'
"""a "quoted" phrase"""
```

Token classification precedes escape decoding. Consequently `tr\u0075e` is the string `true`, not a boolean, and `\u0031` is the string `1`, not a number.

For rendering, first encode backslashes and controls with JSON escape spelling. Use `\b`, `\f`, `\n`, `\r`, and `\t` for those controls, lowercase `\u00xx` for other U+0000 through U+001F characters, and `\\` for backslash. Keep double quotes and `/` unescaped in canonical RON. Other Unicode characters render directly as UTF-8.

Use the escaped content as a bare string value when it is non-empty, is not exactly `true`, `false`, or `null`, is not a number, and contains no unescaped structural delimiter or whitespace. Object keys are already string context, so non-empty escaped key content renders bare even when it looks like a scalar value. This permits control-containing strings to stay on one physical line, for example the JSON string `"a\nb"` renders as the four source characters `a\nb`.

Otherwise, quote the escaped content. Quoted strings use either `'` or `"` as a repeated delimiter. The opening delimiter is one or more copies of the same quote byte. Runs of that quote byte shorter than the opening delimiter are content; a run at least as long closes the string. Rendering uses single-quote delimiters and chooses one more quote than the longest single-quote run in the escaped content. This repeated-delimiter style is inspired by [Janet](https://janet-lang.org/docs/syntax.html).

Examples:

| JSON string | Canonical RON |
| --- | --- |
| empty string | `''` |
| `Ada Lovelace` | `'Ada Lovelace'` |
| `true` | `'true'` |
| `123` | `'123'` |
| line feed between `a` and `b` | `a\nb` |
| literal `a\nb` | `a\\nb` |
| tab between `a` and `b` | `a\tb` |
| `"` | `'"'` |
| `a "quoted" phrase` | `'a "quoted" phrase'` |
| `it's fine` | `''it's fine''` |
| `'` | `'''''` |
| `contains '' inside` | `'''contains '' inside'''` |

A standalone apostrophe can also be the string token `'`. The conformance corpus covers escapes, quote-token edge cases, and invalid escape rejection.

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
- Scalar-looking keys are still strings and render bare when token-safe: `1538289 {# 181773}` maps to JSON `{"1538289":{"#":181773}}`.
- Values are any RON value.
- Whitespace or a value-start delimiter separates key and value.
- Commas after values are optional separators.
- Duplicate keys are allowed while parsing; the last value wins.
- Sorted non-canonical formatters and canonical RON sort object keys lexicographically.

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

### Stream framing

RON v1 defines two stream formats. Both depend on the string escape rules above: raw LF, CR, and RS bytes cannot occur in conforming encoded string content, while `\n`, `\r`, and `\u001e` preserve those string values without colliding with framing.

#### Newline-delimited RON (NDRON)

NDRON is the RON counterpart of [Newline Delimited JSON](https://github.com/ndjson/ndjson-spec). Each record is one complete RON text followed by LF:

```text
ndron = *(ron-text LF)
```

Rules:

- The stream is UTF-8.
- Encoders must emit each record on one physical line followed by LF. Compact RON is recommended; canonical ordering is optional.
- A record must not contain raw LF or CR. String values containing them use `\n` and `\r`.
- Parsers must accept LF and CRLF record endings. After removing an optional CR immediately before LF, they must reject any remaining raw CR in the record.
- A parser may ignore empty lines, but that behavior must be documented and configurable.
- An invalid non-empty record is an error. Whether processing stops after that error is an API policy.
- The final record requires a line ending; an unterminated final line is incomplete input.

The recommended media type is `application/x-ndron`, and the recommended file extension is `.ndron`.

#### RON text sequences

RON text sequences are the RON counterpart of [RFC 7464 JSON Text Sequences](https://www.rfc-editor.org/rfc/rfc7464). Encoder output is:

```text
ron-sequence = *(RS ron-text LF)
RS = %x1E
LF = %x0A
```

Rules:

- The stream is UTF-8 and has binary encoding considerations because it contains RS.
- Every record is prefixed by one ASCII RS byte and terminated by LF.
- A string containing U+001E uses `\u001e`; raw RS cannot occur in a valid RON text and therefore remains an unambiguous resynchronization marker.
- Sequence elements may use compact or pretty RON. The pretty renderer's trailing LF serves as the required record terminator; do not append a second LF.
- A parser should report an invalid or incomplete element and continue from the next RS. Bytes before the first RS are an invalid preamble; report them, then recover at that RS. Consecutive RS bytes do not encode empty elements.
- There is no end-of-sequence marker and no reliable positional identity after damaged or missing elements.
- Elements ending without LF may be accepted only when the top-level RON value is self-delimited by a closing `}`, `]`, or quote delimiter. Bare scalars and top-level elided objects without terminating whitespace must be treated as potentially truncated and dropped.

The recommended media type is `application/ron-seq`. No file extension is required.

Security behavior follows RFC 7464: parsers must treat records as untrusted, limit record size and nesting, report skipped invalid elements by default, and never expose partial parse results as accepted records.

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

RON has two non-canonical formatting modes and one canonical byte form.

- `isPretty=true` renders multiline RON.
- `isPretty=false` renders compact RON.
- `sortKeys=true` sorts object keys lexicographically by RFC 8785 UTF-16 code unit order. It does not make output canonical.
- `isCanonical=true` selects canonical RON. It requires compact output and applies every rule in [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) that applies to the JSON value model.

`isPretty` and `isCanonical` are mutually exclusive. Pretty RON and ordinary compact RON are non-canonical, even when `sortKeys=true`. Implementations may preserve object member order when `sortKeys=false` and source order exists. They must not describe unordered map iteration as source order.

Duplicate keys remain a base RON parsing rule where the last value wins. Canonical RON rejects a value with duplicate object member names before rendering.

#### Canonical RON

Canonical RON retains RON syntax. It is compact UTF-8 RON for an I-JSON value. It has one exact byte form. RFC 7493 Section 2.1 rejects surrogate code points and Unicode noncharacters in direct and escaped source text. Canonical input parsing retains ordered object members and decoded names through duplicate-name validation. It must not collapse a base RON last-wins object before that check.

1. Validate the value under RFC 8785 Sections 3.1 and 3.2.2.2. Reject duplicate object member names, invalid Unicode, lone surrogates, NaN, and infinities. Reject a source number when conversion to IEEE 754 double precision produces a non-finite value.
2. Serialize every number with the ECMAScript `JSON.stringify()` number algorithm required by RFC 8785 Section 3.2.2.3. A finite source number can round during conversion. Normalize minus zero to `0`. Do not preserve input number spelling.
3. Preserve Unicode scalar values without normalization. Apply the RON canonical string renderer after validation. It escapes backslash and C0 controls, uses the shortest specified control escape, renders other Unicode as UTF-8, and selects the exact RON bare or repeated-apostrophe delimiter form.
4. Sort every object recursively by raw key UTF-16 code units, as RFC 8785 Section 3.2.3 requires.
5. Render compact RON with root-object brace elision. Hash the exact bytes with SHA-256 when a hash is needed.

The reference corpus for canonical RON is `testdata/rfc8785/manifest.json`. Its valid cases provide canonical JSON and canonical RON output. Its Appendix B vectors provide canonical number output. Its I-JSON cases must fail canonical RON conversion. `testdata/conformance/manifest.json` adds RON-source-only canonical boundaries.

#### Pretty RON

- Enabled by `isPretty=true`.
- Indent: two spaces.
- Output ends with a trailing newline.
- Root object members render at indentation level 0 without outer braces.
- Empty root objects render as `{}` because there are no members to elide.
- Object key order follows `sortKeys`.
- Empty arrays and objects render as `[]` and `{}`.
- Arrays inline when every element can inline and the rendered size is at most 80 bytes.
- Objects inline only when they have one key, the value can inline, and the rendered size is at most 80 bytes.

#### Compact RON

- Enabled by `isPretty=false` and `isCanonical=false`.
- No newlines.
- Root object braces are elided.
- Object key order follows `sortKeys`.
- Key/value space is omitted before array, object, or quoted-string values when unambiguous.

JSON-to-RON renderers should expose a typed value hook for application-specific examples and APIs that want JSON-compatible inputs to render as typed RON object forms. The hook maps a value by path before formatting. Paths use object keys and array indexes from the original JSON tree. A hook may replace the value with any JSON value; returned objects such as `{"#":"BE"}` and `{"#utc":"2026-06-13T00:00:00Z"}` render as ordinary RON objects like `{# BE}` and `{#utc 2026-06-13T00:00:00Z}`. Hooks are a rendering API only; they do not change RON parsing or make marker objects special in the base data model.

Typed vocabularies are optional semantic layers over JSON-compatible single-key objects whose keys start with `#`. Base RON remains JSON-only and preserves typed values as ordinary objects. Vocabulary-aware implementations may map enabled tags such as `#utc`, `#dur`, `#url`, `#uid`, `#rx`, `#dec`, `#vN`, `#f3v`, `#geo`, and `#topo` to native types. Custom vocabularies use namespaced tags such as `#com.example/money`. The registry, payload rules, vocabulary profile model, and extension rules live in `docs/vocabularies.md`.

## Corpus Decision

Keep language-neutral formatting fixtures indexed by `testdata/conformance/manifest.json`. Pretty fixtures use `isPretty=true` and `sortKeys=true`. Compact fixtures use `isPretty=false` and `sortKeys=true`. These fixtures do not define canonical RON.

Each ordinary valid conformance case contains:

- RON input variants.
- JSON input.
- Expected compact JSON.
- Expected pretty JSON.
- Expected sorted compact RON.
- Expected sorted pretty RON.

`testdata/rfc8785/manifest.json` defines canonical RON. It contains exact canonical RON bytes and SHA-256 hashes for RFC valid cases and Appendix B numbers. The single-text manifest adds RON-source-only canonical boundaries.

Additional JSON-to-RON rendering cases cover root object elision and typed value hooks. Typed vocabulary fixtures live under `testdata/vocabularies/`.

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
- New implementations should be built against `testdata/conformance/manifest.json` and stream implementations against `testdata/sequences/manifest.json`.
- The universal JSON escape and delimiter-aware quote corrections are part of RON v1, not a v2 format. Implementations of the earlier raw-backslash behavior must update; strings such as `^foo\d+$` now require `^foo\\d+$` in RON source. Implementations that reject raw double quotes inside apostrophe or longer double-quote delimiters must also update.
- Format changes require an ADR revision and matching fixtures.
- Pretty-format and stream-framing behavior are part of the reference, not implementation details.
