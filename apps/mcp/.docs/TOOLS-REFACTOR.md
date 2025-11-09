Refactor to just one tool:

- pulse
  - pulse scrape [URL] https://example.com
    - pulse scrape <start> [URLs] https://example.com https://wikipedia.com
    - pulse scrape <status> [job_id] fa3b2c1d45e6f7g8h9i0j
    - pulse scrape <stop> [job_id] fa3b2c1d45e6f7g8h9i0j
      **_SCRAPE:_** - https://docs.firecrawl.dev/api-reference/endpoint/batch-scrape.md - https://docs.firecrawl.dev/api-reference/endpoint/batch-scrape-get.md - https://docs.firecrawl.dev/api-reference/endpoint/batch-scrape-delete.md
  - pulse crawl: Firecrawl efficiently crawls websites to extract comprehensive data while bypassing blockers. URL Analysis -> Traversal -> Scraping -> Output
    - pulse crawl <start> [URL] https://example.com
    - pulse crawl <status> [job_id] fa3b2c1d45e6f7g8h9i0j
    - pulse crawl <stop> [job_id] fa3b2c1d45e6f7g8h9i0j
    - pulse crawl <errors> [job_id] fa3b2c1d45e6f7g8h9i0j
    - pulse crawl <list>
    - pulse crawl <params> [prompt] "Crawl the entire website but exclude /admin and /api"
      **_SCRAPE:_** - https://docs.firecrawl.dev/api-reference/endpoint/crawl-post.md - https://docs.firecrawl.dev/api-reference/endpoint/crawl-get.md - https://docs.firecrawl.dev/api-reference/endpoint/crawl-get-errors.md - https://docs.firecrawl.dev/api-reference/endpoint/crawl-active.md - https://docs.firecrawl.dev/api-reference/endpoint/crawl-delete.md - https://docs.firecrawl.dev/api-reference/endpoint/crawl-params-preview.md

  - pulse map: Used to map a URL and get urls of the website. This returns most links present on the website.
    - pulse map [URL] https://claude.com
      Optional:
      - [search] "example search term"
      - [includeSubdomains] boolean default: true
      - [ignoreQueryParameters] boolean default:true
      - [limit] integer default: 200 max: 5000
      - [timeout] integer
        **_SCRAPE:_** - https://docs.firecrawl.dev/api-reference/endpoint/map.md

```
javascript
const url = 'https://api.firecrawl.dev/v2/map';
const options = {
  method: 'POST',
  headers: {Authorization: 'Bearer <token>', 'Content-Type': 'application/json'},
  body: '{"url":"<string>","search":"<string>","sitemap":"include","includeSubdomains":true,"ignoreQueryParameters":true,"limit":5000,"timeout":123,"location":{"country":"US","languages":["en-US"]}}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}
```

    - pulse search: Firecrawl’s search API allows you to perform web searches and optionally scrape the search results in one   operation. Choose specific output formats (markdown, HTML, links, screenshots), Search the web with customizable parameters (location, etc.), Optionally retrieve content from search results in various formats, Control the number of results and set timeouts
        - pulse search [query] "example search query"
        - we also need to support:
            - Support for filtering by time ranges (“past week”, “past month”)
            - Category Filtering: Search within GitHub repositories or research websites
            ***SCRAPE:***
                - https://docs.firecrawl.dev/api-reference/endpoint/search.md

    - pulse rag
        - pulse rag <query> "What is semantic search?"
