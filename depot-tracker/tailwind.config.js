/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg)",
        surface: "var(--color-surface)",
        "surface-2": "var(--color-surface-2)",
        ink: "var(--color-ink)",
        "ink-2": "var(--color-ink-2)",
        "ink-3": "var(--color-ink-3)",
        accent: "var(--color-accent)",
        gain: "var(--color-gain)",
        "gain-bg": "var(--color-gain-bg)",
        loss: "var(--color-loss)",
        "loss-bg": "var(--color-loss-bg)",
        warn: "var(--color-warn)",
        comdirect: "var(--color-comdirect)",
        scalable: "var(--color-scalable)",
      },
      fontFamily: {
        display: ["'DM Serif Display'", "serif"],
        sans: ["'DM Sans'", "Inter", "system-ui", "sans-serif"],
      },
      maxWidth: { app: "1280px" },
    },
  },
  plugins: [],
};
