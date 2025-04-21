#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Patterns to replace
const replacementPatterns = [
  // Replace relative imports
  {
    from: /from\s+['"]\.\.\/\.\.\/types\//g,
    to: 'from \'@qckfx/agent/types/'
  },
  {
    from: /from\s+['"]\.\.\/\.\.\/utils\//g,
    to: 'from \'@qckfx/agent/utils/'
  },
  {
    from: /from\s+['"]\.\.\/\.\.\/index['"]/g,
    to: 'from \'@qckfx/agent\''
  },
  // Replace any previously updated imports with the new package name
  {
    from: /from\s+['"]@your-org\/agent-core\/types\//g,
    to: 'from \'@qckfx/agent/types/'
  },
  {
    from: /from\s+['"]@your-org\/agent-core\/utils\//g,
    to: 'from \'@qckfx/agent/utils/'
  },
  {
    from: /from\s+['"]@your-org\/agent-core['"]/g,
    to: 'from \'@qckfx/agent\''
  }
];

// Process a single file
function processFile(filePath) {
  if (!filePath.trim()) return 0;
  
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;
    let modified = false;

    // Apply each replacement pattern
    for (const pattern of replacementPatterns) {
      if (pattern.from.test(content)) {
        content = content.replace(pattern.from, pattern.to);
        modified = true;
      }
    }

    // Write back to file if modified
    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Updated imports in: ${filePath}`);
      return 1;
    }
    return 0;
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error);
    return 0;
  }
}

// Main function to run the script
function main() {
  // Use the directory where the script is located as the base
  const projectRoot = path.resolve(__dirname, '../../');
  process.chdir(projectRoot);
  
  // Get list of TypeScript files
  const tsFiles = execSync('find . -type f -name "*.ts" -o -name "*.tsx"', { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(file => 
      file && 
      !file.includes('node_modules') && 
      !file.includes('dist') && 
      !file.includes('build') &&
      !file.includes('scripts/codemod')
    );

  let modifiedCount = 0;

  // Process each file
  for (const file of tsFiles) {
    modifiedCount += processFile(file);
  }

  console.log(`\nCompleted! Modified ${modifiedCount} files.`);
}

main();