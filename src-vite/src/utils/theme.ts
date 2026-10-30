export const SCALE_VALUES = [0.8, 0.9, 1, 1.1, 1.2] as const;

export const BASE_FONT_SIZE = 16;

/**
 * Persisted settings can hold a stale or out-of-range scale (older schema
 * versions stored an option index, so `0` could leak in). An unchecked value
 * multiplies straight into the root font size, and `0` renders every piece of
 * text at 0px, so always fall back to the default scale.
 */
export function normalizeScale(scale: number): number {
  return SCALE_VALUES.find((value) => value === scale) ?? 1;
}

export const SCALE_LABELS = ['Smaller', 'Small', 'Default', 'Large', 'Larger'];

/** Light or dark UI. Numeric because the persisted settings have always stored 0/1. */
export enum Appearance {
  Light = 0,
  Dark = 1,
}

export const APPEARANCE_OPTIONS = [
  { label: 'Light', value: Appearance.Light },
  { label: 'Dark', value: Appearance.Dark },
];

// Self-hosted fonts (bundled via @fontsource, see src/styles/fonts.ts).
// `stack` is the CSS font-family value applied to the whole app.
const FONT_OPTIONS = [
  { id: 'default', label: 'Default', stack: "'Open Sans Variable', system-ui, sans-serif" },
  { id: 'inter', label: 'Inter', stack: "'Inter Variable', system-ui, sans-serif" },
  { id: 'poppins', label: 'Poppins', stack: "'Poppins', system-ui, sans-serif" },
  { id: 'nunito', label: 'Nunito', stack: "'Nunito Variable', system-ui, sans-serif" },
  { id: 'lora', label: 'Lora', stack: "'Lora Variable', Georgia, serif" },
  {
    id: 'space-grotesk',
    label: 'Space Grotesk',
    stack: "'Space Grotesk Variable', system-ui, sans-serif",
  },
] as const;

export const FONT_LABELS = FONT_OPTIONS.map((font) => font.label);

const THEME_OPTIONS = [
  {
    id: 'default',
    label: 'Photokin',
    action: '221.2 83.2% 45%',
    light: {
      primary: '221.2 83.2% 53.3%',
      primaryForeground: '0 0% 100%',
      navbar: '221.2 83.2% 53.3%',
      navbarForeground: '210 40% 98%',
      secondaryNavbar: '210 40% 96.1%',
      secondaryNavbarForeground: '222.2 47.4% 11.2%',
    },
    dark: {
      primary: '217.2 91.2% 59.8%',
      primaryForeground: '222.2 84% 4.9%',
      navbar: '222 47% 14%',
      navbarForeground: '210 40% 98%',
      secondaryNavbar: '217.2 32.6% 17.5%',
      secondaryNavbarForeground: '210 40% 98%',
    },
  },
  {
    id: 'slack',
    label: 'Slack',
    action: '266 84% 46%',
    light: {
      primary: '266 84% 56%',
      primaryForeground: '0 0% 100%',
      navbar: '267 38% 26%',
      navbarForeground: '265 100% 96%',
      secondaryNavbar: '266 23% 92%',
      secondaryNavbarForeground: '262 28% 18%',
    },
    dark: {
      primary: '267 84% 68%',
      primaryForeground: '222.2 84% 4.9%',
      navbar: '266 41% 12%',
      navbarForeground: '265 100% 95%',
      secondaryNavbar: '266 28% 20%',
      secondaryNavbarForeground: '266 58% 91%',
    },
  },
  {
    id: 'discord',
    label: 'Discord',
    action: '235 86% 55%',
    light: {
      primary: '235 86% 65%',
      primaryForeground: '0 0% 100%',
      navbar: '235 86% 65%',
      navbarForeground: '0 0% 100%',
      secondaryNavbar: '220 14% 96%',
      secondaryNavbarForeground: '225 7% 23%',
    },
    dark: {
      primary: '235 86% 65%',
      primaryForeground: '0 0% 100%',
      navbar: '228 7% 14%',
      navbarForeground: '225 6% 87%',
      secondaryNavbar: '223 7% 20%',
      secondaryNavbarForeground: '220 13% 91%',
    },
  },
  {
    id: 'youtube',
    label: 'YouTube',
    action: '0 100% 40%',
    light: {
      primary: '0 100% 50%',
      primaryForeground: '222.2 84% 4.9%',
      navbar: '0 100% 40%',
      navbarForeground: '0 0% 100%',
      secondaryNavbar: '0 0% 97%',
      secondaryNavbarForeground: '0 0% 12%',
    },
    dark: {
      primary: '0 100% 56%',
      primaryForeground: '222.2 84% 4.9%',
      navbar: '0 0% 12%',
      navbarForeground: '0 0% 96%',
      secondaryNavbar: '0 0% 16%',
      secondaryNavbarForeground: '0 0% 91%',
    },
  },
  {
    id: 'spotify',
    label: 'Spotify',
    action: '141 73% 27%',
    light: {
      primary: '141 73% 42%',
      primaryForeground: '222.2 84% 4.9%',
      navbar: '141 73% 27%',
      navbarForeground: '0 0% 100%',
      secondaryNavbar: '141 25% 93%',
      secondaryNavbarForeground: '141 42% 15%',
    },
    dark: {
      primary: '141 73% 42%',
      primaryForeground: '222.2 84% 4.9%',
      navbar: '0 0% 8%',
      navbarForeground: '141 56% 90%',
      secondaryNavbar: '0 0% 14%',
      secondaryNavbarForeground: '141 42% 90%',
    },
  },
  {
    id: 'github',
    label: 'GitHub',
    action: '212 92% 38%',
    light: {
      primary: '212 92% 45%',
      primaryForeground: '0 0% 100%',
      navbar: '215 17% 18%',
      navbarForeground: '210 40% 98%',
      secondaryNavbar: '210 17% 95%',
      secondaryNavbarForeground: '215 15% 17%',
    },
    dark: {
      primary: '212 92% 58%',
      primaryForeground: '222.2 84% 4.9%',
      navbar: '220 14% 10%',
      navbarForeground: '220 14% 92%',
      secondaryNavbar: '220 14% 16%',
      secondaryNavbarForeground: '213 22% 88%',
    },
  },
] as const;

