import { render, screen } from "@testing-library/react"
import { StudioTile } from "@/components/studio-tile"
import { Music2 } from "lucide-react"

describe("StudioTile", () => {
  it("should render title", () => {
    render(
      <StudioTile
        icon={<Music2 />}
        title="Audio Overview"
        desc="Generate a podcast"
        cta="Generate"
      />
    )

    expect(screen.getByText("Audio Overview")).toBeInTheDocument()
  })

  it("should render description", () => {
    render(
      <StudioTile
        icon={<Music2 />}
        title="Audio Overview"
        desc="Generate a podcast"
        cta="Generate"
      />
    )

    expect(screen.getByText("Generate a podcast")).toBeInTheDocument()
  })

  it("should render CTA button", () => {
    render(
      <StudioTile
        icon={<Music2 />}
        title="Audio Overview"
        desc="Generate a podcast"
        cta="Generate"
      />
    )

    expect(screen.getByRole("button", { name: "Generate" })).toBeInTheDocument()
  })
})
