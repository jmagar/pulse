import { render, screen } from "@testing-library/react"
import { Header } from "@/components/header"

describe("Header", () => {
  it("should render Pulse branding", () => {
    render(<Header />)
    expect(screen.getByText("Pulse")).toBeInTheDocument()
  })

  it("should render on mobile viewport", () => {
    global.innerWidth = 375
    render(<Header />)

    const header = screen.getByRole("banner")
    expect(header).toBeInTheDocument()
  })

  it("should have sticky positioning", () => {
    render(<Header />)

    const header = screen.getByRole("banner")
    expect(header).toHaveClass("sticky")
  })
})
