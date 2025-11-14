import { render, screen } from "@testing-library/react"
import { EmptyChat } from "@/components/empty-chat"

describe("EmptyChat", () => {
  it("should render heading", () => {
    render(<EmptyChat />)
    expect(screen.getByText("Ask me anything")).toBeInTheDocument()
  })

  it("should render description", () => {
    render(<EmptyChat />)
    expect(screen.getByText(/help you understand/i)).toBeInTheDocument()
  })

  it("should render suggestion buttons", () => {
    render(<EmptyChat />)
    expect(screen.getByText("What are the main themes?")).toBeInTheDocument()
  })
})
