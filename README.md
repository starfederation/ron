# RON

RON means Readable Object Notation.

This repository is the language-neutral reference for the RON format. RON keeps the JSON data model while making large JSON-shaped documents easier to write, easier to read, and cheaper in LLM tokens. It contains the format decision record, an implementation guide, and conformance fixtures for RON -> JSON and JSON -> RON conversion, including pretty-format golden files.

This RON is not [Rusty Object Notation](https://github.com/ron-rs/ron).

RON is also not [EDN](https://github.com/edn-format/edn), though it shares the same admiration for readable, data-first syntax. EDN is beautiful, but its native value model and language ecosystem do not map cleanly across JSON-first languages. RON is closer to `EDN--`: EDN-like readability with the non-JSON value space removed and exact JSON conversion as the contract.

## Contents

- `docs/ADR.md`: reference ADR for the format.
- `docs/implementation-guide.md`: parser, renderer, and formatter guidance for new implementations.
- `testdata/conformance/`: language-neutral fixture corpus with a manifest.

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
3. Compare pretty output with `expectedPrettyJSON` if pretty mode is supported.
4. Convert `jsonInput` to RON.
5. Compare pretty output with `expectedPrettyRON`.
6. Optionally compare compact output with `expectedCompactRON`.
7. Parse generated RON back to JSON and compare JSON values, not text.

For invalid cases, every `invalidRON[]` file must fail RON parsing and every `invalidJSON[]` file must fail JSON -> RON conversion.
