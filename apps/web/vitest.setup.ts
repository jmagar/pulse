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
    // Only pass valid <img> attributes to the native element
    const validImgProps = [
      "alt", "src", "width", "height", "srcSet", "sizes", "crossOrigin", "useMap", "loading", "referrerPolicy", "className", "style", "id", "title", "draggable", "onLoad", "onError", "tabIndex", "role", "aria-label", "aria-labelledby", "aria-describedby"
    ]
    const filteredProps: Record<string, unknown> = {}
    for (const key of validImgProps) {
      if (key in props) {
        filteredProps[key] = (props as Record<string, unknown>)[key]
      }
    }
    return React.createElement("img", filteredProps)
  },
}))
