# RON Typed Vocabularies

RON's base data model is JSON: null, booleans, numbers, strings, arrays, and objects with string keys. Typed vocabularies are an optional semantic layer over that model. They let independent implementations agree that a JSON/RON shape such as `{#utc 2026-06-13T00:00:00Z}` means a UTC instant, while still preserving exact JSON compatibility.

A typed value is encoded as a single-key object whose key starts with `#`.

```ron
created {#utc 2026-06-13T00:00:00Z}
elapsed {#dur PT1H30M}
id {#uid 00112233-4455-6677-8899-aabbccddeeff}
```

The equivalent JSON is ordinary JSON:

```json
{
  "created": {"#utc": "2026-06-13T00:00:00Z"},
  "elapsed": {"#dur": "PT1H30M"},
  "id": {"#uid": "00112233-4455-6677-8899-aabbccddeeff"}
}
```

## Goals

- Keep base RON JSON-compatible.
- Give code generators stable names, payload shapes, and validation rules.
- Let implementations opt into the vocabularies they understand.
- Preserve unknown typed values as ordinary JSON/RON when interpretation is not required.
- Make common domain values compact and consistent in RON without project-local post-processing.

## Vocabulary profiles

A vocabulary profile declares which typed vocabularies a context requires. The shape intentionally mirrors JSON Schema's required/optional vocabulary idea without putting declarations inside every RON document.

```json
{
  "vocabularies": {
    "https://ron.dev/vocab/core/v1": true,
    "https://ron.dev/vocab/time/v1": true,
    "https://ron.dev/vocab/math/v1": false,
    "https://ron.dev/vocab/geo/v1": false,
    "https://example.com/vocab/invoice/v1": false
  }
}
```

Interpretation:

- `true`: the consumer must understand this vocabulary to process the document as typed data.
- `false`: the consumer may understand this vocabulary, but may also preserve matching values as ordinary JSON/RON.
- Missing or unknown vocabularies are not base RON errors.
- A base RON parser does not need vocabulary support.

A vocabulary-aware decoder may interpret an object as typed only when all of these are true:

1. The object has exactly one member.
2. The member key starts with `#`.
3. The key is defined by an enabled vocabulary.
4. The payload validates against the tag's payload contract.

Otherwise the object remains an ordinary JSON object.

## Tag naming

Official tags are terse, stable, and registry-backed. The wire form optimizes RON size; the registry supplies readable type names for docs and codegen:

```text
#utc
#dur
#uid
#lla
#m4x
```

Canonical output should use these terse official tags. Implementations may expose readable API names such as `Time`, `Duration`, or `UUID`; those names belong in code, not in the wire tag.

Custom tags must be namespaced to avoid collisions. Use reverse-DNS plus a slash:

```text
#com.example/money
#org.example/warehouseLocation
```

The `ron.dev` namespace and unqualified tag names without a slash are reserved for official vocabularies.

## Canonical payload rules

Typed payloads should have one canonical representation:

- Prefer strings for values whose exact lexical form matters, such as decimal, time, duration, UUID, bytes, and network addresses.
- Prefer arrays for fixed-size numeric tuples.
- Prefer strings for fixed-width integers that can exceed the IEEE 754 safe integer range.
- Prefer finite JSON numbers for IEEE 754 numeric geometry/math payloads.
- Do not use object payloads unless member names materially improve stability or future compatibility.
- Avoid polymorphic payloads in official tags. If a tag needs multiple variants, include a discriminant as the first array element.

## Registry and schema files

The prose in this document is the normative reference. `testdata/vocabularies/registry.json` mirrors the official tag list in a compact machine-readable shape for code generators and test harnesses. Registry `schema` and `payloadSchema` paths are repository-root relative and point into `schemas/vocabularies/`.

Each official tag has a JSON Schema Draft 2020-12 file under `schemas/vocabularies/<vocabulary>/<tag>.schema.json`. A tag schema validates the full typed object, and its `$defs.payload` definition validates just the payload. Tuple schemas use `prefixItems` titles and descriptions for component names. Math schemas include neutral defaults such as zero vectors, identity matrices, and `{#qat [0 0 0 1]}`. Schemas are validation and codegen aids; canonical forms and semantic rules remain defined by this document and by fixtures. If the prose, registry, and schemas disagree, treat the prose as authoritative and fix the generated aids.

