const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const files = [
  'TravelMate Database Schema.docx',
  'TravelMate_FINAL_TRD.docx',
  'TravelMate_PRD_Final.docx'
];

const workspace = 'c:\\Users\\bhavn\\Downloads\\TRAVEL MATE_INTERN PROJECT';
const outputDir = path.join(workspace, 'scratch');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Check if we can unzip word/document.xml using tar
// tar -xf "file.docx" word/document.xml
files.forEach(file => {
  const filePath = path.join(workspace, file);
  const outName = file.replace(/\.docx$/, '.txt');
  const outPath = path.join(outputDir, outName);
  
  try {
    const tempDir = path.join(outputDir, 'temp_' + outName.replace('.txt', ''));
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });
    
    // Extract using tar (since Windows tar supports zip extraction)
    execSync(`tar -xf "${filePath}" -C "${tempDir}"`);
    
    const docXmlPath = path.join(tempDir, 'word', 'document.xml');
    if (fs.existsSync(docXmlPath)) {
      const xmlContent = fs.readFileSync(docXmlPath, 'utf8');
      // Simple regex to extract all w:t tags
      const matches = xmlContent.match(/<w:t[^>]*>(.*?)<\/w:t>/g);
      if (matches) {
        const text = matches.map(m => m.replace(/<w:t[^>]*>|<\/w:t>/g, '')).join('\n');
        fs.writeFileSync(outPath, text, 'utf8');
        console.log(`Successfully extracted ${file} to ${outName}`);
      } else {
        console.log(`No text found in word/document.xml of ${file}`);
      }
    } else {
      console.log(`word/document.xml not found in ${file}`);
    }
    
    // Clean up temp dir
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (err) {
    console.error(`Error processing ${file}:`, err.message);
  }
});
