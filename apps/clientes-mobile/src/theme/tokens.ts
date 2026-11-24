export const palette = {
  navyPrimary: "#0B1730",
  blueSecondary: "#172B4D",
  emerald: "#16A085",
  emeraldSoft: "#E6F7F4",
  emeraldDark: "#117A65",
  backgroundLight: "#F5F7FB",
  white: "#FFFFFF",
  textPrimary: "#172033",
  textSecondary: "#4A5568",
  textMuted: "#718096",
  borderLight: "#E2E8F0",
  borderSubtle: "#EDF2F7",
  warning: "#D97706",
  warningSoft: "#FEF3C7",
  danger: "#DC2626",
  dangerSoft: "#FEE2E2",
  info: "#2563EB",
  infoSoft: "#DBEAFE",
  demoAmber: "#B45309",
  demoAmberBg: "#FFFBEB",
  demoAmberBorder: "#FCD34D",
} as const;

export type ThemeMode = "light" | "dark";

export interface ThemeColors {
  mode: ThemeMode;
  primary: string;
  secondary: string;
  accent: string;
  accentSoft: string;
  background: string;
  surface: string;
  surfaceElevated: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;
}

export const lightTheme: ThemeColors = {
  mode: "light",
  primary: palette.navyPrimary,
  secondary: palette.blueSecondary,
  accent: palette.emerald,
  accentSoft: palette.emeraldSoft,
  background: palette.backgroundLight,
  surface: palette.white,
  surfaceElevated: palette.white,
  text: palette.textPrimary,
  textSecondary: palette.textSecondary,
  textMuted: palette.textMuted,
  border: palette.borderLight,
  success: palette.emerald,
  successSoft: palette.emeraldSoft,
  warning: palette.warning,
  warningSoft: palette.warningSoft,
  danger: palette.danger,
  dangerSoft: palette.dangerSoft,
  info: palette.info,
  infoSoft: palette.infoSoft,
};

/**
 * Dark mode token set prepared for future versions.
 */
export const darkTheme: ThemeColors = {
  mode: "dark",
  primary: "#0B1730",
  secondary: "#172B4D",
  accent: "#1ABC9C",
  accentSoft: "#0F3830",
  background: "#070F20",
  surface: "#0F1D3A",
  surfaceElevated: "#172B4D",
  text: "#F8FAFC",
  textSecondary: "#CBD5E1",
  textMuted: "#94A3B8",
  border: "#1E3A5F",
  success: "#16A085",
  successSoft: "#0F3830",
  warning: "#F59E0B",
  warningSoft: "#3B2806",
  danger: "#EF4444",
  dangerSoft: "#3B1219",
  info: "#3B82F6",
  infoSoft: "#172B4D",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  pill: 999,
} as const;

export const cardShadow = {
  shadowColor: "#0B1730",
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.06,
  shadowRadius: 14,
  elevation: 3,
} as const;

export const heroShadow = {
  shadowColor: "#0B1730",
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.18,
  shadowRadius: 20,
  elevation: 6,
} as const;