## Official vocabularies

### Core vocabulary

URI: `https://ron.dev/vocab/core/v1`

| Tag | Type | Payload | Canonical form | Example |
| --- | --- | --- | --- | --- |
| `#uid` | UUID | string | lowercase dashed UUID text; no version restriction | `{#uid 00112233-4455-6677-8899-aabbccddeeff}` |
| `#url` | URL | string | absolute URL string; no normalization beyond validation | `{#url https://example.com/docs?q=ron#intro}` |
| `#dec` | Decimal | string | finite base-10 decimal, no exponent, no plus, no redundant trailing fraction zeroes | `{#dec '123.45'}` |
| `#b64` | Bytes | string | RFC 4648 base64url without padding | `{#b64 3q2-7w}` |
| `#sha256` | SHA256 | string | 64 lowercase hex characters | `{#sha256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855}` |
| `#` | EntityRef | integer or string | database key / entity reference id | `{# 300}` |
| `#tag` | OpaqueTag | array `[tag, payload]` | custom tag id plus implementation-defined payload | `{#tag [127 {mode raw value [1 2 3]}]}` |

`#` is the database key / entity reference tag. Leave it as the short form because references are common and existing RON data uses it pervasively. Implementations should document their key domain, such as SQLite rowid, signed 64-bit integer, unsigned 64-bit sequence id, or external string key. Use an integer payload when the implementation can preserve it exactly. Use a string payload when the key can exceed JSON-safe integer range or is not numeric. Code generators should map `#` to a distinct reference type, not to a plain number.

`#url` validates that the payload is an absolute URL. URL normalization is application-specific; canonical RON preserves the payload string supplied by the vocabulary-aware renderer.

`#tag` is an escape hatch for implementation-defined tagged values. The second array element is any JSON/RON value whose validity is defined by the custom implementation; it is not required to be base64 or binary. Prefer a namespaced custom tag when the value has documented semantics.

### Time vocabulary

URI: `https://ron.dev/vocab/time/v1`

| Tag | Type | Payload | Canonical form | Example |
| --- | --- | --- | --- | --- |
| `#utc` | Instant | string | RFC 3339 UTC instant with `Z`; omit fractional seconds when zero; otherwise trim trailing fractional zeroes | `{#utc 2026-06-13T00:00:00Z}` |
| `#dur` | Duration | string | restricted ISO 8601 day-time duration; optional leading `-`; no years or months | `{#dur PT1H30M}` |

`#utc` rules:

- Use uppercase `T` and `Z`.
- Normalize offsets to UTC `Z` before canonical output.
- Fractional seconds may have 1 to 9 digits.
- Omit fractional seconds when the fraction is zero.
- Reject invalid dates and leap seconds in typed decoders.

`#dur` rules:

- Use day-time duration syntax only: `P[nD][T[nH][nM][n[.fraction]S]]`.
- Years and months are not allowed because their exact duration depends on calendar context.
- Weeks are not allowed in canonical output.
- At least one component must be present.
- Use up to 9 fractional second digits and trim trailing zeroes.
- `PT0S` is the canonical zero duration.

### Network vocabulary

URI: `https://ron.dev/vocab/network/v1`

| Tag | Type | Payload | Canonical form | Example |
| --- | --- | --- | --- | --- |
| `#ip4` | IPv4 | string | dotted decimal IPv4 | `{#ip4 192.0.2.1}` |
| `#ip6` | IPv6 | string | RFC 5952 IPv6 text | `{#ip6 2001:db8::1}` |
| `#cdr` | CIDR | string | masked CIDR prefix | `{#cdr 192.0.2.0/24}` |

### Math vocabulary

URI: `https://ron.dev/vocab/math/v1`

Float payloads use finite JSON numbers. Scalar fixed-width integer payloads use canonical base-10 integer strings so values outside the IEEE 754 safe integer range survive common JSON tooling. Integer vector payloads use JSON integer numbers. Variable-dimensional vectors use `#ivN` and `#vN`; fixed-dimensional aliases exist for common codegen targets and must have exactly the documented length.

