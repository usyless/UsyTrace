import fs from 'fs';
import https from 'https';
import path from 'path';

import { SRC_DIR } from "./common.js";

const tesseractVersion = '7.0.0';
const tesseractURL = 'https://cdn.jsdelivr.net/npm/tesseract.js@';
const tesseractCoreURL = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@';

const files = [
    {
        url: `${tesseractURL}${tesseractVersion}/dist/tesseract.min.js`,
        file: 'tesseract/tesseract.min.js',
    },
    {
        url: `${tesseractURL}${tesseractVersion}/dist/worker.min.js`,
        file: 'tesseract/worker.min.js',
    },

    {
        url: `${tesseractCoreURL}${tesseractVersion}/tesseract-core.wasm.js`,
        file: 'tesseract/tesseract-core.wasm.js',
    },
    {
        url: `${tesseractCoreURL}${tesseractVersion}/tesseract-core-simd.wasm.js`,
        file: 'tesseract/tesseract-core-simd.wasm.js',
    },
    {
        url: `${tesseractCoreURL}${tesseractVersion}/tesseract-core-lstm.wasm.js`,
        file: 'tesseract/tesseract-core-lstm.wasm.js',
    },
    {
        url: `${tesseractCoreURL}${tesseractVersion}/tesseract-core-simd-lstm.wasm.js`,
        file: 'tesseract/tesseract-core-simd-lstm.wasm.js',
    },

    {
        url: `${tesseractCoreURL}${tesseractVersion}/tesseract-core-relaxedsimd.wasm.js`,
        file: 'tesseract/tesseract-core-relaxedsimd.wasm.js',
    },
    {
        url: `${tesseractCoreURL}${tesseractVersion}/tesseract-core-relaxedsimd-lstm.wasm.js`,
        file: 'tesseract/tesseract-core-relaxedsimd-lstm.wasm.js',
    },

    {
        url: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
        file: 'tesseract/eng.traineddata.gz'
    },
];

for (const {url, file} of files) {
    const p = path.join(SRC_DIR, file);
    fs.mkdir(path.dirname(p), () => {
        const f = fs.createWriteStream(p);

        https.get(url, (response) => {
            response.pipe(f);
            f.on('finish', () => {
                f.close();
                console.log(`Finished downloading ${file}`);
            });
        }).on('error', (err) => {
            fs.unlink(p, () => {});
            console.error(`Failed to download ${file}: `, err.message);
        });
    });
}
