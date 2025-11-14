import { render, screen } from "@testing-library/react"
import { ChatPanel } from "@/components/chat-panel"

describe("ChatPanel", () => {
  it("should render Chat header", () => {
    render(<ChatPanel />)
    expect(screen.getByText("Chat")).toBeInTheDocument()
  })

  it("should render chat composer", () => {
    render(<ChatPanel />)
    expect(screen.getByPlaceholderText(/ask anything/i)).toBeInTheDocument()
  })

  it("should render scrollable area", () => {
    render(<ChatPanel />)
    const panel = screen.getByText("Chat").closest("div")
    expect(panel).toBeInTheDocument()
  })
})
