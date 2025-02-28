// copy-monaco-for-prod.js
const fs = require('fs');
const path = require('path');

console.log('Copying Monaco Editor files for production...');

// Source directory in node_modules
const monacoSource = path.resolve(__dirname, 'node_modules', 'monaco-editor', 'min', 'vs');

// Target directory in dist (where production build goes)
const distDir = path.resolve(__dirname, 'dist');
const monacoTarget = path.resolve(distDir, 'monaco-editor', 'vs');

// Create target directory if it doesn't exist
if (!fs.existsSync(path.dirname(monacoTarget))) {
  fs.mkdirSync(path.dirname(monacoTarget), { recursive: true });
  console.log(`Created directory: ${path.dirname(monacoTarget)}`);
}

// Helper function to copy directory recursively
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Copy Monaco files
if (fs.existsSync(monacoSource)) {
  copyDirRecursive(monacoSource, monacoTarget);
  console.log(`Successfully copied Monaco Editor files to ${monacoTarget}`);
} else {
  console.error(`Monaco source not found at ${monacoSource}`);
  process.exit(1);
}
