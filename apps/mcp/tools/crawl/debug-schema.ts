import { crawlOptionsSchema } from "./schema.js";
import { zodToJsonSchema } from "zod-to-json-schema";

const schema = zodToJsonSchema(crawlOptionsSchema);
console.log(JSON.stringify(schema, null, 2));
