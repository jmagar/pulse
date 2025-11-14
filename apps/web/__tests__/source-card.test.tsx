import { render, screen } from "@testing-library/react"
import { SourceCard } from "@/components/source-card"

describe("SourceCard", () => {
  it("should render source title", () => {
    render(
      <SourceCard
        type="pdf"
        title="document.pdf"
        meta="125 pages"
      />
    )

    expect(screen.getByText("document.pdf")).toBeInTheDocument()
  })

  it("should render metadata", () => {
    render(
      <SourceCard
        type="pdf"
        title="document.pdf"
        meta="125 pages"
      />
    )

    expect(screen.getByText("125 pages")).toBeInTheDocument()
  })

  it("should render progress bar when processing", () => {
    render(
      <SourceCard
        type="web"
        title="example.com"
        meta="Crawling"
        processing={70}
      />
    )

    const progress = screen.getByRole("progressbar")
    expect(progress).toBeInTheDocument()
  })

  it("should render error message when provided", () => {
    render(
      <SourceCard
        type="github"
        title="org/repo"
        meta="Failed"
        error="Rate limited"
      />
    )

    expect(screen.getByText("Rate limited")).toBeInTheDocument()
  })
})
