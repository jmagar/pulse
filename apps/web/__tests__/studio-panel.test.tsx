import { render, screen } from "@testing-library/react"
import { StudioPanel } from "@/components/studio-panel"

describe("StudioPanel", () => {
  it("should render Studio header", () => {
    render(<StudioPanel />)
    expect(screen.getByText("Studio")).toBeInTheDocument()
  })

  it("should render studio features", () => {
    render(<StudioPanel />)
    expect(screen.getByText("Audio Overview")).toBeInTheDocument()
    expect(screen.getByText("Video Overview")).toBeInTheDocument()
    expect(screen.getByText("Mind Map")).toBeInTheDocument()
  })

  it("should render scrollable area", () => {
    render(<StudioPanel />)
    const panel = screen.getByText("Studio").closest("div")
    expect(panel).toBeInTheDocument()
  })
})
