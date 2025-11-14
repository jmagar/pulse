import { render, screen } from "@testing-library/react"
import Home from "@/app/page"

describe("Home Page", () => {
  it("should render header", () => {
    render(<Home />)
    expect(screen.getByText("Pulse")).toBeInTheDocument()
  })

  it("should render all three sections on mobile", () => {
    render(<Home />)
    expect(screen.getByText("Sources")).toBeInTheDocument()
    expect(screen.getByText("Chat")).toBeInTheDocument()
    expect(screen.getByText("Studio")).toBeInTheDocument()
  })

  it("should stack panels vertically on mobile", () => {
    render(<Home />)
    const main = screen.getByRole("main")
    expect(main).toHaveClass("space-y-4")
  })
})
