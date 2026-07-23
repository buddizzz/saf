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
          950: "#0c2129",
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
        card: "0 1px 2px rgba(12, 33, 41, 0.04), 0 12px 32px -16px rgba(12, 33, 41, 0.18)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: 0, transform: "translateY(6px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: 0, transform: "scale(0.95)" },
          "100%": { opacity: 1, transform: "scale(1)" },
        },
        float: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "50%": { transform: "translate(2%, -4%) scale(1.06)" },
        },
        "float-reverse": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "50%": { transform: "translate(-3%, 3%) scale(1.08)" },
        },
        "pop-in": {
          "0%": { opacity: 0, transform: "scale(0.7) rotate(-4deg)" },
          "60%": { opacity: 1, transform: "scale(1.08) rotate(2deg)" },
          "100%": { opacity: 1, transform: "scale(1) rotate(0)" },
        },
        confetti: {
          "0%": { transform: "translateY(0) rotate(0deg)", opacity: 0 },
          "12%": { opacity: 1 },
          "100%": { transform: "translateY(160px) rotate(220deg)", opacity: 0 },
        },
        "ring-expand": {
          "0%": { transform: "scale(0.85)", opacity: 0.55 },
          "100%": { transform: "scale(1.6)", opacity: 0 },
        },
        "dot-bounce": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-5px)" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "gradient-pan": {
          "0%": { backgroundPosition: "0% 50%" },
          "100%": { backgroundPosition: "200% 50%" },
        },
        "orb-drift": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "33%": { transform: "translate(4%, -6%) scale(1.1)" },
          "66%": { transform: "translate(-5%, 4%) scale(0.94)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.5s ease-out both",
        "scale-in": "scale-in 0.35s ease-out both",
        float: "float 9s ease-in-out infinite",
        "float-reverse": "float-reverse 11s ease-in-out infinite",
        "pop-in": "pop-in 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        confetti: "confetti 2.4s linear infinite",
        "ring-expand": "ring-expand 2.2s ease-out infinite",
        "dot-bounce": "dot-bounce 1.2s ease-in-out infinite",
        marquee: "marquee 28s linear infinite",
        "gradient-pan": "gradient-pan 5s linear infinite",
        "orb-drift": "orb-drift 14s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
