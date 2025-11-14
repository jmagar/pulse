import { render, screen } from "@testing-library/react"
import { SourcePanel } from "@/components/source-panel"

describe("SourcePanel", () => {
  it("should render Sources header", () => {
    render(<SourcePanel />)
    expect(screen.getByText("Sources")).toBeInTheDocument()
  })

  it("should render add button", () => {
    render(<SourcePanel />)
    const addButton = screen.getByLabelText("Add source")
    expect(addButton).toBeInTheDocument()
  })

  it("should render scrollable area", () => {
    render(<SourcePanel />)
    const panel = screen.getByText("Sources").closest("div")
    expect(panel).toBeInTheDocument()
  })
})
