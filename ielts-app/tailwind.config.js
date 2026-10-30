/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#e0ecff",
          200: "#c7dbff",
          300: "#a3c2ff",
          400: "#789dff",
          500: "#5577f5",
          600: "#3b55e0",
          700: "#2f41bc",
          800: "#2a3998",
          900: "#283679",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
