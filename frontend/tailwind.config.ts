import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      boxShadow: {
        glow: "0 0 0 1px rgba(31, 41, 55, 0.8), 0 20px 80px rgba(15, 23, 42, 0.35)"
      }
    }
  },
  plugins: []
};

export default config;

