// Favicon unread badge + tab title + desktop notification, driven by Inbox
// unseen count.
const FAVICON_SIZE = 64;
const BASE_FAVICON_HREF = "/webmail/favicon.svg";
const BASE_TITLE = "Mailbox";

let faviconLink: HTMLLinkElement | null = null;

function getFaviconLink(): HTMLLinkElement {
  if (faviconLink) return faviconLink;
  faviconLink =
    document.querySelector<HTMLLinkElement>("link[rel~='icon']") ||
    document.createElement("link");
  faviconLink.rel = "icon";
  if (!faviconLink.parentNode) document.head.appendChild(faviconLink);
  return faviconLink;
}

export function updateFaviconBadge(count: number) {
  const link = getFaviconLink();
  if (count <= 0) {
    link.href = BASE_FAVICON_HREF;
    return;
  }
  const canvas = document.createElement("canvas");
  canvas.width = FAVICON_SIZE;
  canvas.height = FAVICON_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, FAVICON_SIZE, FAVICON_SIZE);
    ctx.drawImage(img, 0, 0, FAVICON_SIZE, FAVICON_SIZE);
    const label = count > 99 ? "99+" : String(count);
    const radius = label.length > 2 ? 22 : 18;
    const cx = FAVICON_SIZE - radius + 2;
    const cy = radius - 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#e5484d";
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${label.length > 2 ? 20 : 26}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, cx, cy + 1);
    link.href = canvas.toDataURL("image/png");
  };
  img.onerror = () => {
    // leave whatever's already showing
  };
  img.src = BASE_FAVICON_HREF;
}

export function updateDocumentTitle(count: number) {
  if (typeof document === "undefined") return;
  document.title = count > 0 ? `(${count > 99 ? "99+" : count}) ${BASE_TITLE}` : BASE_TITLE;
}

export function requestNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

export function notifyNewMail(newCount: number) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return; // already visible in-app
  const title = newCount === 1 ? "New message" : `${newCount} new messages`;
  try {
    const notification = new Notification(title, {
      body: "You have new mail in your inbox",
      icon: BASE_FAVICON_HREF,
      tag: "mail-justu-new-mail",
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // non-fatal
  }
}
