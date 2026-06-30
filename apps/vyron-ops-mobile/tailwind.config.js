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
          bg: "#070D18",
          surface: "#0F172A",
          card: "#152033",
          cardGlass: "rgba(21, 32, 51, 0.72)",
          border: "#1E293B",
          emerald: "#10B981",
          emeraldDark: "#059669",
          emeraldGlow: "#34D399",
          violet: "#7C3AED",
          rose: "#F43F5E",
          amber: "#F59E0B",
          text: "#F8FAFC",
          muted: "#94A3B8",
          subtle: "#64748B",
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
        "vyron-emerald": "0 8px 32px rgba(16, 185, 129, 0.18)",
      },
    },
  },
  plugins: [],
};
