export function DesignTokens() {
  return (
    <style>{`
      /* shadcn expects HSL triplets */
      :root {
        --background: 0 0% 100%;
        --foreground: 224 71% 4%;
        --card: 0 0% 100%;
        --card-foreground: 224 71% 4%;
        --muted: 220 14% 96%;
        --muted-foreground: 220 9% 46%;
        --popover: 0 0% 100%;
        --popover-foreground: 224 71% 4%;
        --border: 220 13% 91%;
        --input: 220 13% 91%;
        --primary: 199 98% 49%; /* light blue 500 */
        --primary-foreground: 210 40% 98%;
        --ring: 199 98% 49%;
      }
      :root.dark {
        color-scheme: dark;
        --background: 220 18% 9%;      /* ~#141820 */
        --foreground: 210 20% 96%;
        --card: 220 18% 11%;
        --card-foreground: 210 20% 96%;
        --muted: 220 14% 15%;
        --muted-foreground: 215 16% 72%;
        --popover: 220 18% 11%;
        --popover-foreground: 210 20% 96%;
        --border: 220 14% 22%;
        --input: 220 14% 22%;
        --primary: 199 98% 49%;        /* #03A9F4 */
        --primary-foreground: 210 40% 98%;
        --ring: 199 98% 49%;
      }
    `}</style>
  )
}
