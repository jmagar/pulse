import { render, screen, fireEvent } from "@testing-library/react"
import { ChatComposer } from "@/components/chat-composer"

describe("ChatComposer", () => {
  it("should render textarea", () => {
    render(<ChatComposer />)
    expect(screen.getByPlaceholderText(/ask anything/i)).toBeInTheDocument()
  })

  it("should render send button", () => {
    render(<ChatComposer />)
    expect(screen.getByLabelText("Send")).toBeInTheDocument()
  })

  it("should disable send button when empty", () => {
    render(<ChatComposer />)
    const button = screen.getByLabelText("Send")
    expect(button).toBeDisabled()
  })

  it("should enable send button with text", () => {
    render(<ChatComposer />)
    const textarea = screen.getByPlaceholderText(/ask anything/i)
    const button = screen.getByLabelText("Send")

    fireEvent.change(textarea, { target: { value: "Hello" } })
    expect(button).not.toBeDisabled()
  })
})
