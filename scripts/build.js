#!/usr/bin/env node

import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import * as common from './common.js'


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

function run(cmd, options = {}) {
    console.log(`> ${cmd}`);
    execSync(cmd, { stdio: "inherit", ...options });
}

function debugString(debugMode) {
    return debugMode ? "debug" : "release";
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
    await Promise.all([
        ...DIST_DIRS.map(dir => fs.cp(common.joinWithSrc(dir), common.joinWithDist(dir), { recursive: true, force: true })),
        ...DIST_FILES.map(file => fs.cp(common.joinWithSrc(file), common.joinWithDist(file), { force: true }))
    ]);
}

function buildCss(debugMode) {
    console.log(`\nMinifying ${debugString(debugMode)} CSS\n`);
    run(
        `node ${common.joinWithScriptsQuoted("minify-css.js")}${debugMode ? " --debug" : ""} ` +
        `--in-css ${MINIFIED_CSS_FILES.map(common.joinWithSrcQuoted).join(" ")} ` +
        `--out-css ${common.joinWithDistQuoted("main.min.css")}`
    );
}

function buildJs(debugMode) {
    console.log(`\nCompiling ${debugString(debugMode)} JS\n`);
    run(
        `npx -y google-closure-compiler ` +
        `--language_in=ECMASCRIPT_2020 --language_out=ECMASCRIPT_2020 ` +
        `--compilation_level ${debugMode ? "SIMPLE" : "ADVANCED"} ` +
        `--js ${MINIFIED_JS_FILES.map(common.joinWithSrcQuoted).join(" ")} ` +
        `--js_output_file ${common.joinWithDistQuoted("main.min.js")}`
    );
}

async function buildWasm(debugMode) {
    console.log(`\nCompiling ${debugString(debugMode)} wasm\n`);

    await mkdir(common.BUILD_DIR);

    const build_type = (debugMode) ? "Debug" : "Release";

    run(
        `emcmake cmake ` +
        `-DCMAKE_EXPORT_COMPILE_COMMANDS=OFF ` +
        `-DCMAKE_BUILD_TYPE=${build_type} ` +
        `${common.makeQuoted(common.__dirname)} ` +
        `-B ${common.makeQuoted(common.BUILD_DIR)}`
    );
    run(
        `cmake --build ` +
        `${common.makeQuoted(common.BUILD_DIR)} ` +
        `--config ${build_type}`
    );
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
    } else {
        console.warn("Unrecognised argument: ", arg);
    }
}

await (async () => {
    await mkdir(common.DIST_DIR);

    console.log("\nBuilding\n");
    console.log("Possible args: --debug --js --css --wasm --dist\n");

    if (COMPILE_ALL || DO_WASM) await buildWasm(DEBUG_MODE);
    if (COMPILE_ALL || DO_JS) buildJs(DEBUG_MODE);
    if (COMPILE_ALL || DO_CSS) buildCss(DEBUG_MODE);
    if (COMPILE_ALL || DO_DIST) await buildDist(DEBUG_MODE);

    console.log("\nBuild Finished\n");
})();
