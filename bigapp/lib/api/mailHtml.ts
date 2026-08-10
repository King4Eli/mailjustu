import sanitizeHtml from "sanitize-html";

interface InlineImage {
  cid?: string;
  contentType?: string;
  content?: Buffer;
}

function escapeRegExp(value: string): string {
  return value.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

// Received HTML mail can reference its own image attachments via
// cid: URIs (inline/embedded images) -- there's no public URL to point
// those at, so swap them for data: URIs before sanitizing. Remote
// http(s) images are left alone; they load like in any other webmail.
function inlineCidImages(html: string, attachments: InlineImage[]): string {
  let result = html;
  for (const att of attachments) {
    if (!att.cid || !att.content) continue;
    const dataUri = `data:${att.contentType || "application/octet-stream"};base64,${att.content.toString("base64")}`;
    result = result.replace(
      new RegExp(`cid:${escapeRegExp(att.cid)}`, "gi"),
      dataUri,
    );
  }
  return result;
}

// Plain-text fallback for messages that never had a text/plain part --
// used for reply quoting, where markup would otherwise leak in verbatim.
export function htmlToText(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Renders a received message's HTML body safely: inline images resolved
// to data URIs, everything else stripped down to a safe tag/attribute
// allowlist (no script/iframe/on*, no javascript: URLs). Deliberately
// still allows `style` tags/attributes for legitimate mail formatting --
// safe only because the frontend renders this inside a sandboxed iframe
// (webmail/src/components/ReadingPane.tsx's MailHtmlFrame), not injected
// into the app's own DOM, so nothing here can leak out and affect the
// app's own styles or overlay its UI. Don't reuse this output outside
// that isolation without re-checking that assumption.
export function renderSafeHtml(
  html: string,
  attachments: InlineImage[],
): string {
  const withImages = inlineCidImages(html, attachments);
  return sanitizeHtml(withImages, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "img",
      "font",
      "span",
      "u",
      "style",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
    ]),
    allowedAttributes: {
      "*": ["style", "class", "align", "width", "height", "color", "bgcolor"],
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "width", "height"],
      font: ["face", "size", "color"],
      table: ["border", "cellpadding", "cellspacing"],
    },
    allowedSchemes: ["http", "https", "mailto", "data"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    allowVulnerableTags: false,
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        target: "_blank",
        rel: "noopener noreferrer",
      }),
    },
  });
}
