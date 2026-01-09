#!/usr/bin/env node

import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { chdir, cwd } from 'node:process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const MINIFIED_JS_FILES = [
    "state.js", "main.js", "popups.js", "tutorial.js",
    "about.js", "updater.js", "themes.js"
];

const MINIFIED_CSS_FILES = [
    "main.css", "popup.css", "tutorial.css", "shared.css"
];

const DIST_DIRS = [
    "assets"
];

const DIST_FILES = [
    "favicon.ico", "favicon.svg", "index.html", 
    "service-worker.js", "usytrace.webmanifest"
];

const DIST_DIR = "dist";
const SRC_DIR = "src";
const BUILD_DIR = "build";
const OUTPUT_DIR = `../${DIST_DIR}`;

function run(cmd, options = {}) {
    console.log(`> ${cmd}`);
    execSync(cmd, { stdio: "inherit", ...options });
}

async function mkdir(dir) {
    try {
        await fs.mkdir(dir, { recursive: true });
    } catch {
        // ignore if exists
    }
}

async function buildDist() {
    console.log("\nMoving Static Files\n");
    chdir(SRC_DIR);

    const _cwd = cwd();

    await Promise.all([
        ...[DIST_DIRS.map(dir => fs.cp(path.join(_cwd, dir), path.join(DIST_DIR, path.basename(dir)), { recursive: true, force: true }))],
        ...[DIST_FILES.map(file => fs.cp(path.join(_cwd, file), path.join(DIST_DIR, path.basename(file)), { force: true }))]
    ]);

    chdir("..");
}

function buildCss() {
    console.log("\nMinifying CSS\n");
    chdir(SRC_DIR);
    run(
        `node ../minify-css.js --in-css ${MINIFIED_CSS_FILES.join(" ")} --out-css "${OUTPUT_DIR}/main.min.css"`
    );
    chdir("..");
}

function buildJs() {
    console.log("\nCompiling JS\n");
    chdir(SRC_DIR);
    run(
        `npx -y google-closure-compiler ` +
        `--language_in=ECMASCRIPT_2020 --language_out=ECMASCRIPT_2020 ` +
        `--compilation_level ADVANCED ` +
        `--js ${MINIFIED_JS_FILES.join(" ")} ` +
        `--js_output_file "${OUTPUT_DIR}/main.min.js"`
    );
    chdir("..");
}

async function buildWasm(debugMode) {
    console.log(`\nCompiling ${debugMode ? "debug" : "release"} wasm\n`);

    await mkdir(BUILD_DIR);
    chdir(BUILD_DIR);

    if (debugMode) {
        run(`emcmake cmake -DCMAKE_BUILD_TYPE=Debug ..`);
        run(`cmake --build . --config Debug`);
    } else {
        run(`emcmake cmake -DCMAKE_BUILD_TYPE=Release ..`);
        run(`cmake --build . --config Release`);
    }

    chdir("..");
}

const args = process.argv.slice(2);

let DEBUG_MODE = false;
let COMPILE_ALL = true;
let DO_WASM = false;
let DO_JS = false;
let DO_CSS = false;
let DO_DIST = false;

for (const arg of args) {
    if (arg === "--debug") {
        DEBUG_MODE = true;
    } else if (arg === "--js") {
        COMPILE_ALL = false;
        DO_JS = true;
    } else if (arg === "--css") {
        COMPILE_ALL = false;
        DO_CSS = true;
    } else if (arg === "--wasm") {
        COMPILE_ALL = false;
        DO_WASM = true;
    } else if (arg === "--dist") {
        COMPILE_ALL = false;
        DO_DIST = true;
    }
}

await (async () => {
    chdir(__dirname);
    await mkdir(DIST_DIR);

    console.log("\nBuilding\n");

    if (COMPILE_ALL) {
        await buildWasm(DEBUG_MODE);
        buildJs();
        buildCss();
        await buildDist();
    } else {
        if (DO_WASM) await buildWasm(DEBUG_MODE);
        if (DO_JS) buildJs();
        if (DO_CSS) buildCss();
        if (DO_DIST) await buildDist();
    }

    console.log("\nBuild Finished\n");
})();
