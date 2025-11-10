/**
 * @fileoverview Browser action types for page interaction before scraping
 *
 * Allows automation of common browser interactions to access content that
 * requires user interaction (clicks, form fills, scrolling, etc.)
 *
 * @module shared/mcp/tools/scrape/action-types
 */

import { z } from 'zod';

/**
 * Wait action - Pause for content to load
 */
export const waitActionSchema = z.object({
  type: z.literal('wait'),
  milliseconds: z.number().int().positive().describe('Time to wait in milliseconds'),
});

/**
 * Click action - Click buttons, links, or elements
 */
export const clickActionSchema = z.object({
  type: z.literal('click'),
  selector: z
    .string()
    .describe('CSS selector of element to click (e.g., "#load-more", ".cookie-accept")'),
});

/**
 * Write action - Type into input fields
 */
export const writeActionSchema = z.object({
  type: z.literal('write'),
  selector: z.string().describe('CSS selector of input field'),
  text: z.string().describe('Text to type into the field'),
});

/**
 * Press action - Press keyboard keys
 */
export const pressActionSchema = z.object({
  type: z.literal('press'),
  key: z.string().describe('Key to press (e.g., "Enter", "Tab", "Escape")'),
});

/**
 * Scroll action - Scroll page to trigger lazy loading
 */
export const scrollActionSchema = z.object({
  type: z.literal('scroll'),
  direction: z.enum(['up', 'down']).describe('Scroll direction'),
  amount: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Pixels to scroll (optional, defaults to one viewport)'),
});

/**
 * Screenshot action - Capture page at specific point
 */
export const screenshotActionSchema = z.object({
  type: z.literal('screenshot'),
  name: z.string().optional().describe('Optional name for the screenshot'),
});

/**
 * Scrape action - Scrape specific element
 */
export const scrapeActionSchema = z.object({
  type: z.literal('scrape'),
  selector: z.string().optional().describe('Optional CSS selector to scrape specific element'),
});

/**
 * ExecuteJavaScript action - Run custom JavaScript in browser context
 */
export const executeJavaScriptActionSchema = z.object({
  type: z.literal('executeJavascript'),
  script: z.string().describe('JavaScript code to execute in browser context'),
});

/**
 * Union type of all possible browser actions
 *
 * Uses discriminated union on 'type' field for type safety
 */
export const browserActionSchema = z.discriminatedUnion('type', [
  waitActionSchema,
  clickActionSchema,
  writeActionSchema,
  pressActionSchema,
  scrollActionSchema,
  screenshotActionSchema,
  scrapeActionSchema,
  executeJavaScriptActionSchema,
]);

export type BrowserAction = z.infer<typeof browserActionSchema>;

/**
 * Array of browser actions to perform sequentially
 */
export const browserActionsArraySchema = z.array(browserActionSchema);
