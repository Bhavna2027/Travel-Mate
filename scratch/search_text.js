const fs = require('fs');
const path = require('path');

const query = process.argv[2];
const file = process.argv[3] || 'TravelMate_FINAL_TRD.txt';

if (!query) {
  console.log('Usage: node search_text.js <query> [file]');
  process.exit(1);
}

const filePath = path.join(__dirname, file);
if (!fs.existsSync(filePath)) {
  console.log(`File not found: ${filePath}`);
  process.exit(1);
}

const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log(`Search results for "${query}" in ${file}:`);
let count = 0;
lines.forEach((line, idx) => {
  if (line.toLowerCase().includes(query.toLowerCase())) {
    console.log(`${idx + 1}: ${line.trim()}`);
    count++;
  }
});
console.log(`Total matches: ${count}`);
