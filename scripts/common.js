import path from "node:path";
import { fileURLToPath } from "node:url";

export const __dirname = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export const DIST_DIR = path.join(__dirname, "dist");
export const SRC_DIR = path.join(__dirname, "src");
export const BUILD_DIR = path.join(__dirname, "build");

export const SCRIPTS_DIR = path.join(__dirname, "scripts");

export const makeQuoted = (a) => `"${a}"`;

export const joinWith = (dir) => a => path.join(dir, a);
export const joinWithSrc = joinWith(SRC_DIR);
export const joinWithDist = joinWith(DIST_DIR);
export const joinWithScripts = joinWith(SCRIPTS_DIR);

export const joinWithQuoted = (jw) => a => makeQuoted(jw(a));

export const joinWithSrcQuoted = joinWithQuoted(joinWithSrc);
export const joinWithDistQuoted = joinWithQuoted(joinWithDist);
export const joinWithScriptsQuoted = joinWithQuoted(joinWithScripts);