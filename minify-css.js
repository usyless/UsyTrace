const fs = require('fs');

const args = process.argv.slice(2), argsLength = args.length;

if (argsLength === 0) {
  console.log(`Enter input files using --in-css file1 file2 file3
Enter output file with --out-css fileName
Delete input files after minifying with --delete`);
  process.exit(1);
}

const files = [];
let outName = 'main.min.css';
let deleteAfter = false;

const validArguments = ['--in-css', '--out-css', '--delete'];
const isArgument = (arg) => validArguments.includes(arg);
for (let i = 0; i < argsLength; ++i) {
  if (args[i] === '--in-css') {
    ++i;
    while (i < argsLength && !isArgument(args[i])) files.push(args[i++]);
    --i; // move back on the last one
  } else if (args[i] === '--out-css') {
    if (++i < argsLength && !isArgument(args[i])) outName = args[i];
    else console.error('No name specified for --out-css');
  } else if (args[i] === '--delete') {
    deleteAfter = true;
  } else {
    console.error(`Unrecognised argument: ${args[i]}`);
    process.exit(1);
  }
}

const importRegex = /^@import.*(?:;|[\r\n])/gm;

let minifiedCss = '';

for (const filename of files) {
  try {
    minifiedCss += fs.readFileSync(filename, 'utf8').replace(importRegex, '') + "\n";
    if (deleteAfter) fs.unlinkSync(filename);
  } catch (e) {
    console.log(`Error reading file ${filename}:`, e.message);
  }
}

// remove most whitespace
minifiedCss = minifiedCss
    .replace(/[\r\n]/gm, '')
    .replaceAll('    ', '')
    .replaceAll(' {', '{')
    .replaceAll(': ', ':')
    .replaceAll(';}', '}');

fs.writeFileSync(outName, minifiedCss, 'utf8');
console.log(`Successfully minified css into "${outName}".`);
