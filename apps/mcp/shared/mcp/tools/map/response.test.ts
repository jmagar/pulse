import { describe, it, expect } from 'vitest';
import { formatMapResponse } from './response.js';
import type { MapResult } from '@firecrawl/client';

describe('Map Response Formatter', () => {
  const createMockResult = (count: number): MapResult => ({
    success: true,
    links: Array.from({ length: count }, (_, i) => ({
      url: `https://example.com/page-${i + 1}`,
      title: `Page ${i + 1}`,
      description: `Description for page ${i + 1}`,
    })),
  });

  describe('Pagination', () => {
    it('should paginate results with startIndex and maxResults', () => {
      const result = createMockResult(3000);
      const response = formatMapResponse(result, 'https://example.com', 0, 1000, 'saveAndReturn');

      expect(response.isError).toBe(false);
      expect(response.content[0].type).toBe('text');
      const text = (response.content[0] as any).text;
      expect(text).toContain('Total URLs discovered: 3000');
      expect(text).toContain('Showing: 1-1000 of 3000');
      expect(text).toContain('More results available');
      expect(text).toContain('Use startIndex: 1000');
    });

    it('should not show "more results" message on last page', () => {
      const result = createMockResult(1500);
      const response = formatMapResponse(
        result,
        'https://example.com',
        1000,
        1000,
        'saveAndReturn'
      );

      const text = (response.content[0] as any).text;
      expect(text).toContain('Showing: 1001-1500 of 1500');
      expect(text).not.toContain('More results available');
    });

    it('should handle single page results', () => {
      const result = createMockResult(100);
      const response = formatMapResponse(result, 'https://example.com', 0, 1000, 'saveAndReturn');

      const text = (response.content[0] as any).text;
      expect(text).toContain('Showing: 1-100 of 100');
      expect(text).not.toContain('More results available');
    });
  });

  describe('Statistics', () => {
    it('should include domain count in summary', () => {
      const result: MapResult = {
        success: true,
        links: [
          { url: 'https://example.com/page1', title: 'Page 1' },
          { url: 'https://example.com/page2', title: 'Page 2' },
          { url: 'https://sub.example.com/page3', title: 'Page 3' },
          { url: 'https://other.com/page4', title: 'Page 4' },
        ],
      };
      const response = formatMapResponse(result, 'https://example.com', 0, 1000, 'saveAndReturn');

      const text = (response.content[0] as any).text;
      expect(text).toContain('Unique domains: 3');
    });

    it('should include metadata coverage statistics', () => {
      const result: MapResult = {
        success: true,
        links: [
          { url: 'https://example.com/page1', title: 'Page 1', description: 'Desc 1' },
          { url: 'https://example.com/page2', title: 'Page 2' },
          { url: 'https://example.com/page3' },
          { url: 'https://example.com/page4', title: 'Page 4', description: 'Desc 4' },
        ],
      };
      const response = formatMapResponse(result, 'https://example.com', 0, 1000, 'saveAndReturn');

      const text = (response.content[0] as any).text;
      expect(text).toContain('URLs with titles: 75%');
    });
  });

  describe('Result Handling Modes', () => {
    it('should return embedded resource in saveAndReturn mode', () => {
      const result = createMockResult(10);
      const response = formatMapResponse(result, 'https://example.com', 0, 1000, 'saveAndReturn');

      expect(response.content[1].type).toBe('resource');
      const resource = (response.content[1] as any).resource;
      expect(resource.uri).toMatch(/^pulse:\/\/map\/example\.com\/\d+/);
      expect(resource.name).toBe('URL Map: https://example.com (10 URLs)');
      expect(resource.mimeType).toBe('application/json');
      expect(resource.text).toBeDefined();
    });

    it('should return resource link in saveOnly mode', () => {
      const result = createMockResult(10);
      const response = formatMapResponse(result, 'https://example.com', 0, 1000, 'saveOnly');

      expect(response.content[1].type).toBe('resource_link');
      const link = response.content[1] as any;
      expect(link.uri).toMatch(/^pulse:\/\/map\/example\.com\/\d+/);
      expect(link.name).toBe('URL Map: https://example.com (10 URLs)');
      expect(link.description).toBeDefined();
    });

    it('should return text content in returnOnly mode', () => {
      const result = createMockResult(10);
      const response = formatMapResponse(result, 'https://example.com', 0, 1000, 'returnOnly');

      expect(response.content[1].type).toBe('text');
      const text = (response.content[1] as any).text;
      expect(text).toContain('"url": "https://example.com/page-1"');
    });
  });

  describe('Resource URIs', () => {
    it('should include page number in URI for paginated results', () => {
      const result = createMockResult(3000);

      const page1 = formatMapResponse(result, 'https://example.com', 0, 1000, 'saveAndReturn');
      const page2 = formatMapResponse(result, 'https://example.com', 1000, 1000, 'saveAndReturn');
      const page3 = formatMapResponse(result, 'https://example.com', 2000, 1000, 'saveAndReturn');

      const uri1 = (page1.content[1] as any).resource.uri;
      const uri2 = (page2.content[1] as any).resource.uri;
      const uri3 = (page3.content[1] as any).resource.uri;

      expect(uri1).toContain('/page-0');
      expect(uri2).toContain('/page-1');
      expect(uri3).toContain('/page-2');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty results', () => {
      const result: MapResult = { success: true, links: [] };
      const response = formatMapResponse(result, 'https://example.com', 0, 1000, 'saveAndReturn');

      expect(response.isError).toBe(false);
      const text = (response.content[0] as any).text;
      expect(text).toContain('Total URLs discovered: 0');
    });

    it('should handle URLs without titles or descriptions', () => {
      const result: MapResult = {
        success: true,
        links: [{ url: 'https://example.com/page1' }, { url: 'https://example.com/page2' }],
      };
      const response = formatMapResponse(result, 'https://example.com', 0, 1000, 'saveAndReturn');

      const text = (response.content[0] as any).text;
      expect(text).toContain('URLs with titles: 0%');
    });
  });
});
