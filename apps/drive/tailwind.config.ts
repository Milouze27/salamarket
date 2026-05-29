import type { Config } from "tailwindcss";
import { BRAND } from "./src/config/brand";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        // Plus Jakarta Sans unifié avec Salam Stock V2 — un seul typeface
        // sur toute l'app, déclinaisons via poids (800) et tracking
        // (-0.03em) pour les displays. 'manrope' alias conservé pour les
        // usages legacy. 'serif' alias retombe sur la même famille pour
        // ne pas casser les classes existantes (font-serif sera désactivé
        // visuellement par les overrides explicites des composants).
        sans: ['"Plus Jakarta Sans"', "system-ui", "sans-serif"],
        manrope: ['"Plus Jakarta Sans"', "system-ui", "sans-serif"],
      },
      colors: {
        border: BRAND.colors.border,
        input: "hsl(var(--input))",
        ring: BRAND.colors.primary,
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        bg: BRAND.colors.bg,
        text: BRAND.colors.text,
        muted: {
          DEFAULT: BRAND.colors.muted,
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: BRAND.colors.accent,
          foreground: "#FFFFFF",
        },
        primary: {
          DEFAULT: BRAND.colors.primary,
          foreground: "#FFFFFF",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        // Hero slider — zoom lent type "ken burns" sur l'image active.
        "ken-burns": {
          "0%": { transform: "scale(1) translate(0, 0)" },
          "100%": { transform: "scale(1.08) translate(-1%, 1%)" },
        },
        // Hero CTA — sweep doré subtil qui passe sur le bouton (toutes les 4s).
        shimmer: {
          "0%": { transform: "translateX(-150%) skewX(-20deg)" },
          "100%": { transform: "translateX(250%) skewX(-20deg)" },
        },
        // Skeleton — gradient horizontal qui défile (plus premium qu'un pulse).
        "skeleton-shimmer": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        // Cart badge — bump quand quantité change.
        "cart-bump": {
          "0%": { transform: "scale(1)" },
          "30%": { transform: "scale(1.35)" },
          "60%": { transform: "scale(0.92)" },
          "100%": { transform: "scale(1)" },
        },
        // Success — cercle qui pop puis settle.
        "success-pop": {
          "0%": { transform: "scale(0)", opacity: "0" },
          "60%": { transform: "scale(1.15)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        // Success — check SVG qui se dessine via stroke-dashoffset.
        "draw-check": {
          "0%": { strokeDashoffset: "60" },
          "100%": { strokeDashoffset: "0" },
        },
        // Success — halo qui pulse autour du check (3 fois puis stop).
        "halo-ping": {
          "0%": { transform: "scale(1)", opacity: "0.6" },
          "100%": { transform: "scale(2.2)", opacity: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "ken-burns": "ken-burns 8s ease-out forwards",
        shimmer: "shimmer 2.5s ease-in-out infinite",
        "skeleton-shimmer": "skeleton-shimmer 1.6s ease-in-out infinite",
        "cart-bump": "cart-bump 0.4s ease-out",
        "success-pop": "success-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
        "draw-check": "draw-check 0.5s ease-out 0.4s forwards",
        "halo-ping": "halo-ping 1.4s ease-out forwards",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
