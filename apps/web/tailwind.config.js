/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ألوان هوية صفّ المستمدة من الشعار (تركوازي + ذهبي)
        brand: {
          50: "#eef7f9",
          100: "#d5eaee",
          200: "#aad5dd",
          300: "#75b8c4",
          400: "#4497a7",
          500: "#2b7d8e",
          600: "#1f6675",
          700: "#1b5460",
          800: "#1a4551",
          900: "#183b45",
        },
        gold: {
          50: "#fdf7ec",
          100: "#f9e9cb",
          200: "#f2d193",
          300: "#ebb85c",
          400: "#e0a24e",
          500: "#d18c34",
          600: "#b56f29",
          700: "#915224",
          800: "#774224",
          900: "#653820",
        },
      },
      fontFamily: {
        sans: ["Tajawal", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 10px 40px -12px rgba(26, 69, 81, 0.25)",
      },
    },
  },
  plugins: [],
};
