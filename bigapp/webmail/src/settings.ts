const LIST_WIDTH_KEY = "webui_list_width";
const COMPOSE_STYLE_KEY = "webui_compose_style";
const SIGNATURE_KEY = "webui_signature";

export const LIST_WIDTH_MIN = 280;
export const LIST_WIDTH_MAX = 640;
export const LIST_WIDTH_DEFAULT = 380;

export function getListWidth(): number {
  const stored = Number(localStorage.getItem(LIST_WIDTH_KEY));
  if (!stored || stored < LIST_WIDTH_MIN || stored > LIST_WIDTH_MAX)
    return LIST_WIDTH_DEFAULT;
  return stored;
}

export function setListWidth(width: number) {
  localStorage.setItem(LIST_WIDTH_KEY, String(Math.round(width)));
}

export type ComposeStyle = "popup" | "full";

export function getComposeStyle(): ComposeStyle {
  return localStorage.getItem(COMPOSE_STYLE_KEY) === "full" ? "full" : "popup";
}

export function setComposeStyle(style: ComposeStyle) {
  localStorage.setItem(COMPOSE_STYLE_KEY, style);
}

// Stored client-side (no per-account server profile exists) as plain
// text, appended to new compose drafts. Not applied to replies/forwards
// or reopened drafts -- see ComposeModal.
export function getSignature(): string {
  return localStorage.getItem(SIGNATURE_KEY) || "";
}

export function setSignature(signature: string) {
  if (signature) localStorage.setItem(SIGNATURE_KEY, signature);
  else localStorage.removeItem(SIGNATURE_KEY);
}
