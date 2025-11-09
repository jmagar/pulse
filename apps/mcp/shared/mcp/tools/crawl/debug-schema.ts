import { crawlOptionsSchema } from './schema.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

const schema = zodToJsonSchema(crawlOptionsSchema as any);
console.log(JSON.stringify(schema, null, 2));
