import { render } from "@testing-library/react"
import RootLayout from "@/app/layout"

describe("RootLayout", () => {
  it("should apply dark class to html element", () => {
    render(
      <RootLayout>
        <div>Test</div>
      </RootLayout>
    )

    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })

  it("should render children", () => {
    const { getByText } = render(
      <RootLayout>
        <div>Test Content</div>
      </RootLayout>
    )

    expect(getByText("Test Content")).toBeInTheDocument()
  })
})
