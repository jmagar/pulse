# Pulse Fetch Documentation

Welcome to the Pulse Fetch documentation! This page will help you find the right documentation for your needs.

## Getting Started

**New to Pulse Fetch?** Start here:

1. **[Getting Started Guide](GETTING_STARTED.md)** - Install Pulse Fetch and run your first scrape in 5 minutes
2. **[Configuration Reference](CONFIGURATION.md)** - Set up environment variables for your deployment
3. **[Tools Overview](../README.md#tools-overview)** - Understand which tool to use for your task

## Tool Documentation

Detailed references for each of the four tools:

- **[Scrape Tool](tools/SCRAPE.md)** - Extract content from a single URL
  - Parameters, result handling, extraction, browser actions
  - When to use: You know the exact page you need

- **[Search Tool](tools/SEARCH.md)** - Google search integration
  - Search parameters, result filtering, time-based search
  - When to use: You need to find relevant pages first

- **[Map Tool](tools/MAP.md)** - Discover site structure
  - Site mapping, URL discovery, filtering by search terms
  - When to use: You want to see what's available on a site

- **[Crawl Tool](tools/CRAWL.md)** - Deep recursive crawling
  - Link following, depth limits, extraction across pages
  - When to use: You need content from multiple related pages

## Core Documentation

**For Users:**

- **[Getting Started](GETTING_STARTED.md)** - Installation and first steps
- **[Configuration](CONFIGURATION.md)** - Environment variables and configuration
- **[README](../README.md)** - Project overview and quick reference

**For Developers:**

- **[Architecture](ARCHITECTURE.md)** - System design, monorepo structure, data flows
- **[Development Guide](DEVELOPMENT.md)** - Setup, testing, contributing
- **[API Reference](API_REFERENCE.md)** - Complete tool schemas

**For Operators:**

- **[Deployment Guide](DEPLOYMENT.md)** - Production setup and Docker
- **[Troubleshooting](TROUBLESHOOTING.md)** - Common issues and solutions
- **[Performance Guide](PERFORMANCE.md)** - Optimization and scaling

## Documentation by Use Case

### I want to scrape a website

1. Read [Getting Started - Your First Scrape](GETTING_STARTED.md#your-first-scrape)
2. Review [Scrape Tool parameters](tools/SCRAPE.md)
3. Check [Configuration](CONFIGURATION.md) for Firecrawl API setup

### I want to extract specific information

1. Read [Getting Started - Extract Specific Information](GETTING_STARTED.md#extract-specific-information)
2. Set up LLM provider in [Configuration - LLM Provider](CONFIGURATION.md#llm-provider-extract-feature)
3. Review [Scrape Tool - Extract Parameter](tools/SCRAPE.md#extract)

### I want to deploy to production

1. Choose deployment mode: [Local](GETTING_STARTED.md#option-1-local-mode-stdio-transport) or [Remote](GETTING_STARTED.md#option-2-remote-mode-http-transport)
2. Review [Configuration - Production](CONFIGURATION.md#production-http-server)
3. Read [Architecture - Transport Implementations](ARCHITECTURE.md#transport-implementations)
4. Follow [Deployment Guide](DEPLOYMENT.md) for production setup

### I want to contribute

1. Set up dev environment: [README - Development](../README.md#development)
2. Understand the architecture: [Architecture Overview](ARCHITECTURE.md)
3. Follow [Development Guide](DEVELOPMENT.md) for contribution workflow

### I'm having issues

1. Check [Troubleshooting Guide](TROUBLESHOOTING.md) for common issues and solutions
2. Review [Configuration](CONFIGURATION.md) to verify environment variables
3. Check [Getting Started - Troubleshooting](GETTING_STARTED.md#troubleshooting) for basic debugging

## Documentation Status

### ✅ Complete

- [x] Getting Started Guide
- [x] Configuration Reference
- [x] Architecture Overview
- [x] README
- [x] Scrape Tool Documentation
- [x] Search Tool Documentation
- [x] Map Tool Documentation
- [x] Crawl Tool Documentation
- [x] Development Guide
- [x] API Reference
- [x] Deployment Guide
- [x] Troubleshooting Guide
- [x] Performance Guide
- [x] Development Guide (Contributing)

## Finding What You Need

**By Role:**

- **End User** → [Getting Started](GETTING_STARTED.md) + [Tool Docs](tools/)
- **Developer** → [Architecture](ARCHITECTURE.md) + [Development Guide](DEVELOPMENT.md)
- **Operator** → [Configuration](CONFIGURATION.md) + [Deployment Guide](DEPLOYMENT.md)

**By Task:**

- **Install** → [Getting Started](GETTING_STARTED.md)
- **Configure** → [Configuration](CONFIGURATION.md)
- **Use Tools** → [Tool Documentation](tools/)
- **Understand System** → [Architecture](ARCHITECTURE.md)
- **Troubleshoot** → [Troubleshooting Guide](TROUBLESHOOTING.md)
- **Contribute** → [Development Guide](DEVELOPMENT.md)

---

**Need more help?**

- Open an [issue on GitHub](https://github.com/your-org/pulse/issues)
- Join [discussions](https://github.com/your-org/pulse/discussions)
- Check the [changelog](CHANGELOG.md) for recent updates
