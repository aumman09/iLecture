import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        mfu: { DEFAULT: "#990000", hover: "#7F1D1D", gold: "#D97706" },
      },
      fontFamily: {
        sans: ["Inter", "IBM Plex Sans Thai", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      keyframes: {
        "slide-in-right": { from: { transform: "translateX(100%)" }, to: { transform: "translateX(0)" } },
        "fade-in-down": { from: { opacity: "0", transform: "translateY(-8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "pop": { "0%": { transform: "scale(1)" }, "40%": { transform: "scale(1.12)" }, "100%": { transform: "scale(1)" } },
        "sheet-up": { from: { transform: "translateY(100%)" }, to: { transform: "translateY(0)" } },
      },
      animation: {
        "slide-in-right": "slide-in-right 220ms ease-out",
        "fade-in-down": "fade-in-down 200ms ease-out",
        pop: "pop 260ms ease-out",
        "sheet-up": "sheet-up 240ms cubic-bezier(.2,.8,.2,1)",
      },
    },
  },
  plugins: [],
};
export default config;
