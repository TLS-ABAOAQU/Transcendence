import { create } from 'zustand';

/**
 * 開閉状態の優先順位（高→低）:
 * 1. palette - コマンドパレット
 * 2. history - 履歴パネル
 * 3. picker - 日付/時間ピッカー
 * 4. modal - タスク/プロジェクト編集モーダル
 * 5. none - 何も開いていない
 */
export type Priority = 'palette' | 'history' | 'picker' | 'modal' | 'none';

interface KeyboardStore {
  // 状態
  commandPaletteOpen: boolean;
  historyExpanded: boolean;
  pickerOpen: boolean;
  modalOpen: boolean;
  activeScreen: 'board' | 'dashboard';

  // Setter
  setCommandPaletteOpen: (open: boolean) => void;
  setHistoryExpanded: (expanded: boolean) => void;
  setPickerOpen: (open: boolean) => void;
  setModalOpen: (open: boolean) => void;
  setActiveScreen: (screen: 'board' | 'dashboard') => void;

  // 最優先状態を取得
  getTopPriority: () => Priority;
}

export const useKeyboardStore = create<KeyboardStore>((set, get) => ({
  commandPaletteOpen: false,
  historyExpanded: false,
  pickerOpen: false,
  modalOpen: false,
  activeScreen: 'dashboard',

  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setHistoryExpanded: (expanded) => set({ historyExpanded: expanded }),
  setPickerOpen: (open) => set({ pickerOpen: open }),
  setModalOpen: (open) => set({ modalOpen: open }),
  setActiveScreen: (screen) => set({ activeScreen: screen }),

  getTopPriority: () => {
    const s = get();
    if (s.commandPaletteOpen) return 'palette';
    if (s.historyExpanded) return 'history';
    if (s.pickerOpen) return 'picker';
    if (s.modalOpen) return 'modal';
    return 'none';
  },
}));
