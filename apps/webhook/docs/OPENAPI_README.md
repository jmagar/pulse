# OpenAPI Specification

This directory contains the OpenAPI 3.1 specification for FC-Bridge API.

## Files

- **`openapi.yaml`** - OpenAPI specification in YAML format (primary source)
- **`openapi.json`** - OpenAPI specification in JSON format (generated from YAML)
- **`API_REFERENCE.md`** - Human-readable API documentation

## Viewing the Specification

### Interactive Documentation (FastAPI)

FC-Bridge automatically generates interactive API documentation using FastAPI:

**Swagger UI:**
```
http://localhost:52100/docs
```

**ReDoc:**
```
http://localhost:52100/redoc
```

**OpenAPI JSON:**
```
http://localhost:52100/openapi.json
```

### External Tools

**Swagger Editor (Online):**
1. Go to https://editor.swagger.io/
2. File → Import URL → Paste your OpenAPI spec URL
3. Or copy/paste the contents of `openapi.yaml`

**Swagger UI (Docker):**
```bash
docker run -p 8080:8080 \
  -e SWAGGER_JSON=/specs/openapi.yaml \
  -v $(pwd)/docs:/specs \
  swaggerapi/swagger-ui
```

Then visit: http://localhost:8080

**ReDoc (Docker):**
```bash
docker run -p 8080:80 \
  -e SPEC_URL=/specs/openapi.yaml \
  -v $(pwd)/docs:/usr/share/nginx/html/specs \
  redocly/redoc
```

Then visit: http://localhost:8080

**Postman:**
1. Open Postman
2. Import → Upload Files → Select `openapi.yaml`
3. Postman automatically creates a collection from the spec

**VS Code Extension:**
```bash
code --install-extension 42Crunch.vscode-openapi
```

Then open `openapi.yaml` in VS Code for syntax highlighting and validation.

## Generating Client SDKs

### OpenAPI Generator

**Install:**
```bash
npm install -g @openapitools/openapi-generator-cli
```

**Generate Python Client:**
```bash
openapi-generator-cli generate \
  -i docs/openapi.yaml \
  -g python \
  -o clients/python \
  --additional-properties=packageName=fc_bridge_client
```

**Generate TypeScript/Axios Client:**
```bash
openapi-generator-cli generate \
  -i docs/openapi.yaml \
  -g typescript-axios \
  -o clients/typescript
```

**Generate Go Client:**
```bash
openapi-generator-cli generate \
  -i docs/openapi.yaml \
  -g go \
  -o clients/go
```

**Other Supported Languages:**
- Java (multiple variants)
- JavaScript/Node.js
- Ruby
- PHP
- C#/.NET
- Rust
- Kotlin
- Swift
- And 50+ more...

See: https://openapi-generator.tech/docs/generators

### Swagger Codegen (Alternative)

```bash
docker run --rm -v ${PWD}:/local swaggerapi/swagger-codegen-cli-v3 generate \
  -i /local/docs/openapi.yaml \
  -l python \
  -o /local/clients/python
```

## Validating the Specification

### Online Validator

https://validator.swagger.io/

### CLI Validator (Spectral)

**Install:**
```bash
npm install -g @stoplight/spectral-cli
```

**Validate:**
```bash
spectral lint docs/openapi.yaml
```

### Python Validator

```bash
pip install openapi-spec-validator
openapi-spec-validator docs/openapi.yaml
```

## Testing API Calls

### Using cURL (from examples)

**Search Example:**
```bash
curl -X POST http://localhost:52100/api/search \
  -H "Authorization: Bearer your-api-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "authentication methods",
    "mode": "hybrid",
    "limit": 10
  }'
```

**Health Check:**
```bash
curl http://localhost:52100/health
```

### Using HTTPie (prettier output)

**Install:**
```bash
pip install httpie
```

**Search:**
```bash
http POST localhost:52100/api/search \
  Authorization:"Bearer your-api-secret" \
  query="authentication methods" \
  mode=hybrid \
  limit=10
```

### Using Postman Collection

1. Import `openapi.yaml` into Postman
2. Set environment variable `API_SECRET` with your secret
3. Update base URL to `http://localhost:52100`
4. Run requests from the generated collection

## Updating the Specification

### Regenerate from FastAPI

To regenerate the OpenAPI spec from the running application:

