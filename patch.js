const fs = require('fs');
const file = 'node_modules/@vladmandic/face-api/dist/face-api.node.js';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/require\(['"]@tensorflow\/tfjs-node['"]\)/g, "require('@tensorflow/tfjs')");
content = content.replace(/this\.util\.TextEncoder/g, 'TextEncoder');
content = content.replace(/this\.util\.TextDecoder/g, 'TextDecoder');
fs.writeFileSync(file, content);
