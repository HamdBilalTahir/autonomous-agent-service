import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#6E3482", // Rich Purple
          dark: "#49225B", // Deep Royal Purple
          light: "#A56ABD", // Soft Lavender Purple
          mist: "#E7DBEF", // Light Lavender Mist
          surface: "#F5EBFA", // Very Light Lilac / Off-White Purple
        },
        secondary: {
          DEFAULT: "#F5EBFA", // Using Surface as secondary for now, or could be a complementary
          foreground: "#49225B",
        },
        destructive: {
          DEFAULT: "#ef4444", // Red-500
          foreground: "#fafafa", // White
        },
        muted: {
          DEFAULT: "#f4f4f5", // Zinc-100
          foreground: "#71717a", // Zinc-500
        },
        accent: {
          DEFAULT: "#E7DBEF", // Mist
          foreground: "#49225B", // Dark Purple
        },
        background: "#FFFFFF",
        foreground: "#0f172a", // Slate-900
      },
      fontFamily: {
        sans: ["var(--font-inter)"],
      },
      boxShadow: {
        soft: "0 2px 10px rgba(73, 34, 91, 0.05)",
        medium: "0 4px 20px rgba(73, 34, 91, 0.08)",
        hard: "0 8px 30px rgba(73, 34, 91, 0.12)",
      },
    },
  },
  plugins: [],
};
export default config;
