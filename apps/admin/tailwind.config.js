/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f4f6f8",
          100: "#e4e9ee",
          200: "#c9d3dc",
          700: "#2c3a47",
          800: "#1b2630",
          900: "#101820",
        },
        accent: {
          400: "#3d9aad",
          500: "#1f6675",
          600: "#185560",
        },
      },
      fontFamily: {
        sans: ["IBM Plex Sans Arabic", "Tahoma", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
