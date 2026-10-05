import type { Config } from "tailwindcss";

// G Developments identity: a monochrome base with three muted status
// accents. Every hue-based Tailwind palette the app used before is remapped
// here, so existing `indigo-*`/`sky-*` classes render in the grey ramp and
// `emerald-*`/`amber-*`/`red-*` render in the brand's status hues.
const grey = {
  50: "#FAFAFA",
  100: "#F4F4F4",
  200: "#E6E6E6",
  300: "#BFBFBF",
  400: "#9A9A9A",
  500: "#6B6B6B",
  600: "#404040",
  700: "#262626",
  800: "#141414",
  900: "#0A0A0A",
  950: "#000000",
};
const success = {
  50: "#F1F7F3",
  100: "#E0EEE5",
  200: "#BCD9C6",
  300: "#8DBC9E",
  400: "#5A9A71",
  500: "#2F7D4C",
  600: "#1E6B3A",
  700: "#185730",
  800: "#134425",
  900: "#0E331C",
  950: "#08200F",
};
const warning = {
  50: "#FBF6EC",
  100: "#F5EAD2",
  200: "#E9D2A3",
  300: "#D6B26A",
  400: "#B98A33",
  500: "#9E6F12",
  600: "#8A5A00",
  700: "#704900",
  800: "#573900",
  900: "#3F2900",
  950: "#271900",
};
const danger = {
  50: "#FCF2F1",
  100: "#F8E1DF",
  200: "#EFBEBA",
  300: "#E0918A",
  400: "#CC5A51",
  500: "#BE3A30",
  600: "#B3261E",
  700: "#931F18",
  800: "#731813",
  900: "#53110E",
  950: "#330A08",
};

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Helvetica Now Text"', '"Helvetica Neue"', "Helvetica", "Arial", "sans-serif"],
        display: [
          '"Helvetica Now Display"',
          '"Helvetica Neue"',
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      transitionDuration: {
        DEFAULT: "140ms",
      },
      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      colors: {
        slate: grey,
        gray: grey,
        zinc: grey,
        neutral: grey,
        stone: grey,
        indigo: grey,
        violet: grey,
        purple: grey,
        blue: grey,
        sky: grey,
        cyan: grey,
        teal: grey,
        emerald: success,
        green: success,
        amber: warning,
        yellow: warning,
        orange: warning,
        red: danger,
        rose: danger,
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
    },
    // Architectural, square corners everywhere; only true circles (avatars,
    // status dots) keep `rounded-full`.
    borderRadius: {
      none: "0",
      sm: "0",
      DEFAULT: "0",
      md: "0",
      lg: "0",
      xl: "0",
      "2xl": "0",
      "3xl": "0",
      full: "9999px",
    },
    // Separation comes from hairlines, not shadows. Floating layers (menus,
    // toasts) keep one flat, tight shadow so they read above the page.
    boxShadow: {
      none: "none",
      sm: "none",
      DEFAULT: "none",
      md: "none",
      lg: "0 1px 0 0 rgb(0 0 0 / 0.04), 0 8px 24px -12px rgb(0 0 0 / 0.18)",
      xl: "0 1px 0 0 rgb(0 0 0 / 0.04), 0 8px 24px -12px rgb(0 0 0 / 0.18)",
      "2xl": "none",
      inner: "none",
      soft: "none",
      glow: "none",
    },
  },
  plugins: [],
};

export default config;
