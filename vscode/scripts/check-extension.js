"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function readJSON(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertFile(relativePath) {
  assert(fs.existsSync(path.join(root, relativePath)), `missing ${relativePath}`);
}

function checkManifestPaths() {
  const manifest = readJSON("package.json");
  for (const language of manifest.contributes.languages) {
    if (language.configuration) {
      assertFile(language.configuration);
    }
  }
  for (const grammar of manifest.contributes.grammars) {
    assertFile(grammar.path);
  }
  for (const stylePath of manifest.contributes["markdown.previewStyles"]) {
    assertFile(stylePath);
  }
}

function checkLanguageRegistration() {
  const manifest = readJSON("package.json");
  const extensions = manifest.contributes.languages.flatMap((language) => language.extensions || []);
  assert(!extensions.includes(".nd" + "ron"), "removed extension remains registered");
}

function fakeRendererToken(expected) {
  return function renderToken() {
    return expected;
  };
}

function fakeRenderAttrs({ attrs }) {
  return attrs.map(([name, value]) => ` ${name}="${value}"`).join("");
}

function token(info, content, attrs) {
  return {
    info,
    content,
    attrs,
    attrIndex(name) {
      return this.attrs ? this.attrs.findIndex(([attrName]) => attrName === name) : -1;
    },
  };
}

function checkMarkdownPlugin() {
  const extension = require(path.join(root, "extension.js"));
  const md = { renderer: { rules: {} } };
  extension.activate().extendMarkdownIt(md);

  const self = {
    renderAttrs: fakeRenderAttrs,
    renderToken: fakeRendererToken("default fence"),
  };

  const rendered = md.renderer.rules.fence([
    token("ron", "active true\nref {# 200}\nurl {#url https://example.com}\nleadingZero 01\nunsafe <tag>\n"),
  ], 0, {}, {}, self);

  assert(rendered.includes("class=\"hljs language-ron\""), "missing RON markdown class");
  assert(rendered.includes("ron-literal"), "missing literal highlight");
  assert(rendered.includes("ron-tag"), "missing tag highlight");
  assert(rendered.includes('<span class="ron-ident">01</span>'), "leading-zero strings should not be highlighted as numbers");
  assert(rendered.includes("&lt;tag&gt;"), "missing HTML escaping");

  const escaped = md.renderer.rules.fence([
    token("ron", "bare a\\\"b\nquoted \"a\\\"b\"\nline a\\nb\n"),
  ], 0, {}, {}, self);
  assert(escaped.includes('<span class="ron-ident">a\\\"b</span>'), "escaped quote split a bare string");
  assert(escaped.includes('<span class="ron-string">\"a\\\"b\"</span>'), "escaped quote closed a quoted string");
  assert(escaped.includes('<span class="ron-ident">a\\nb</span>'), "escaped control split a bare string");

  const edgeStrings = md.renderer.rules.fence([
    token("ron", "empty ''\nunicode [a\u00a0b]\nrawDouble 'a\"b'\nrepeatedDouble \"\"\"a \"quoted\" phrase\"\"\"\nclosingDouble \"\"\"a\"\"\" tail\nescapedDouble 'a\\\"b'\nrawLF 'a\nb'\n"),
  ], 0, {}, {}, self);
  assert(edgeStrings.includes('<span class="ron-string">\'\'</span>'), "empty string split into apostrophe tokens");
  assert(edgeStrings.includes('<span class="ron-ident">a</span>\u00a0<span class="ron-ident">b</span>'), "Unicode whitespace did not split tokens");
  assert(edgeStrings.includes('<span class="ron-string">\'a\"b\'</span>'), "raw double quote split an apostrophe string");
  assert(edgeStrings.includes('<span class="ron-string">\"\"\"a \"quoted\" phrase\"\"\"</span>'), "short quote runs split an N-quoted string");
  assert(edgeStrings.includes('<span class="ron-string">\"\"\"a\"\"\"</span> <span class="ron-ident">tail</span>'), "full delimiter run did not close an N-quoted string");
  assert(edgeStrings.includes('<span class="ron-string">\'a\\\"b\'</span>'), "escaped double quote closed an apostrophe string");
  assert(edgeStrings.includes('<span class="ron-invalid">\'a\nb\'</span>'), "raw control not marked invalid");

  const invalidBare = md.renderer.rules.fence([
    token("ron", "unknown a\\q\ncontrol a\u001eb\nsurrogate \\uD800\npair \\uD83D\\uDE00\n"),
  ], 0, {}, {}, self);
  assert(invalidBare.includes('<span class="ron-invalid">a\\q</span>'), "unknown bare escape not marked invalid");
  assert(invalidBare.includes('<span class="ron-invalid">a\u001eb</span>'), "raw bare control not marked invalid");
  assert(invalidBare.includes('<span class="ron-invalid">\\uD800</span>'), "unpaired surrogate not marked invalid");
  assert(invalidBare.includes('<span class="ron-ident">\\uD83D\\uDE00</span>'), "valid surrogate pair marked invalid");

  const withClass = md.renderer.rules.fence([
    token("ron", "name Ada\n", [["class", "language-text"]]),
  ], 0, {}, {}, self);
  assert(withClass.includes("class=\"language-text hljs language-ron\""), "existing class not preserved");

  const removedFenceOutput = md.renderer.rules.fence([
    token("nd" + "ron", "id 1\n"),
  ], 0, {}, {}, self);
  assert(removedFenceOutput === "default fence", "removed fence did not use default renderer");

  const fallback = md.renderer.rules.fence([
    token("json", "{\"a\":1}\n"),
  ], 0, {}, {}, self);
  assert(fallback === "default fence", "non-RON fence did not use default renderer");
}

readJSON("package.json");
readJSON("language-configuration.json");
readJSON("syntaxes/ron.tmLanguage.json");
readJSON("syntaxes/markdown-ron-fence.tmLanguage.json");
checkManifestPaths();
checkLanguageRegistration();
checkMarkdownPlugin();
