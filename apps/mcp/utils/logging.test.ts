import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  Colors,
  BoxChars,
  colorize,
  colorHelpers,
  createLine,
  createSectionHeader,
  maskSensitiveValue,
} from "./logging.js";

describe("Color Support", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Colors constant", () => {
    it("should export ANSI color codes", () => {
      // RED: This test will fail because Colors doesn't exist yet
      expect(Colors.reset).toBe("\x1b[0m");
      expect(Colors.red).toBe("\x1b[31m");
      expect(Colors.green).toBe("\x1b[32m");
      expect(Colors.cyan).toBe("\x1b[36m");
    });

    it("should include bold and dim styles", () => {
      expect(Colors.bold).toBe("\x1b[1m");
      expect(Colors.dim).toBe("\x1b[2m");
    });

    it("should include bright colors", () => {
      expect(Colors.brightWhite).toBe("\x1b[97m");
      expect(Colors.brightCyan).toBe("\x1b[96m");
    });
  });

  describe("BoxChars constant", () => {
    it("should export box-drawing characters", () => {
      // RED: This test will fail because BoxChars doesn't exist yet
      expect(BoxChars.topLeft).toBe("╭");
      expect(BoxChars.horizontal).toBe("─");
      expect(BoxChars.vertical).toBe("│");
    });
  });

  describe("colorize()", () => {
    it("should apply color codes when colors are enabled", () => {
      // RED: This test will fail because colorize() doesn't exist yet
      process.env.FORCE_COLOR = "1";
      const result = colorize("test", Colors.red);
      expect(result).toBe("\x1b[31mtest\x1b[0m");
    });

    it("should apply multiple color codes", () => {
      process.env.FORCE_COLOR = "1";
      const result = colorize("test", Colors.red, Colors.bold);
      expect(result).toBe("\x1b[31m\x1b[1mtest\x1b[0m");
    });

    it("should not apply colors when NO_COLOR is set", () => {
      process.env.NO_COLOR = "1";
      const result = colorize("test", Colors.red);
      expect(result).toBe("test");
    });

    it("should not apply colors when FORCE_COLOR is 0", () => {
      process.env.FORCE_COLOR = "0";
      const result = colorize("test", Colors.red);
      expect(result).toBe("test");
    });
  });

  describe("colorHelpers", () => {
    beforeEach(() => {
      process.env.FORCE_COLOR = "1";
    });

    it("should have success helper", () => {
      // RED: This will fail because colorHelpers doesn't exist yet
      const result = colorHelpers.success("OK");
      expect(result).toContain("OK");
      expect(result).toContain(Colors.green);
      expect(result).toContain(Colors.bold);
    });

    it("should have error helper", () => {
      const result = colorHelpers.error("Failed");
      expect(result).toContain("Failed");
      expect(result).toContain(Colors.red);
    });

    it("should have warning helper", () => {
      const result = colorHelpers.warning("Warning");
      expect(result).toContain("Warning");
      expect(result).toContain(Colors.yellow);
    });

    it("should have info helper", () => {
      const result = colorHelpers.info("Info");
      expect(result).toContain("Info");
      expect(result).toContain(Colors.cyan);
    });

    it("should have checkmark helper", () => {
      const result = colorHelpers.checkmark();
      expect(result).toContain("✓");
      expect(result).toContain(Colors.green);
    });

    it("should have cross helper", () => {
      const result = colorHelpers.cross();
      expect(result).toContain("✗");
      expect(result).toContain(Colors.red);
    });
  });

  describe("createLine()", () => {
    it("should create line with default width and character", () => {
      // RED: This will fail because createLine() doesn't exist yet
      const line = createLine();
      expect(line.length).toBe(80);
      expect(line).toBe(BoxChars.horizontal.repeat(80));
    });

    it("should create line with custom width", () => {
      const line = createLine(50);
      expect(line.length).toBe(50);
    });

    it("should create line with custom character", () => {
      const line = createLine(10, "=");
      expect(line).toBe("==========");
    });
  });

  describe("createSectionHeader()", () => {
    it("should create section header with centered title", () => {
      // RED: This will fail because createSectionHeader() doesn't exist yet
      process.env.FORCE_COLOR = "1";
      const header = createSectionHeader("Test", 20);
      expect(header).toContain("Test");
      expect(header).toContain(BoxChars.horizontal);
    });

    it("should default to 80 character width", () => {
      process.env.FORCE_COLOR = "1";
      const header = createSectionHeader("Test");
      expect(header.length).toBeGreaterThan(80);
    });
  });

  describe("maskSensitiveValue()", () => {
    it("should mask middle of long values", () => {
      // RED: This will fail because maskSensitiveValue() doesn't exist yet
      const result = maskSensitiveValue("1234567890abcdef", 4);
      expect(result).toBe("1234****cdef");
    });

    it("should fully mask short values", () => {
      const result = maskSensitiveValue("abc", 4);
      expect(result).toBe("***");
    });

    it("should use default show chars of 4", () => {
      const result = maskSensitiveValue("abcdefghijklmnop");
      expect(result).toBe("abcd****mnop");
    });

    it("should handle empty string", () => {
      const result = maskSensitiveValue("");
      expect(result).toBe("");
    });
  });
});
