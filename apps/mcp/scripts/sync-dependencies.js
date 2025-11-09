#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('🔄 Synchronizing dependencies across all package.json files...\n');

// Read all package.json files
const readPackageJson = (path) => {
  const fullPath = join(projectRoot, path);
  try {
    const content = readFileSync(fullPath, 'utf-8');
    return {
      path: fullPath,
      data: JSON.parse(content),
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`❌ Error: File not found at ${path}`);
      console.error('   Make sure you are running this script from the project root.');
    } else if (error instanceof SyntaxError) {
      console.error(`❌ Error: Invalid JSON in ${path}`);
      console.error('   The package.json file contains malformed JSON.');
      console.error(`   Details: ${error.message}`);
    } else {
      console.error(`❌ Error reading ${path}:`, error.message);
    }
    process.exit(1);
  }
};

const packages = {
  shared: readPackageJson('shared/package.json'),
  local: readPackageJson('local/package.json'),
  remote: readPackageJson('remote/package.json'),
};

// Define the canonical versions (compatible stable versions)
// Note: Using compatible versions that work with current codebase
const canonicalVersions = {
  // Production dependencies - choosing compatible versions
  '@anthropic-ai/sdk': '^0.68.0', // Latest is compatible
  'zod': '^3.24.1', // Keep 3.x - Zod 4.x has breaking changes
  'openai': '^4.104.0', // Keep 4.x - OpenAI 6.x has breaking changes
  'jsdom': '^27.1.0', // Latest is compatible
  'pdf-parse': '^1.1.1', // Keep 1.x - 2.x has different exports
  'dotenv': '^17.2.3', // Latest is compatible

  // These should remain consistent (already matching)
  '@modelcontextprotocol/sdk': '^1.19.1',
  'dom-to-semantic-markdown': '^1.5.0',

  // Dev dependencies (already matching, but included for completeness)
  'typescript': '^5.7.3',
  'eslint': '^9.39.1',
  'prettier': '^3.6.2',
  'typescript-eslint': '^8.46.3',
  '@eslint/js': '^9.39.1',
  '@types/node': '^24.0.0',
  'vitest': '^3.2.3',
  '@types/jsdom': '^21.1.7',
  '@types/pdf-parse': '^1.1.5',
};

// Track changes
const changes = [];

// Helper to update dependencies in a package
const updateDependencies = (pkg, depType, depName, newVersion) => {
  if (pkg.data[depType] && pkg.data[depType][depName]) {
    const oldVersion = pkg.data[depType][depName];
    if (oldVersion !== newVersion) {
      pkg.data[depType][depName] = newVersion;
      changes.push({
        package: pkg.path.split('/').slice(-2).join('/'),
        depType,
        name: depName,
        from: oldVersion,
        to: newVersion,
      });
    }
  }
};

// Apply canonical versions to all packages
Object.entries(canonicalVersions).forEach(([depName, version]) => {
  Object.values(packages).forEach((pkg) => {
    updateDependencies(pkg, 'dependencies', depName, version);
    updateDependencies(pkg, 'devDependencies', depName, version);
  });
});

// Special case: Move @types/jsdom from dependencies to devDependencies in local
if (packages.local.data.dependencies?.['@types/jsdom']) {
  const version = packages.local.data.dependencies['@types/jsdom'];
  delete packages.local.data.dependencies['@types/jsdom'];

  if (!packages.local.data.devDependencies) {
    packages.local.data.devDependencies = {};
  }
  packages.local.data.devDependencies['@types/jsdom'] = canonicalVersions['@types/jsdom'];

  changes.push({
    package: 'local/package.json',
    depType: 'dependencies -> devDependencies',
    name: '@types/jsdom',
    from: `dependencies: ${version}`,
    to: `devDependencies: ${canonicalVersions['@types/jsdom']}`,
  });
}

// Write updated package.json files
Object.values(packages).forEach((pkg) => {
  try {
    writeFileSync(pkg.path, JSON.stringify(pkg.data, null, 2) + '\n');
  } catch (error) {
    console.error(`❌ Error writing to ${pkg.path}:`, error.message);
    console.error('   Check file permissions and disk space.');
    process.exit(1);
  }
});

// Report changes
if (changes.length === 0) {
  console.log('✅ All dependencies are already synchronized!');
} else {
  console.log(`📝 Updated ${changes.length} dependencies:\n`);

  changes.forEach((change) => {
    console.log(`  ${change.package}`);
    console.log(`    ${change.depType}: ${change.name}`);
    console.log(`    ${change.from} → ${change.to}\n`);
  });

  console.log('✅ Dependencies synchronized successfully!');
  console.log('\n⚠️  Next steps:');
  console.log('  1. Run: npm install (from project root)');
  console.log('  2. Run: npm test tests/shared/dependency-sync.test.ts');
  console.log('  3. Run: npm run build (to verify no breaking changes)');
  console.log('  4. Run: npm run test:all (to verify all tests pass)');
}
