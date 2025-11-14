import { render, screen } from "@testing-library/react"
import { AssistantMessage, UserMessage } from "@/components/chat-message"

describe("Chat Messages", () => {
  describe("AssistantMessage", () => {
    it("should render assistant label", () => {
      render(<AssistantMessage>Hello</AssistantMessage>)
      expect(screen.getByText("Assistant")).toBeInTheDocument()
    })

    it("should render message content", () => {
      render(<AssistantMessage>Test message</AssistantMessage>)
      expect(screen.getByText("Test message")).toBeInTheDocument()
    })
  })

  describe("UserMessage", () => {
    it("should render user message", () => {
      render(<UserMessage>User question</UserMessage>)
      expect(screen.getByText("User question")).toBeInTheDocument()
    })

    it("should align to right on mobile", () => {
      render(<UserMessage>Test</UserMessage>)
      const message = screen.getByText("Test")
      const container = message.closest("div")?.parentElement
      expect(container).toHaveClass("justify-end")
    })
  })
})
