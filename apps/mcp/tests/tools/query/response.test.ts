import { describe, expect, it } from "vitest";
import { formatQueryResponse } from "../../../tools/query/response.js";

describe("formatQueryResponse", () => {
  it("renders metadata including ID and mobile flag", () => {
    const response = {
      results: [
        {
          id: 123,
          url: "https://example.com/page",
          title: "Example",
          description: "A description",
          text: "Snippet text",
          score: 0.956,
          metadata: {
            domain: "example.com",
            language: "en",
            country: "us",
            is_mobile: true,
            section: "Docs",
            source_type: "documentation",
            content_id: 123,
          },
        },
      ],
      total: 1,
      query: "test",
      mode: "hybrid",
      offset: 0,
    };

    const result = formatQueryResponse(response as any, "test");
    const text = (result.content?.[0] as any).text as string;

    expect(text).toContain("ID=123");
    expect(text).toContain("Domain=example.com");
    expect(text).toContain("Lang=en");
    expect(text).toContain("Country=us");
    expect(text).toContain("Mobile=true");
    expect(text).toContain("Section=Docs");
    expect(text).toContain("Type=documentation");
  });
});
