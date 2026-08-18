/** 默认礼物 emoji（后端未配置 icon 时按 id 匹配） */
export const GIFT_EMOJI: Record<string, string> = {
  heart: "💗",
  rose: "🌹",
  car: "🏎️",
  rocket: "🚀",
  crown: "👑",
};

export function giftEmoji(id: string, icon?: string): string {
  return icon ?? GIFT_EMOJI[id] ?? "🎁";
}
