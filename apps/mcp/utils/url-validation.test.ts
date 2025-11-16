import { describe, it, expect } from "vitest";
import { preprocessUrl } from "./url-validation.js";

describe("URL Validation", () => {
  describe("preprocessUrl", () => {
    it("should add https:// to URLs without protocol", () => {
      expect(preprocessUrl("example.com")).toBe("https://example.com");
    });

    it("should preserve existing https:// protocol", () => {
      expect(preprocessUrl("https://example.com")).toBe("https://example.com");
    });

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

    it("should reject data: protocol", () => {
      expect(() =>
        preprocessUrl("data:text/html,<script>alert(1)</script>"),
      ).toThrow("Invalid protocol");
    });

    it("should reject localhost (SSRF)", () => {
      expect(() => preprocessUrl("http://localhost:8080")).toThrow(
        "Private IP addresses not allowed",
      );
    });

    it("should reject 127.0.0.1 (SSRF)", () => {
      expect(() => preprocessUrl("http://127.0.0.1")).toThrow(
        "Private IP addresses not allowed",
      );
    });

    it("should reject private IP 192.168.x.x (SSRF)", () => {
      expect(() => preprocessUrl("http://192.168.1.1")).toThrow(
        "Private IP addresses not allowed",
      );
    });

    it("should reject private IP 10.x.x.x (SSRF)", () => {
      expect(() => preprocessUrl("http://10.0.0.1")).toThrow(
        "Private IP addresses not allowed",
      );
      expect(() => preprocessUrl("http://10.255.255.254")).toThrow(
        "Private IP addresses not allowed",
      );
    });

    it("should reject private IP 172.16-31.x.x (SSRF)", () => {
      expect(() => preprocessUrl("http://172.16.0.1")).toThrow(
        "Private IP addresses not allowed",
      );
      expect(() => preprocessUrl("http://172.31.255.254")).toThrow(
        "Private IP addresses not allowed",
      );
      expect(() => preprocessUrl("http://172.20.10.5")).toThrow(
        "Private IP addresses not allowed",
      );
    });

    it("should reject AWS metadata service 169.254.x.x (SSRF)", () => {
      expect(() => preprocessUrl("http://169.254.169.254")).toThrow(
        "Private IP addresses not allowed",
      );
      expect(() => preprocessUrl("http://169.254.1.1")).toThrow(
        "Private IP addresses not allowed",
      );
    });

    it("should reject IPv6 loopback [::1] (SSRF)", () => {
      expect(() => preprocessUrl("http://[::1]")).toThrow(
        "Private IP addresses not allowed",
      );
      expect(() => preprocessUrl("http://[::1]:8080")).toThrow(
        "Private IP addresses not allowed",
      );
    });

    it("should reject IPv6 link-local [fe80::] (SSRF)", () => {
      expect(() => preprocessUrl("http://[fe80::1]")).toThrow(
        "Private IP addresses not allowed",
      );
      expect(() => preprocessUrl("http://[fe80::dead:beef]")).toThrow(
        "Private IP addresses not allowed",
      );
    });

    it("should reject IPv6 private ranges fc00::/7 and fd00::/8 (SSRF)", () => {
      expect(() => preprocessUrl("http://[fc00::1]")).toThrow(
        "Private IP addresses not allowed",
      );
      expect(() => preprocessUrl("http://[fd00::1]")).toThrow(
        "Private IP addresses not allowed",
      );
      expect(() => preprocessUrl("http://[fdff:ffff:ffff:ffff::1]")).toThrow(
        "Private IP addresses not allowed",
      );
    });

    it("should reject uppercase protocols (FILE://)", () => {
      expect(() => preprocessUrl("FILE:///etc/passwd")).toThrow(
        "Invalid protocol",
      );
      expect(() => preprocessUrl("JAVASCRIPT:alert(1)")).toThrow(
        "Invalid protocol",
      );
      expect(() => preprocessUrl("DATA:text/html,test")).toThrow(
        "Invalid protocol",
      );
    });

    it("should reject invalid URLs", () => {
      expect(() => preprocessUrl("not a url")).toThrow("Invalid URL");
    });
  });
});
