import { describe, it, expect } from "vitest";
import { preprocessUrl } from "./url-utils.js";

describe("URL Preprocessing", () => {
  it("should add https:// to bare domains", () => {
    expect(preprocessUrl("example.com")).toBe("https://example.com");
  });

  it("should preserve existing protocol", () => {
    expect(preprocessUrl("http://example.com")).toBe("http://example.com");
    expect(preprocessUrl("https://example.com")).toBe("https://example.com");
  });

  it("should handle URLs with paths", () => {
    expect(preprocessUrl("example.com/blog")).toBe("https://example.com/blog");
  });

  it("should reject invalid URLs after preprocessing", () => {
    expect(() => preprocessUrl("not a url")).toThrow("Invalid URL");
  });
});

describe("URL Protocol Security", () => {
  it("should reject file:// protocol (SSRF)", () => {
    expect(() => preprocessUrl("file:///etc/passwd")).toThrow(
      "Invalid protocol",
    );
  });

  it("should reject javascript: protocol (XSS)", () => {
    expect(() => preprocessUrl("javascript:alert(1)")).toThrow(
      "Invalid protocol",
    );
  });

  it("should reject data: protocol (data URI injection)", () => {
    expect(() =>
      preprocessUrl("data:text/html,<script>alert(1)</script>"),
    ).toThrow("Invalid protocol");
  });

  it("should allow http:// protocol", () => {
    expect(preprocessUrl("http://example.com")).toBe("http://example.com");
  });

  it("should allow https:// protocol", () => {
    expect(preprocessUrl("https://example.com")).toBe("https://example.com");
  });

  it("should reject localhost (SSRF)", () => {
    expect(() => preprocessUrl("http://localhost:8080")).toThrow("Private IP");
  });

  it("should reject 127.0.0.1 (SSRF)", () => {
    expect(() => preprocessUrl("http://127.0.0.1:8080")).toThrow("Private IP");
  });

  it("should reject private IP ranges (SSRF)", () => {
    expect(() => preprocessUrl("http://192.168.1.1")).toThrow("Private IP");
    expect(() => preprocessUrl("http://10.0.0.1")).toThrow("Private IP");
    expect(() => preprocessUrl("http://172.16.0.1")).toThrow("Private IP");
  });
});
