import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React from "react"

import Home from "../app/page"

describe("Home page", () => {
  it("shows the hero message and navigation links", () => {
    render(<Home />)

    expect(
      screen.getByRole("heading", {
        name: /to get started, edit the page\.tsx file\./i,
      }),
    ).toBeInTheDocument()

    const links = screen.getAllByRole("link")
    const hrefs = links.map((link) => link.getAttribute("href"))
    expect(hrefs).toEqual(
      expect.arrayContaining([
        expect.stringContaining("vercel.com/new"),
        expect.stringContaining("nextjs.org/docs"),
      ]),
    )
  })

  it("allows users to reach the deploy call to action using the keyboard", async () => {
    const user = userEvent.setup()
    render(<Home />)

    const deployLink = screen.getByRole("link", { name: /deploy now/i })

    for (let i = 0; i < 10 && document.activeElement !== deployLink; i += 1) {
      await user.tab()
    }

    expect(deployLink).toHaveFocus()
  })
})
