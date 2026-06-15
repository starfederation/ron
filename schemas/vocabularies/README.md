# RON Vocabulary Schemas

JSON Schema Draft 2020-12 validation and codegen aids for official typed RON vocabularies.

Each `*.schema.json` file validates one full typed object, for example `{ "#uid": "..." }`. Each schema also exposes `#/$defs/payload` for code generators or validators that need only the tag payload shape.

Tuple schemas use `prefixItems` titles and descriptions for component names. Math payload schemas include neutral defaults such as zero vectors, identity matrices, and the identity quaternion.

These schemas are not the normative source for canonical rendering. `docs/vocabularies.md` remains authoritative for tag semantics, canonical forms, and validation rules that JSON Schema cannot express exactly.

Registry entries in `testdata/vocabularies/registry.json` use repository-root-relative paths into this directory.
