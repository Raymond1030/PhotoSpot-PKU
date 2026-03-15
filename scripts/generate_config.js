const fs = require('fs');
const path = require('path');

const ENV_FILE = path.join(__dirname, '../.env');
const OUTPUT_FILE = path.join(__dirname, '../js/config.js');

// 解析 .env 文件
function parseEnv(filePath) {
    if (!fs.existsSync(filePath)) {
        console.error(`[Config] 错误: 找不到 .env 文件，请先复制 .env.example 为 .env 并填入密钥`);
        process.exit(1);
    }
    const env = {};
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;
        const key = trimmed.slice(0, eqIndex).trim();
        const value = trimmed.slice(eqIndex + 1).trim();
        env[key] = value;
    }
    return env;
}

const env = parseEnv(ENV_FILE);

if (!env.MAPBOX_TOKEN || env.MAPBOX_TOKEN === 'your_mapbox_token_here') {
    console.error('[Config] 错误: 请在 .env 中填入有效的 MAPBOX_TOKEN');
    process.exit(1);
}

const configContent = `// 此文件由 scripts/generate_config.js 从 .env 自动生成，请勿手动编辑
const MAPBOX_TOKEN = '${env.MAPBOX_TOKEN}';
`;

fs.writeFileSync(OUTPUT_FILE, configContent);
console.log('[Config] 已从 .env 生成 js/config.js');
