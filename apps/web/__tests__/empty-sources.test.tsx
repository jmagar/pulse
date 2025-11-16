import { render, screen } from "@testing-library/react"
import { EmptySources } from "@/components/empty-sources"

describe("EmptySources", () => {
  it("should render empty state message", () => {
    render(<EmptySources />)
    expect(screen.getByText("No sources yet")).toBeInTheDocument()
  })

  it("should render add source button", () => {
    render(<EmptySources />)
    expect(
      screen.getByRole("button", { name: /add source/i })
    ).toBeInTheDocument()
  })

  it("should render icon", () => {
    render(<EmptySources />)
    const card = screen.getByText("No sources yet").closest("div")
    expect(card).toBeInTheDocument()
  })
})
