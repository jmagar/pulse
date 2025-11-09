#!/usr/bin/env node

import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('🔍 Validating dependency synchronization...\n');

// Read all package.json files
const readPackageJson = (path) => {
  const fullPath = join(projectRoot, path);
  return JSON.parse(readFileSync(fullPath, 'utf-8'));
};

const shared = readPackageJson('shared/package.json');
const local = readPackageJson('local/package.json');
const remote = readPackageJson('remote/package.json');

// Dependencies that should be synchronized across all packages
const sharedDependencies = [
  '@anthropic-ai/sdk',
  '@modelcontextprotocol/sdk',
  'dom-to-semantic-markdown',
  'jsdom',
  'openai',
  'pdf-parse',
  'zod',
];

// Dev dependencies that should be synchronized
const sharedDevDependencies = [
  'typescript',
  'eslint',
  'prettier',
  'typescript-eslint',
  '@eslint/js',
  '@types/node',
];

// Track validation errors
const errors = [];
const warnings = [];

// Helper to check if version matches across packages
const checkVersionMatch = (depName, packages, depType = 'dependencies') => {
  const versions = new Map();

  packages.forEach((pkg, pkgName) => {
    const version = pkg[depType]?.[depName];
    if (version) {
      if (!versions.has(version)) {
        versions.set(version, []);
      }
      versions.get(version).push(pkgName);
    }
  });

  if (versions.size > 1) {
    const versionList = Array.from(versions.entries())
      .map(([version, pkgs]) => `${version} (${pkgs.join(', ')})`)
      .join(' vs ');
    errors.push(`❌ ${depType}/${depName}: Version mismatch - ${versionList}`);
    return false;
  }

  return true;
};

// Validate shared production dependencies
console.log('📦 Checking production dependencies...');
const packageMap = new Map([
  ['shared', shared],
  ['local', local],
  ['remote', remote],
]);

sharedDependencies.forEach((dep) => {
  checkVersionMatch(dep, packageMap, 'dependencies');
});

// Validate dotenv across local and remote
checkVersionMatch('dotenv', new Map([['local', local], ['remote', remote]]), 'dependencies');

// Validate shared dev dependencies
console.log('🔧 Checking dev dependencies...');
sharedDevDependencies.forEach((dep) => {
  checkVersionMatch(dep, packageMap, 'devDependencies');
});

// Check for vitest version consistency (shared and remote should match)
const vitestPackages = new Map([
  ['shared', shared],
  ['remote', remote],
]);
checkVersionMatch('vitest', vitestPackages, 'devDependencies');

// Special validation: @types/jsdom should only be in devDependencies
console.log('🔍 Checking special cases...');
if (local.dependencies?.['@types/jsdom']) {
  errors.push('❌ @types/jsdom should be in devDependencies, not dependencies (local)');
}

// Check for overlap between dependencies and devDependencies
[
  { name: 'shared', pkg: shared },
  { name: 'local', pkg: local },
  { name: 'remote', pkg: remote },
].forEach(({ name, pkg }) => {
  const deps = Object.keys(pkg.dependencies || {});
  const devDeps = Object.keys(pkg.devDependencies || {});
  const overlap = deps.filter((d) => devDeps.includes(d));

  if (overlap.length > 0) {
    errors.push(
      `❌ ${name}: Dependencies in both deps and devDeps: ${overlap.join(', ')}`
    );
  }
});

// Check version prefix consistency (should use ^)
console.log('🔖 Checking version prefixes...');
[shared, local, remote].forEach((pkg, idx) => {
  const pkgNames = ['shared', 'local', 'remote'];
  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };

  Object.entries(allDeps).forEach(([name, version]) => {
    if (typeof version === 'string' && !version.startsWith('file:') && !version.startsWith('^')) {
      warnings.push(`⚠️  ${pkgNames[idx]}: ${name} uses ${version} instead of ^ prefix`);
    }
  });
});

// Report results
console.log('\n' + '='.repeat(60));

if (errors.length === 0 && warnings.length === 0) {
  console.log('✅ All dependency versions are synchronized!');
  console.log('='.repeat(60));
  process.exit(0);
}

if (warnings.length > 0) {
  console.log('\n⚠️  Warnings:');
  warnings.forEach((w) => console.log(`  ${w}`));
}

if (errors.length > 0) {
  console.log('\n❌ Validation failed with errors:');
  errors.forEach((e) => console.log(`  ${e}`));
  console.log('\n💡 Run: node scripts/sync-dependencies.js');
  console.log('='.repeat(60));
  process.exit(1);
}

console.log('='.repeat(60));
process.exit(0);