| Tag | Type | Payload | Example |
| --- | --- | --- | --- |
| `#i64` | Int64 | canonical base-10 integer string in `[-9223372036854775808, 9223372036854775807]` | `{#i64 '-42'}` |
| `#u64` | Uint64 | canonical base-10 integer string in `[0, 18446744073709551615]` | `{#u64 '300'}` |
| `#f64` | Float64 | finite IEEE 754 double | `{#f64 42.5}` |
| `#ivN` | IntVectorN | variable-length array of JSON integer numbers | `{#ivN [10 20 30 40]}` |
| `#vN` | VectorN | variable-length array of finite floats | `{#vN [0.25 0.5 0.75 1]}` |
| `#iv2` / `#iv3` / `#iv4` | IntVector2 / IntVector3 / IntVector4 | fixed arrays of JSON integer numbers | `{#iv3 [1 2 3]}` |
| `#f2v` / `#f3v` / `#f4v` | Vector2 / Vector3 / Vector4 | fixed float arrays | `{#f3v [1.5 2.5 3.5]}` |
| `#qat` | Quaternion | `[x, y, z, w]` | `{#qat [0 0 0 1]}` |
| `#eul` | Euler | `[x, y, z, order]` where order is `XYZ`, `YXZ`, `ZXY`, `ZYX`, `YZX`, or `XZY` | `{#eul [0 0 0 XYZ]}` |
| `#m2x` | Matrix2 | 4 floats, column-major | `{#m2x [1 0 0 1]}` |
| `#m3x` | Matrix3 | 9 floats, column-major | `{#m3x [1 0 0 0 1 0 0 0 1]}` |
| `#m4x` | Matrix4 | 16 floats, column-major | `{#m4x [1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1]}` |

Column-major matrix order matches WebGL and three.js element order.

### Spatial vocabulary

URI: `https://ron.dev/vocab/spatial/v1`

Spatial payloads use meters for distances unless a tag states otherwise. Coordinate arrays use `[x, y]`, `[x, y, z]`, or `[longitudeDegrees, latitudeDegrees, altitudeMeters]` as documented.

| Tag | Type | Payload | Example |
| --- | --- | --- | --- |
| `#lla` | LngLatAlt | `[longitudeDegrees, latitudeDegrees, altitudeMeters]` | `{#lla [-73.9857 40.7484 381]}` |
| `#sph` | Spherical | `[radius, phi, theta]` | `{#sph [1 0 0]}` |
| `#cyl` | Cylindrical | `[radius, theta, y]` | `{#cyl [1 0 2]}` |
| `#bx2` | Box2 | `[minVec2, maxVec2]` | `{#bx2 [[0 0] [10 10]]}` |
| `#bx3` | Box3 | `[minVec3, maxVec3]` | `{#bx3 [[0 0 0] [10 10 10]]}` |
| `#spr` | Sphere | `[centerVec3, radius]` | `{#spr [[0 0 0] 1]}` |
| `#pln` | Plane | `[normalVec3, constant]` | `{#pln [[0 1 0] 0]}` |
| `#ray` | Ray | `[originVec3, directionVec3]` | `{#ray [[0 0 0] [0 0 1]]}` |
| `#ln2` | Line2 | `[startVec2, endVec2]` | `{#ln2 [[0 0] [1 1]]}` |
| `#ln3` | Line3 | `[startVec3, endVec3]` | `{#ln3 [[0 0 0] [1 1 1]]}` |
| `#tri` | Triangle | `[aVec3, bVec3, cVec3]` | `{#tri [[0 0 0] [1 0 0] [0 1 0]]}` |
| `#fru` | Frustum | six `#pln` payload arrays | `{#fru [[[1 0 0] 1] [[-1 0 0] 1] [[0 1 0] 1] [[0 -1 0] 1] [[0 0 1] 1] [[0 0 -1] 1]]}` |
| `#sh3` | SphericalHarmonics3 | nine Vec3 coefficient arrays | `{#sh3 [[0 0 0] [0 0 0] [0 0 0] [0 0 0] [0 0 0] [0 0 0] [0 0 0] [0 0 0] [0 0 0]]}` |
| `#vox` | VoxelSet | object payload with `dimensions`, `origin`, `cellSize`, and sparse `cells` | see below |

Sparse voxel data should use `#vox` when the values are cell-like samples on an integer lattice. The payload is an object:

