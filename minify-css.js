const fs = require('fs');

const args = process.argv.slice(2), argsLength = args.length;

const error = (...m) => {
    console.error('Minify CSS:', ...m);
    process.exit(1);
}

if (argsLength === 0) {
    console.log(`Enter input files using --in-css file1 file2 file3
Enter output file with --out-css fileName
Delete input files after minifying with --delete`);
    process.exit(1);
}

const files = [];
let outName = 'main.min.css';
let deleteAfter = false;

const isArgument = (arg) => arg.startsWith('--');
const argMap = { // return next arguments index
    '--in-css': (i) => { // receive first values index
        while (i < argsLength && !isArgument(args[i])) files.push(args[i++]);
        return i;
    },
    '--out-css': (i) => {
        if (i < argsLength && !isArgument(args[i])) {
            outName = args[i];
            return ++i;
        } else error('No name specified for --out-css');
    },
    '--delete': () => {
        deleteAfter = true;
    }
}

for (let i = 0; i < argsLength;) {
    const f = argMap[args[i]];
    if (f) i = f(++i) ?? i;
    else error(`Unrecognised argument: ${args[i]}`);
}

if (files.length === 0) error('No input files found, use --in-css');
if (!outName) error('Invalid name specified for output');

let minifiedCss = '';

for (const filename of files) {
    try {
        minifiedCss += fs.readFileSync(filename, 'utf8') + "\n";
    } catch (e) {
        error(`Error reading file ${filename}:`, e.message);
    }
}

minifiedCss = minifiedCss
    .replace(/^@import.*(?:;|[\r\n])/gm, '') // remove @import
    .replace(/[\r\n]/gm, '') // remove newlines
    .replaceAll('    ', '') // remove indentation
    .replaceAll(' {', '{') // remove extra space
    .replaceAll(': ', ':') // remove extra space
    .replaceAll(';}', '}'); // remove final semicolon

fs.writeFileSync(outName, minifiedCss, 'utf8');
console.log(`Successfully minified css into "${outName}".`);

if (deleteAfter) {
    console.log('Deleting minified files');
    for (const filename of files) fs.unlinkSync(filename);
}