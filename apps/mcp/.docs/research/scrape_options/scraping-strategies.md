# Scraping Strategy Configuration

This file defines which scraping strategy to use for different URL prefixes (native, firecrawl).

| prefix        | default_strategy | notes                                       |
| ------------- | ---------------- | ------------------------------------------- |
| yelp.com/biz/ | firecrawl        | Yelp has anti-bot measures, use Firecrawl   |
| example.com   | native           | Simple sites work fine with native scraping |
