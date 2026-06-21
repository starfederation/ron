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

  const withClass = md.renderer.rules.fence([
    token("ron", "name Ada\n", [["class", "language-text"]]),
  ], 0, {}, {}, self);
  assert(withClass.includes("class=\"language-text hljs language-ron\""), "existing class not preserved");

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
checkMarkdownPlugin();
