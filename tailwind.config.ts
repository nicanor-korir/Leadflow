import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        page: "#f6f7fb",
        card: "#ffffff",
        line: "#e6e8f0",
        ink: "#1a1f36",
        muted: "#6b7280",
        accent: {
          DEFAULT: "#4f46e5",
          soft: "#eef2ff",
          end: "#7c3aed",
        },
        hot: "#ef4444",
        warm: "#f59e0b",
        cold: "#3b82f6",
        good: "#10b981",
      },
      borderRadius: {
        xl: "12px",
        "2xl": "16px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(26,31,54,0.04), 0 8px 24px -12px rgba(26,31,54,0.12)",
        lift: "0 2px 4px rgba(26,31,54,0.06), 0 16px 32px -16px rgba(26,31,54,0.20)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "toast-in": {
          from: { opacity: "0", transform: "translateY(12px) scale(0.97)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(79,70,229,0.35)" },
          "70%": { boxShadow: "0 0 0 10px rgba(79,70,229,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(79,70,229,0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 260ms ease-out both",
        "toast-in": "toast-in 220ms cubic-bezier(0.16,1,0.3,1) both",
        "pulse-ring": "pulse-ring 1.4s ease-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