- `dimensions`: positive integer dimension count. Use `3` for ordinary voxels; higher dimensions are allowed for simulation grids.
- `origin`: `#vN` payload giving world-space origin per dimension.
- `cellSize`: `#vN` payload giving cell size per dimension.
- `cells`: array of `[coordinate, value]` pairs. Coordinates are raw arrays with length equal to `dimensions`; values are any JSON/RON value, including typed values. Coordinate elements are JSON integer numbers.

Example:

```ron
{#vox {
  cellSize {#vN [1 1 1]}
  cells [
    [[0 0 0] 1]
    [[1 0 0] {#clr [oklch 0.7 0.15 230]}]
  ]
  dimensions 3
  origin {#vN [0 0 0]}
}}
```

Dense voxel volumes should usually be a custom vocabulary because compression, storage order, chunking, and element type depend heavily on the application.


### Geo vocabulary

URI: `https://ron.dev/vocab/geo/v1`

| Tag | Type | Payload | Canonical form | Example |
| --- | --- | --- | --- | --- |
| `#geo` | GeoJSON | GeoJSON object | RFC 7946 GeoJSON Geometry, Feature, or FeatureCollection | `{#geo {type Point coordinates [-73.9857 40.7484]}}` |

Everything under `#geo` follows GeoJSON semantics:

- `type` determines the GeoJSON kind: `Point`, `MultiPoint`, `LineString`, `MultiLineString`, `Polygon`, `MultiPolygon`, `GeometryCollection`, `Feature`, or `FeatureCollection`.
- Coordinates are `[longitudeDegrees, latitudeDegrees]` or `[longitudeDegrees, latitudeDegrees, altitudeMeters]`.
- Coordinate reference system is WGS84 per RFC 7946. Custom CRS values are not part of this vocabulary.
- `bbox` is allowed.
- Foreign members are preserved.
- `Feature.properties` is arbitrary JSON. Typed RON values inside properties remain ordinary JSON objects unless another enabled vocabulary interprets them.
- `#geo` codegen should map to a GeoJSON union type, not to one concrete geometry type.

### Color vocabulary

URI: `https://ron.dev/vocab/color/v1`

| Tag | Type | Payload | Canonical form | Example |
| --- | --- | --- | --- | --- |
| `#clr` | Color | `[space, components...]` | space-specific tuple; preserve the selected supported space | `{#clr [rgba 0.1 0.2 0.3 0.5]}` |

Supported color spaces are `rgb`, `rgba`, `hsl`, `hsla`, `hsv`, `hsva`, `hwb`, `hwba`, `lab`, `laba`, `lch`, `lcha`, `oklab`, `oklaba`, `oklch`, `oklcha`, `xyz`, and `xyza`. `rgb` and `rgba` use sRGB channels normalized to `[0, 1]`. `hsl`, `hsv`, and `hwb` use hue degrees followed by normalized components. Alpha variants append an alpha channel normalized to `[0, 1]`. `lab`, `lch`, `oklab`, `oklch`, and `xyz` use their conventional component order; `lch` and `oklch` hue is degrees.

Future color spaces may be added by extending the `space` discriminant. Implementations that do not understand a color space must preserve the value or reject it according to the profile.

## Further exploration

Several well-known JSON formats may deserve official vocabularies later, but are intentionally not frozen in this version:

- JSON Schema.
- JSON Pointer.
- JSON Patch.
- JSON Merge Patch.
- JSONPath.
- JSON-LD.
- JSON Web Key and JSON Web Key Set.
- Problem Details.
- OpenAPI.
- Media types, language tags, semantic versions, cron expressions, Markdown, and URI Templates.

For now, represent these through plain JSON/RON or a namespaced custom vocabulary. Promote one to an official vocabulary only when payload rules, canonical form, codegen shape, and interoperability tests are clear.

## Custom vocabularies

A custom vocabulary must publish:

- A stable vocabulary URI.
- The tag names it owns. Custom tags should be namespaced, for example `#com.example/money`.
- A payload schema for each tag, preferably JSON Schema.
- A canonical payload form.
- At least one JSON and RON example per tag.
- Codegen hints: type name, package/module name, and whether the generated type is scalar, tuple, record, or opaque.
- Compatibility policy for unknown future tags.

Example custom tag:

```json
{
  "#com.example/money": ["USD", "123.45"]
}
```

```ron
{#com.example/money [USD '123.45']}
```
