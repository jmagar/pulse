import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React from "react"
import { describe, expect, it, vi } from "vitest"

import { Button, buttonVariants } from "../components/ui/button"

describe("Button component", () => {
  it("renders children and merges class names", () => {
    render(
      <Button className="custom-class" variant="secondary">
        Save
      </Button>,
    )

    const button = screen.getByRole("button", { name: "Save" })
    expect(button).toHaveClass("custom-class")
    expect(button).toHaveClass("bg-secondary")
  })

  it("invokes the click handler when pressed", async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Press me</Button>)

    await user.click(screen.getByRole("button", { name: /press me/i }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe("buttonVariants", () => {
  it("provides icon sizing when requested", () => {
    expect(buttonVariants({ size: "icon" })).toContain("w-9")
  })
})
