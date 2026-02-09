import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeName =
  | 'midnight-purple'
  | 'ocean-breeze'
  | 'forest-night'
  | 'sakura'
  | 'light'
  | 'ember'
  | 'sepia'
  | 'moss-garden'
  | 'candy-pop'
  | 'slate-storm'
  | 'dusty-rose';

export const THEME_LIST: readonly ThemeName[] = [
  // 暖色系（目に優しい）
  'sepia',
  'ember',           // Sandy Beach - 暖色ベージュ
  'dusty-rose',      // ピンク＋クリーム
  // ピンク系
  'sakura',          // Rose Quartz
  'candy-pop',       // カラフル（ピンク系）
  // 緑系
  'forest-night',    // Mint Meadow
  'moss-garden',     // 深い緑
  // 青・グレー系
  'ocean-breeze',    // Misty Harbor - 青灰
  'slate-storm',     // スレートグレー
  'light',           // Silver Mist - グレー
  // ダーク
  'midnight-purple',
] as const;

export const THEME_META: Record<ThemeName, { label: string; icon: string }> = {
  'midnight-purple': { label: 'Midnight Purple', icon: '🌙' },
  'ocean-breeze': { label: 'Misty Harbor', icon: '⚓️' },
  'forest-night': { label: 'Mint Meadow', icon: '🌿' },
  'sakura': { label: 'Rose Quartz', icon: '🥀' },
  'light': { label: 'Silver Mist', icon: '🌫️' },
  'ember': { label: 'Sandy Beach', icon: '🏖️' },
  'sepia': { label: 'Sepia (目に優しい)', icon: '📜' },
  'moss-garden': { label: 'Moss Garden', icon: '🌱' },
  'candy-pop': { label: 'Candy Pop', icon: '🍬' },
  'slate-storm': { label: 'Slate Storm', icon: '🌊' },
  'dusty-rose': { label: 'Dusty Rose', icon: '🌸' },
};

interface ThemeState {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'midnight-purple',
      setTheme: (theme) => {
        document.body.setAttribute('data-theme', theme);
        set({ theme });
      },
    }),
    {
      name: 'ppm-theme',
      onRehydrateStorage: () => (state) => {
        // Apply theme on page load
        if (state?.theme) {
          document.body.setAttribute('data-theme', state.theme);
        }
      },
    }
  )
);
