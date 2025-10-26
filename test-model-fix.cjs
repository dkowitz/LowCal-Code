const fs = require('fs');

// Read the modified file and check if it contains our changes
const appPath = '/home/atmandk/LowCal-dev/packages/cli/src/ui/App.tsx';
const content = fs.readFileSync(appPath, 'utf8');

console.log("Checking for model persistence fix in App.tsx...");

if (content.includes('hasBeenSetFromSettingsRef')) {
  console.log("✓ Fix applied successfully");
} else {
  console.log("✗ Fix not found in file");
}

// Check if the useEffect that handles model changes is properly modified
const lines = content.split('\n');
let foundModelEffect = false;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('Watch for model changes')) {
    foundModelEffect = true;
    console.log(`Found useEffect at line ${i + 1}`);
    
    // Check that it uses useRef
    let nextLines = lines.slice(i, i + 20);
    if (nextLines.some(l => l.includes('hasBeenSetFromSettingsRef'))) {
      console.log("✓ Uses useRef to track model setting");
    } else {
      console.log("✗ Does not use useRef properly");
    }
    
    break;
  }
}

if (!foundModelEffect) {
  console.log("Could not find the model useEffect in App.tsx");
}