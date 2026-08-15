const fs = require('fs');
const readline = require('readline');

async function processLineByLine() {
  const fileStream = fs.createReadStream('/home/user/.gemini/antigravity-ide/brain/c69681dd-917b-4697-91d4-3aeba311abe4/.system_generated/logs/transcript_full.jsonl');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let files = {
    'SeedStocking.jsx': [],
    'PackingPage.jsx': [],
    'OutsideWorkersStep3.jsx': []
  };

  for await (const line of rl) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'VIEW_FILE' && obj.content) {
        if (obj.content.includes('SeedStocking.jsx')) {
          files['SeedStocking.jsx'].push(obj.content);
        }
        if (obj.content.includes('PackingPage.jsx')) {
          files['PackingPage.jsx'].push(obj.content);
        }
        if (obj.content.includes('OutsideWorkersStep3.jsx')) {
          files['OutsideWorkersStep3.jsx'].push(obj.content);
        }
      }
    } catch (e) {}
  }
  
  console.log("SeedStocking versions:", files['SeedStocking.jsx'].length);
  if (files['SeedStocking.jsx'].length > 0) {
     fs.writeFileSync('seed_stocking_original.txt', files['SeedStocking.jsx'][0]);
  }
  console.log("PackingPage versions:", files['PackingPage.jsx'].length);
  if (files['PackingPage.jsx'].length > 0) {
     fs.writeFileSync('packing_page_original.txt', files['PackingPage.jsx'][0]);
  }
  console.log("OutsideWorkersStep3 versions:", files['OutsideWorkersStep3.jsx'].length);
  if (files['OutsideWorkersStep3.jsx'].length > 0) {
     fs.writeFileSync('outside_workers_original.txt', files['OutsideWorkersStep3.jsx'][0]);
  }
}
processLineByLine();
