/**
 * Clearbit's public logo URLs are often dead (product deprecated / access restricted).
 * We use Google's favicon service instead — stable, embeddable, keyed by brand domain.
 *
 * @see https://www.google.com/s2/favicons?domain=example.com&sz=128
 */
export function buildGoogleFaviconLogoUrl(domain: string): string {
  let d = domain.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "");
  d = d.split("/")[0] ?? d;
  if (d.startsWith("www.")) d = d.slice(4);
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=128`;
}

/** Rewrite legacy Clearbit logo lines to Google favicon URLs; ensure favicon URLs have sz. */
export function normalizeLogoUrlForDisplay(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  try {
    const u = new URL(trimmed);
    if (u.hostname === "logo.clearbit.com" || u.hostname.endsWith(".clearbit.com")) {
      const seg = u.pathname.replace(/^\//, "").split("/")[0] ?? "";
      if (seg.includes(".")) return buildGoogleFaviconLogoUrl(seg);
    }
    if (u.hostname === "www.google.com" && u.pathname === "/s2/favicons") {
      const domain = u.searchParams.get("domain");
      if (domain) {
        if (!u.searchParams.has("sz")) u.searchParams.set("sz", "128");
        return u.toString();
      }
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}

/** Normalize every `Logo: <url>` line in stored question text (DB may still have Clearbit). */
export function rewriteLogoUrlsInQuestionText(question: string): string {
  return question.replace(
    /^(\s*Logo(?:\s*URL)?\s*[:\-]\s*)(https?:\/\/\S+)/gim,
    (_full, prefix: string, url: string) => `${prefix}${normalizeLogoUrlForDisplay(url)}`
  );
}
