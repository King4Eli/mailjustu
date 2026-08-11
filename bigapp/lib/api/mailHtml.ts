import sanitizeHtml from "sanitize-html";

interface InlineImage {
  cid?: string;
  contentType?: string;
  content?: Buffer;
}

function escapeRegExp(value: string): string {
  return value.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

// Swaps cid: image references for data: URIs before sanitizing.
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

// Plain-text fallback for reply quoting.
export function htmlToText(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Sanitizes to a safe allowlist. Still allows style tags/attrs -- safe
// only because the frontend renders this in a sandboxed iframe. Don't
// reuse this output outside that isolation.
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
