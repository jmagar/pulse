import { render, screen, fireEvent } from "@testing-library/react"
import Home from "@/app/page"

describe("NotebookLM Integration", () => {
  it("should render complete application", () => {
    render(<Home />)

    // Header
    expect(screen.getByText("Pulse")).toBeInTheDocument()

    // Panels (appear in both desktop and mobile layouts)
    expect(screen.getAllByText("Sources").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("Chat").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("Studio").length).toBeGreaterThanOrEqual(1)
  })

  it("should enable send button when typing", () => {
    render(<Home />)

    // Get all textareas and buttons (one for desktop, one for mobile)
    const textareas = screen.getAllByPlaceholderText(/ask anything/i)
    const buttons = screen.getAllByLabelText("Send")

    // Test the first one (they both have the same behavior)
    expect(buttons[0]).toBeDisabled()

    fireEvent.change(textareas[0], { target: { value: "Test question" } })

    expect(buttons[0]).not.toBeDisabled()
  })

  it("should render source cards", () => {
    render(<Home />)

    // Source cards appear in both desktop and mobile layouts
    expect(screen.getAllByText("document-name.pdf").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/125 pages/).length).toBeGreaterThanOrEqual(1)
  })

  it("should render studio features", () => {
    render(<Home />)

    // Studio features appear in both desktop and mobile layouts
    expect(screen.getAllByText("Audio Overview").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("Video Overview").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("Mind Map").length).toBeGreaterThanOrEqual(1)
  })
})
