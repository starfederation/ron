"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifest = require(path.join(root, "package.json"));
const outDir = path.join(root, "dist");
const outPath = path.join(outDir, `${manifest.name}-${manifest.version}.vsix`);

fs.mkdirSync(outDir, { recursive: true });

const result = spawnSync("vsce", ["package", "--no-dependencies", "--out", outPath], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
