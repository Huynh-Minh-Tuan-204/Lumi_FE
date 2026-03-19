const fs = require('fs');
const content = fs.readFileSync('fullBE.txt', 'utf16le'); // Oh, the file itself is utf16le!
const files = content.split('=== FILE: ');
const endpoints = [];

files.forEach(f => {
  if (f.includes('Controller.cs')) {
    const lines = f.split('\n');
    let controllerRoute = '';
    const nameLine = lines[0].trim();
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('[Route(')) {
            controllerRoute = line.substring(line.indexOf('"') + 1, line.lastIndexOf('"'));
        }
        if (line.startsWith('[HttpGet') || line.startsWith('[HttpPost') || line.startsWith('[HttpPut') || line.startsWith('[HttpDelete')) {
            let methodType = line.substring(1, line.indexOf(']')).split('(')[0];
            let route = '';
            if (line.includes('(') && line.includes('"')) {
                route = line.substring(line.indexOf('"') + 1, line.lastIndexOf('"'));
            }
            // Look for the method signature in the next few lines
            let signature = '';
            for (let j = 1; j < 4; j++) {
                if (lines[i+j] && lines[i+j].includes('public async Task<')) {
                    signature = lines[i+j].trim();
                    break;
                }
            }
            endpoints.push({
                file: nameLine.split(' ')[0],
                controllerRoute,
                methodType,
                route,
                signature
            });
        }
    }
  }
});

fs.writeFileSync('endpoints.json', JSON.stringify(endpoints, null, 2), 'utf8');
