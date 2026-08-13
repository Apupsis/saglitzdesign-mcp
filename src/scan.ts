// Shared HTML-scanning primitives.
//
// `maskComments` started in security.ts; `elementSpan` and `flattenTags`
// started private in generic.ts, each grown wherever it was first needed.
// Both modules left a note that a third consumer should get a shared home
// instead of a third copy or a second one-way import — the SEO and
// performance auditors are that third consumer, so this module exists now.
//
// `scanTags` and `Tag` are re-exported from lint.ts here too, so a consumer
// of the scanning primitives needs one import rather than two.

import { scanTags, type Tag } from "./lint.js";

export { scanTags };
export type { Tag };

/**
 * Replace comment text with spaces (preserving length and line numbers) so
 * neither `extractHeaders` nor `securitySourceRules` treats commented-out
 * text — a header mention, or a code example in a doc comment — as real.
 * Comment styles are gated by file shape rather than applied blindly:
 *   - line comments and block comments in JS/TS-like files (`.js`, `.jsx`,
 *     `.ts`, `.tsx`, `.mjs`, `.cjs`) and in `.vue`/`.svelte`, which embed a
 *     real `<script>` block using the same syntax alongside their markup.
 *     A `_headers` file's route selector line legitimately starts with the
 *     two characters that open a block comment (meaning "all paths") —
 *     treating that as an unterminated block comment would blank out every
 *     header declaration that follows it in the file, so `_headers` is
 *     deliberately excluded from this group.
 *   - `#` only in `.toml` and `_headers` files, where it is their actual
 *     comment syntax. JSON has no comment syntax, so nothing is masked
 *     there — a `//` inside a URL string in vercel.json must survive.
 *   - `<!-- -->` universally; its four-character open and explicit close
 *     make it unambiguous wherever it appears — this is what covers
 *     `.html`/`.astro` templates, and the markup half of `.vue`/`.svelte`.
 *
 * In JS/TS-like files, a `'`/`"`/`` ` `` opens a string, tracked per line
 * (reset at each newline — this is not a tokenizer, and a template literal
 * that spans multiple lines is out of scope), and nothing inside that
 * string can open a comment; an escaped quote does not close it. This
 * replaced an earlier guard of "`//` not immediately preceded by `:`",
 * which approximated "inside a URL" when the real predicate is "inside a
 * string literal" — it missed `"//cdn.example.com"` (a protocol-relative
 * URL with nothing before the `//` on the line), which masked a real CSP
 * declaration on the rest of that line as `csp-missing`: a false negative
 * on correct configuration, the one direction this module refuses to ship.
 * Between under-masking a real comment (at worst reproduces the
 * commented-out-header case, which just stays a live finding) and
 * over-masking real code (fabricates `csp-missing` on a correct policy),
 * this errs toward the former wherever the two heuristics would disagree.
 *
 * Exported because `generic.ts` needs the same "don't flag commented-out
 * markup" guarantee for its visual rules — the same judgement Task 6 of the
 * security plan made for `scanTags`. Two consumers is a coincidence; three
 * would make this a shared module instead of a security.ts export.
 */
export function maskComments(source: string, path: string): string {
  // `.astro` is two languages in one file with a hard, unambiguous boundary:
  // the frontmatter fence. Inside it the content is TypeScript, where `//`
  // opens a comment; outside it the content is markup, where it does not.
  // Adding `.astro` to `isJsLike` wholesale would mask real template text
  // after any `//` — the over-masking the note above warns about, which
  // fabricates absence. Splitting on the fence gets both halves right, and
  // because `maskComments` is length-preserving the two masked halves
  // concatenate back to the original offsets.
  if (/\.astro$/i.test(path)) {
    const open = /^---[ \t]*\r?\n/.exec(source);
    const close = open ? source.indexOf("\n---", open[0].length - 1) : -1;
    if (open && close !== -1) {
      return maskComments(source.slice(0, close + 1), "frontmatter.ts")
        + maskComments(source.slice(close + 1), "template.html");
    }
    return maskComments(source, "template.html");
  }

  const isHeadersFile = /(^|\/)_headers$/.test(path);
  const isJsLike = /\.(?:jsx?|tsx?|mjs|cjs|mts|cts|vue|svelte)$/i.test(path);
  const isHashComment = isHeadersFile || /\.toml$/i.test(path);

  let out = "";
  let i = 0;
  const n = source.length;
  let quote: string | null = null; // the open quote char, or null when not inside a string

  while (i < n) {
    const ch = source[i];

    if (ch === "\n") {
      quote = null;
      out += ch;
      i++;
      continue;
    }

    if (isJsLike) {
      if (quote) {
        // Inside a string literal: nothing here can open a comment, and an
        // escaped quote does not close it.
        if (ch === "\\" && i + 1 < n) {
          out += ch + source[i + 1];
          i += 2;
          continue;
        }
        if (ch === quote) quote = null;
        out += ch;
        i++;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        out += ch;
        i++;
        continue;
      }
    }

    const two = source.slice(i, i + 2);
    if (isJsLike && two === "/*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      for (let j = i; j < stop; j++) out += source[j] === "\n" ? "\n" : " ";
      i = stop;
    } else if (isJsLike && two === "//") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? n : end;
      out += " ".repeat(stop - i);
      i = stop;
    } else if (isHashComment && ch === "#") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? n : end;
      out += " ".repeat(stop - i);
      i = stop;
    } else if (source.slice(i, i + 4) === "<!--") {
      const end = source.indexOf("-->", i + 4);
      const stop = end === -1 ? n : end + 3;
      for (let j = i; j < stop; j++) out += source[j] === "\n" ? "\n" : " ";
      i = stop;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

/** `[start, end)` of one element's content, `end` exclusive of its own closing tag. */
export function elementSpan(masked: string, tag: Tag): [number, number] | null {
  if (tag.selfClosing) return null;
  const name = tag.name.toLowerCase();
  const closeIdx = masked.toLowerCase().indexOf(`</${name}`, tag.end);
  return [tag.end, closeIdx === -1 ? masked.length : closeIdx];
}

/**
 * Blanks every tag's own markup to spaces, length-preserving, leaving only
 * visible text at its original offsets — an attribute like `data-cta="Get
 * Started"` or a class named `learn-more` never survives into this string,
 * so copy rules can only ever match what a reader would actually see.
 */
export function flattenTags(src: string): string {
  return src.replace(/<[^>]*>/g, (m) => m.replace(/[^\n]/g, " "));
}
