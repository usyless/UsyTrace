import express from 'express';

import * as common from './common.js'

const app = express();

const port = 8181;

app.use((req, res, next) => {
    res.set('Cross-Origin-Opener-Policy', 'same-origin');
    res.set('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
});

// Serve static files
app.use(express.static(common.DIST_DIR));

app.listen(port, () => {
    console.log(`Static server running at http://localhost:${port}`);
});