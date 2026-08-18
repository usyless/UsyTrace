import express from 'express';
import fs from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import * as common from './common.js';
import { buildDist, buildCss, buildJs, mkdir } from './build.js';

process.on('SIGINT', () => {
    console.log('\nServer shutting down...');
    process.exit(0);
});
process.on('SIGTERM', () => {
    process.exit(0);
});

const debugMode = process.argv.includes('--debug');

const app = express();
const port = 8181;

app.use((req, res, next) => {
    res.set('Cross-Origin-Opener-Policy', 'same-origin');
    res.set('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
});

const sseClients = new Set();

app.get('/live-reload', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });
    res.write('\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
});

function triggerReload() {
    for (const client of sseClients) {
        client.write('data: reload\n\n');
    }
}

app.use(async (req, res, next) => {
    if (req.path === '/' || req.path === '/index.html') {
        try {
            const indexPath = path.join(common.DIST_DIR, 'index.html');
            let html = await fs.readFile(indexPath, 'utf-8');
            const reloadScript = `
            <script>
                (() => {
                    let es;
                    function connect() {
                        es = new EventSource('/live-reload');
                        es.onmessage = (e) => {
                            if (e.data === 'reload') {
                                console.log('[LiveReload] Change detected, reloading...');
                                location.reload();
                            }
                        };
                        es.onerror = () => {
                            es.close();
                            setTimeout(connect, 1000);
                        };
                    }
                    connect();
                })();
            </script>
            `;
            html = html.replace('</body>', `${reloadScript}</body>`);
            res.setHeader('Content-Type', 'text/html');
            return res.send(html);
        } catch (e) {
            return next();
        }
    }
    next();
});

app.use(express.static(common.DIST_DIR));

await mkdir(common.DIST_DIR);
try {
    console.log(`[Build] Running initial ${debugMode ? 'debug' : 'release'} build...`);
    await buildDist();
    buildCss(debugMode);
    buildJs(debugMode);
    console.log('[Build] Initial build complete.\n');
} catch (err) {
    console.error('[Build Error]', err);
}

app.listen(port, () => {
    console.log(`Static server running at http://localhost:${port}`);
    console.log(`Auto-reloading enabled (watching src/ directory)\n`);
});

let changeTimer = null;
const changedFiles = new Set();

try {
    watch(common.SRC_DIR, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        changedFiles.add(filename);

        clearTimeout(changeTimer);
        changeTimer = setTimeout(async () => {
            const files = Array.from(changedFiles);
            changedFiles.clear();

            console.log(`[Watch] Changes detected in: ${files.join(', ')}`);

            try {
                const hasJs = files.some(f => f.endsWith('.js'));
                const hasCss = files.some(f => f.endsWith('.css'));
                const hasStatic = files.some(f => f.endsWith('.html') || f.endsWith('.svg') || f.endsWith('.ico') || f.endsWith('.webmanifest') || f.includes('assets') || f.includes('tesseract'));

                if (hasStatic) await buildDist();
                if (hasCss) buildCss(debugMode);
                if (hasJs) buildJs(debugMode);

                console.log('[Watch] Rebuild successful. Triggering live reload...');
                triggerReload();
            } catch (err) {
                console.error('[Watch Rebuild Error]', err);
            }
        }, 150);
    });
} catch (err) {
    console.warn('[Watch] Failed to initialize recursive file watcher:', err.message);
}