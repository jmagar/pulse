import "@testing-library/jest-dom/vitest"
import React from "react"
import { vi } from "vitest"

vi.mock("next/font/google", () => ({
  Geist: () => ({
    className: "font-geist",
    variable: "--font-geist-sans",
  }),
  Geist_Mono: () => ({
    className: "font-geist-mono",
    variable: "--font-geist-mono",
  }),
}))

vi.mock("next/image", () => ({
  __esModule: true,
  default: (props: React.ComponentProps<"img"> & { priority?: boolean }) => {
    const { alt, priority: _priority, ...rest } = props
    // eslint-disable-next-line jsx-a11y/alt-text
    return React.createElement("img", {
      alt,
      ...rest,
    })
  },
}))
