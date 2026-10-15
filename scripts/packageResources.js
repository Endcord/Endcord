const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const dist = path.join(__dirname, '../dist');
const outDir = path.join(__dirname, '../dist_compressed');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const files = ['patcher.js', 'preload.js', 'renderer.js', 'renderer.css'];

files.forEach(f => {
    const rawPath = path.join(dist, f);
    if (fs.existsSync(rawPath)) {
        const raw = fs.readFileSync(rawPath);
        const compressed = zlib.gzipSync(raw, { level: 9 });
        fs.writeFileSync(path.join(outDir, f + '.gz'), compressed);
    }
});
console.log('✅ Resources GZipped successfully (unmasked standard gzip)!');

