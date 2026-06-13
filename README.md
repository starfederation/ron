# RON

RON means Readable Object Notation.

This repository is the language-neutral reference for the RON format. RON keeps the JSON data model while making large JSON-shaped documents easier to write, easier to read, and cheaper in LLM tokens. It contains the format decision record, an implementation guide, and conformance fixtures for RON -> JSON and JSON -> RON conversion, including pretty-format golden files.

This RON is not [Rusty Object Notation](https://github.com/ron-rs/ron).

RON is also not [EDN](https://github.com/edn-format/edn), though it shares the same admiration for readable, data-first syntax. EDN is beautiful, but its native value model and language ecosystem do not map cleanly across JSON-first languages. RON is closer to `EDN--`: EDN-like readability with the non-JSON value space removed and exact JSON conversion as the contract.

## Contents

- `docs/ADR.md`: reference ADR for the format.
- `docs/implementation-guide.md`: parser, renderer, and formatter guidance for new implementations.
- `testdata/conformance/`: language-neutral RON fixture corpus with a manifest.
- `testdata/rfc8785/`: RFC 8785 canonical JSON fixture corpus.

## Implementations

- Go: [starfederation/ron-go](https://github.com/starfederation/ron-go)

## Formatting modes

RON formatting has independent options. Use flags, option structs, variadic options, or idiomatic equivalents for the target language:

- `isPretty`: render multiline pretty output when true, compact output when false.
- `isCanonical`: sort object keys in RFC 8785 UTF-16 code unit order for stable byte-for-byte output when true; preserve source object member order when false and the parser has it.

Compact is not automatically canonical. Canonical RON is compact RON rendered with `isPretty=false` and `isCanonical=true`. Use canonical mode when stable bytes or hashes matter. It has extra cost because each object may need key sorting; non-canonical compact output can preserve source order and avoid that sort.

Canonical JSON means RFC 8785 JSON Canonicalization Scheme (JCS) bytes encoded as UTF-8. Its fixtures live under `testdata/rfc8785/`.

Canonical hashes use unseeded XXH3-128, encoded as 32 lowercase hexadecimal digits. RON conformance cases hash exact canonical RON bytes in `expectedCanonicalRONXXH3`. RFC 8785 cases hash exact canonical JSON bytes in `expectedCanonicalJSONXXH3`. Testdata declares `expectedPrettyOptions` as `isPretty=true, isCanonical=true` and `expectedCompactOptions` as `isPretty=false, isCanonical=true`.

Pretty JSON-to-RON rendering emits root JSON object members at top level by default. JSON-to-RON renderers should also expose typed value hooks for application-specific examples. Hooks map JSON values by path to replacement JSON values before RON formatting, so a string at `tx` can render as `{# BE}` by replacing it with `{"#":"BE"}`.

## Quick example

This RON uses top-level object elision, nested objects, arrays, booleans, null, numbers, bare strings, quoted strings, quoted keys, optional commas, comma-prefixed tokens, and punctuation-like strings.

```ron
active true
age 37
commaPrefixed [,foo]
commaToken [, x]
commas {
  a 1,
  b 2,
}
emptyArray []
emptyObject {}
id ?id
metadata {
  count 9223372036854775808
  nullValue null
  score -12.5e+2
}
name Ada
quoted {
  double ""a "quoted" phrase""
  empty ''
  single 'Ada Lovelace'
  withApostrophe ''it's fine''
}
'quoted key' 'quoted value'
ref {# 200}
roles [admin writer]
strings [hello 'true' '123' '#_tmp']
temp #_tmp
```

```json
{
  "active": true,
  "age": 37,
  "commaPrefixed": [
    ",foo"
  ],
  "commaToken": [
    ",",
    "x"
  ],
  "commas": {
    "a": 1,
    "b": 2
  },
  "emptyArray": [],
  "emptyObject": {},
  "id": "?id",
  "metadata": {
    "count": 9223372036854775808,
    "nullValue": null,
    "score": -12.5e+2
  },
  "name": "Ada",
  "quoted": {
    "double": "a \"quoted\" phrase",
    "empty": "",
    "single": "Ada Lovelace",
    "withApostrophe": "it's fine"
  },
  "quoted key": "quoted value",
  "ref": {
    "#": 200
  },
  "roles": [
    "admin",
    "writer"
  ],
  "strings": [
    "hello",
    "true",
    "123",
    "#_tmp"
  ],
  "temp": "#_tmp"
}
```

## Conformance

Use `testdata/conformance/manifest.json` as the test runner input. For each valid case:

1. Convert every `ronInputs[]` file to JSON.
2. Compare compact output with `expectedCompactJSON` if compact mode is supported.
3. Compare pretty output with canonical order against `expectedPrettyJSON` if pretty mode is supported.
4. Convert `jsonInput` to RON.
5. Compare pretty canonical RON with `expectedPrettyRON`.
6. Compare compact canonical RON with `expectedCompactRON` if compact mode is supported.
7. Hash compact canonical RON with unseeded XXH3-128 and compare lowercase hex with `expectedCanonicalRONXXH3`.
8. Parse generated RON back to JSON and compare JSON values, not text.
9. Run `jsonToRONRendering` cases for root object elision and typed value hooks when those hooks are supported.

For invalid cases, every `invalidRON[]` file must fail RON parsing and every `invalidJSON[]` file must fail JSON -> RON conversion.

Use `testdata/rfc8785/manifest.json` for RFC 8785 canonical JSON vectors. Implementations must exact-match canonical JSON bytes, expected UTF-8 hex when present, Appendix B number serialization samples, I-JSON rejection cases, and unseeded XXH3-128 hashes.
