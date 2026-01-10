import express from 'express';
import path from 'node:path';
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const app = express();

const port = 8181;
const srcDir = path.join(__dirname, 'dist');

app.use((req, res, next) => {
    res.set('Cross-Origin-Opener-Policy', 'same-origin');
    res.set('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
});

// Serve static files
app.use(express.static(srcDir));

app.listen(port, () => {
    console.log(`Static server running at http://localhost:${port}`);
});