export const THEME_LABELS = THEME_OPTIONS.map((theme) => theme.label);

const THEME_IDS = THEME_OPTIONS.map((theme) => theme.id);

export function getThemeId(themeIndex: number): string {
  return THEME_IDS[themeIndex] ?? THEME_IDS[0];
}

export function applyAppearance(appearance: Appearance): void {
  document.documentElement.classList.toggle('dark', appearance === Appearance.Dark);
}

export function applyTheme(appearance: Appearance, lightTheme: number, darkTheme: number): void {
  const themeId = getThemeId(appearance === Appearance.Light ? lightTheme : darkTheme);
  document.documentElement.dataset.theme = themeId;

  const theme = THEME_OPTIONS.find((item) => item.id === themeId);
  if (!theme) {
    document.documentElement.style.removeProperty('--primary');
    document.documentElement.style.removeProperty('--primary-foreground');
    document.documentElement.style.removeProperty('--action');
    document.documentElement.style.removeProperty('--action-foreground');
    document.documentElement.style.removeProperty('--ring');
    document.documentElement.style.removeProperty('--main-navbar');
    document.documentElement.style.removeProperty('--main-navbar-foreground');
    document.documentElement.style.removeProperty('--secondary-navbar');
    document.documentElement.style.removeProperty('--secondary-navbar-foreground');
    return;
  }
  const palette = appearance === Appearance.Light ? theme.light : theme.dark;

  document.documentElement.style.setProperty('--primary', palette.primary);
  document.documentElement.style.setProperty('--primary-foreground', palette.primaryForeground);
  document.documentElement.style.setProperty('--action', theme.action);
  document.documentElement.style.setProperty('--action-foreground', '0 0% 100%');
  document.documentElement.style.setProperty(
    '--ring',
    appearance === Appearance.Light ? theme.action : palette.primary,
  );
  document.documentElement.style.setProperty('--main-navbar', palette.navbar);
  document.documentElement.style.setProperty('--main-navbar-foreground', palette.navbarForeground);
  document.documentElement.style.setProperty('--secondary-navbar', palette.secondaryNavbar);
  document.documentElement.style.setProperty(
    '--secondary-navbar-foreground',
    palette.secondaryNavbarForeground,
  );
}

export function applyFontScale(scale: number): void {
  document.documentElement.style.fontSize = `${normalizeScale(scale) * BASE_FONT_SIZE}px`;
}

export function applyFont(fontIndex: number): void {
  const font = FONT_OPTIONS[fontIndex] ?? FONT_OPTIONS[0];
  document.documentElement.style.setProperty('--app-font', font.stack);
}

export function applyAllSettings(settings: {
  appearance: Appearance;
  lightTheme: number;
  darkTheme: number;
  scale: number;
  font: number;
}): void {
  applyAppearance(settings.appearance);
  applyTheme(settings.appearance, settings.lightTheme, settings.darkTheme);
  applyFontScale(settings.scale);
  applyFont(settings.font);
}
