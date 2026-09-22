/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./features/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        vyron: {
          bg: "#061722",
          surface: "#0B202B",
          card: "#0F2D39",
          cardGlass: "rgba(15, 45, 57, 0.72)",
          border: "#163A48",
          emerald: "#43A95A",
          emeraldDark: "#3E9B52",
          emeraldGlow: "#55B968",
          violet: "#F4C44E",
          gold: "#F4C44E",
          rose: "#F43F5E",
          amber: "#F59E0B",
          text: "#F8FAFC",
          muted: "#93AEB9",
          subtle: "#5F8595",
        },
      },
      borderRadius: {
        vyron: "20px",
        "vyron-lg": "24px",
      },
      fontSize: {
        "vyron-title": ["28px", { lineHeight: "34px", fontWeight: "700" }],
        "vyron-heading": ["22px", { lineHeight: "28px", fontWeight: "700" }],
        "vyron-body": ["16px", { lineHeight: "24px", fontWeight: "500" }],
        "vyron-caption": ["13px", { lineHeight: "18px", fontWeight: "500" }],
      },
      boxShadow: {
        vyron: "0 12px 40px rgba(0, 0, 0, 0.35)",
        "vyron-emerald": "0 8px 32px rgba(67, 169, 90, 0.18)",
      },
    },
  },
  plugins: [],
};
