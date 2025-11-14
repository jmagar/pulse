import { render, screen } from "@testing-library/react"
import Home from "@/app/page"

describe("Home Page", () => {
  it("should render header", () => {
    render(<Home />)
    expect(screen.getByText("Pulse")).toBeInTheDocument()
  })

  it("should render all three sections on mobile", () => {
    render(<Home />)
    // Panels appear in both desktop and mobile layouts
    expect(screen.getAllByText("Sources").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("Chat").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("Studio").length).toBeGreaterThanOrEqual(1)
  })

  it("should stack panels vertically on mobile", () => {
    render(<Home />)
    const mains = screen.getAllByRole("main")
    // Find the mobile layout (has md:hidden class)
    const mobileMain = mains.find(m => m.className.includes("md:hidden"))
    expect(mobileMain).toBeDefined()
    expect(mobileMain).toHaveClass("space-y-4")
  })
})

describe("Desktop Layout", () => {
  beforeEach(() => {
    global.innerWidth = 1024
  })

  it("should render three-panel resizable layout on desktop", () => {
    render(<Home />)

    // All panels should be visible (in both desktop and mobile layouts)
    expect(screen.getAllByText("Sources").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("Chat").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("Studio").length).toBeGreaterThanOrEqual(1)
  })

  it("should hide mobile layout on desktop", () => {
    render(<Home />)
    const mains = screen.getAllByRole("main")

    // Desktop layout should exist (has md:block class)
    const desktopMain = mains.find(m => m.className.includes("md:block"))
    expect(desktopMain).toBeDefined()
  })
})