```bash
# Start the server
uv run python -m app.main &

# Wait for startup
sleep 3

# Download spec
curl http://localhost:52100/openapi.json > docs/openapi-generated.json

# Convert to YAML
uv run python -c "
import json, yaml
spec = json.load(open('docs/openapi-generated.json'))
yaml.dump(spec, open('docs/openapi-generated.yaml', 'w'), default_flow_style=False)
"

# Stop server
pkill -f "python -m app.main"
```

**Note:** The generated spec lacks detailed descriptions and examples. Use the hand-crafted `openapi.yaml` for complete documentation.

### Convert YAML ↔ JSON

**YAML to JSON:**
```bash
uv run python -c "
import yaml, json
spec = yaml.safe_load(open('docs/openapi.yaml'))
json.dump(spec, open('docs/openapi.json', 'w'), indent=2)
"
```

**JSON to YAML:**
```bash
uv run python -c "
import yaml, json
spec = json.load(open('docs/openapi.json'))
yaml.dump(spec, open('docs/openapi.yaml', 'w'), default_flow_style=False)
"
```

## Differences: FastAPI Auto-Generated vs Hand-Crafted

| Feature | Auto-Generated (`/openapi.json`) | Hand-Crafted (`docs/openapi.yaml`) |
|---------|----------------------------------|-------------------------------------|
| **Schema Accuracy** | ✅ Always accurate | ⚠️ Must be manually updated |
| **Examples** | ❌ Minimal | ✅ Comprehensive |
| **Descriptions** | ⚠️ From docstrings only | ✅ Detailed explanations |
| **Authentication Docs** | ⚠️ Basic | ✅ Complete with examples |
| **Error Responses** | ✅ Standard | ✅ With examples |
| **Rate Limits** | ❌ Not documented | ✅ Documented |
| **Webhooks** | ⚠️ Basic | ✅ Detailed with signature info |
| **Code Examples** | ❌ None | ✅ curl, HTTPie, language clients |

**Recommendation:** Use **hand-crafted spec** for:
- Client SDK generation
- API documentation
- Partner integration guides
- Public API portals

Use **auto-generated spec** for:
- Schema validation
- Quick testing
- Internal development

## Mock Server

### Prism (Recommended)

**Install:**
```bash
npm install -g @stoplight/prism-cli
```

**Run Mock Server:**
```bash
prism mock docs/openapi.yaml
```

Server runs on `http://localhost:4010` and returns example responses based on the spec.

**Test Mock:**
```bash
curl http://localhost:4010/health
```

### Postman Mock Server

1. Import `openapi.yaml` into Postman
2. Right-click collection → Mock Collection
3. Postman generates mock responses automatically

## API Versioning

FC-Bridge currently uses **v0.1.0** (pre-release).

When releasing v1.0.0:
1. Update `info.version` in `openapi.yaml`
2. Consider path versioning (`/api/v1/search` vs `/api/search`)
3. Maintain backward compatibility or provide migration guides
4. Tag OpenAPI spec versions in git: `git tag openapi-v1.0.0`

## Security Considerations

### Credentials in Examples

The OpenAPI spec uses placeholder values:
- `Authorization: Bearer your-api-secret`
- `X-Firecrawl-Signature: sha256=<computed-signature>`

**Never commit real credentials to the spec!**

### Webhook Signature Verification

The spec includes detailed HMAC-SHA256 verification algorithm:

```python
signature = hmac.new(
    key=webhook_secret.encode('utf-8'),
    msg=request_body,
    digestmod=hashlib.sha256
).hexdigest()
```

Clients should implement this exactly as documented.

## Contributing

When updating the API:

1. **Update route handlers** in `app/api/routes.py`
2. **Update models** in `app/models.py`
3. **Update OpenAPI spec** in `docs/openapi.yaml`
4. **Regenerate JSON** with YAML-to-JSON conversion
5. **Update API_REFERENCE.md** with new examples
6. **Test changes** with Swagger UI at `/docs`
7. **Validate spec** with Spectral or online validator
8. **Commit all changes** together

## Resources

- **OpenAPI 3.1 Specification:** https://spec.openapis.org/oas/v3.1.0
- **FastAPI OpenAPI Docs:** https://fastapi.tiangolo.com/advanced/extending-openapi/
- **OpenAPI Generator:** https://openapi-generator.tech/
- **Swagger Tools:** https://swagger.io/tools/
- **Spectral Linter:** https://stoplight.io/open-source/spectral
- **Redocly CLI:** https://redocly.com/docs/cli/

## Support

For API questions or OpenAPI spec issues:
- GitHub Issues: https://github.com/yourusername/fc-bridge/issues
- Documentation: https://github.com/yourusername/fc-bridge/tree/main/docs
