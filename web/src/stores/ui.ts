import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';

interface UiState {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  theme: Theme;
  paletteOpen: boolean;
  dealsView: 'board' | 'list';
  toggleSidebar: () => void;
  setMobileNav: (open: boolean) => void;
  setTheme: (t: Theme) => void;
  setPalette: (open: boolean) => void;
  setDealsView: (v: 'board' | 'list') => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      mobileNavOpen: false,
      theme: 'system',
      paletteOpen: false,
      dealsView: 'board',
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setMobileNav: (mobileNavOpen) => set({ mobileNavOpen }),
      setTheme: (theme) => { set({ theme }); applyTheme(theme); },
      setPalette: (paletteOpen) => set({ paletteOpen }),
      setDealsView: (dealsView) => set({ dealsView }),
    }),
    { name: 'nimbus-ui', partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, theme: s.theme, dealsView: s.dealsView }) },
  ),
);

export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(useUi.getState().theme));
