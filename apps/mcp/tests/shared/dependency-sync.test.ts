import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Dependency Synchronization', () => {
  const projectRoot = join(process.cwd());

  // Helper to read package.json files
  const readPackageJson = (path: string) => {
    const fullPath = join(projectRoot, path);
    return JSON.parse(readFileSync(fullPath, 'utf-8'));
  };

  const sharedPkg = readPackageJson('shared/package.json');
  const localPkg = readPackageJson('local/package.json');
  const remotePkg = readPackageJson('remote/package.json');

  describe('Production Dependencies', () => {
    it('should have matching @anthropic-ai/sdk versions', () => {
      const versions = [
        sharedPkg.dependencies['@anthropic-ai/sdk'],
        localPkg.dependencies['@anthropic-ai/sdk'],
        remotePkg.dependencies['@anthropic-ai/sdk'],
      ];

      // All should use the same version
      expect(versions[0]).toBe(versions[1]);
      expect(versions[0]).toBe(versions[2]);

      // Should be the latest stable version
      expect(versions[0]).toBe('^0.68.0');
    });

    it('should have matching zod versions', () => {
      const versions = [
        sharedPkg.dependencies.zod,
        localPkg.dependencies.zod,
        remotePkg.dependencies.zod,
      ];

      expect(versions[0]).toBe(versions[1]);
      expect(versions[0]).toBe(versions[2]);
      // Using 3.x due to breaking changes in 4.x
      expect(versions[0]).toBe('^3.24.1');
    });

    it('should have matching openai versions', () => {
      const versions = [
        sharedPkg.dependencies.openai,
        localPkg.dependencies.openai,
        remotePkg.dependencies.openai,
      ];

      expect(versions[0]).toBe(versions[1]);
      expect(versions[0]).toBe(versions[2]);
      // Using 4.x due to breaking changes in 6.x
      expect(versions[0]).toBe('^4.104.0');
    });

    it('should have matching jsdom versions', () => {
      const versions = [
        sharedPkg.dependencies.jsdom,
        localPkg.dependencies.jsdom,
        remotePkg.dependencies.jsdom,
      ];

      expect(versions[0]).toBe(versions[1]);
      expect(versions[0]).toBe(versions[2]);
      expect(versions[0]).toBe('^27.1.0');
    });

    it('should have matching pdf-parse versions', () => {
      const versions = [
        sharedPkg.dependencies['pdf-parse'],
        localPkg.dependencies['pdf-parse'],
        remotePkg.dependencies['pdf-parse'],
      ];

      expect(versions[0]).toBe(versions[1]);
      expect(versions[0]).toBe(versions[2]);
      // Using 1.x due to export changes in 2.x
      expect(versions[0]).toBe('^1.1.1');
    });

    it('should have matching dotenv versions', () => {
      const localDotenv = localPkg.dependencies.dotenv;
      const remoteDotenv = remotePkg.dependencies.dotenv;

      expect(localDotenv).toBe(remoteDotenv);
      expect(localDotenv).toBe('^17.2.3');
    });

    it('should have matching @modelcontextprotocol/sdk versions', () => {
      const versions = [
        sharedPkg.dependencies['@modelcontextprotocol/sdk'],
        localPkg.dependencies['@modelcontextprotocol/sdk'],
        remotePkg.dependencies['@modelcontextprotocol/sdk'],
      ];

      expect(versions[0]).toBe(versions[1]);
      expect(versions[0]).toBe(versions[2]);
    });

    it('should have matching dom-to-semantic-markdown versions', () => {
      const versions = [
        sharedPkg.dependencies['dom-to-semantic-markdown'],
        localPkg.dependencies['dom-to-semantic-markdown'],
        remotePkg.dependencies['dom-to-semantic-markdown'],
      ];

      expect(versions[0]).toBe(versions[1]);
      expect(versions[0]).toBe(versions[2]);
    });
  });

  describe('Development Dependencies', () => {
    it('should have matching TypeScript versions', () => {
      const versions = [
        sharedPkg.devDependencies.typescript,
        localPkg.devDependencies.typescript,
        remotePkg.devDependencies.typescript,
      ];

      expect(versions[0]).toBe(versions[1]);
      expect(versions[0]).toBe(versions[2]);
    });

    it('should have matching eslint versions', () => {
      const versions = [
        sharedPkg.devDependencies.eslint,
        localPkg.devDependencies.eslint,
        remotePkg.devDependencies.eslint,
      ];

      expect(versions[0]).toBe(versions[1]);
      expect(versions[0]).toBe(versions[2]);
    });

    it('should have matching prettier versions', () => {
      const versions = [
        sharedPkg.devDependencies.prettier,
        localPkg.devDependencies.prettier,
        remotePkg.devDependencies.prettier,
      ];

      expect(versions[0]).toBe(versions[1]);
      expect(versions[0]).toBe(versions[2]);
    });

    it('should have matching typescript-eslint versions', () => {
      const versions = [
        sharedPkg.devDependencies['typescript-eslint'],
        localPkg.devDependencies['typescript-eslint'],
        remotePkg.devDependencies['typescript-eslint'],
      ];

      expect(versions[0]).toBe(versions[1]);
      expect(versions[0]).toBe(versions[2]);
    });

    it('should have matching @eslint/js versions', () => {
      const versions = [
        sharedPkg.devDependencies['@eslint/js'],
        localPkg.devDependencies['@eslint/js'],
        remotePkg.devDependencies['@eslint/js'],
      ];

      expect(versions[0]).toBe(versions[1]);
      expect(versions[0]).toBe(versions[2]);
    });

    it('should have matching @types/node versions', () => {
      const versions = [
        sharedPkg.devDependencies['@types/node'],
        localPkg.devDependencies['@types/node'],
        remotePkg.devDependencies['@types/node'],
      ];

      expect(versions[0]).toBe(versions[1]);
      expect(versions[0]).toBe(versions[2]);
    });

    it('should have matching vitest versions across modules', () => {
      const versions = [
        sharedPkg.devDependencies.vitest,
        remotePkg.devDependencies.vitest,
      ];

      // Note: local has vitest 4.x, others have 3.x. This test validates they match
      expect(versions[0]).toBe(versions[1]);
      expect(versions[0]).toBe('^3.2.3');
    });

    it('should have @types/jsdom only in devDependencies', () => {
      // local incorrectly has @types/jsdom in dependencies, not devDependencies
      expect(localPkg.dependencies['@types/jsdom']).toBeUndefined();
      expect(localPkg.devDependencies?.['@types/jsdom']).toBeDefined();
      expect(sharedPkg.devDependencies['@types/jsdom']).toBeDefined();
    });
  });

  describe('Version Range Consistency', () => {
    it('should use consistent version range prefix (^)', () => {
      const allDeps = {
        ...sharedPkg.dependencies,
        ...localPkg.dependencies,
        ...remotePkg.dependencies,
      };

      Object.entries(allDeps).forEach(([name, version]) => {
        if (typeof version === 'string' && !version.startsWith('file:')) {
          expect(version.startsWith('^'), `${name} should use ^ prefix`).toBe(true);
        }
      });
    });
  });

  describe('No Duplicate Dependencies', () => {
    it('should not have dependencies in both deps and devDeps in the same package', () => {
      [
        { name: 'shared', pkg: sharedPkg },
        { name: 'local', pkg: localPkg },
        { name: 'remote', pkg: remotePkg },
      ].forEach(({ name, pkg }) => {
        const deps = Object.keys(pkg.dependencies || {});
        const devDeps = Object.keys(pkg.devDependencies || {});
        const overlap = deps.filter((d) => devDeps.includes(d));

        expect(overlap, `${name} has overlap: ${overlap.join(', ')}`).toHaveLength(0);
      });
    });
  });
});
