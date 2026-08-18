const KEY = "guest_id";

export function getGuestId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = `g_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}
