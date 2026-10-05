// Converts the raw browser export (raw/*.json) into content/ files used by the Next.js app.
// Usage: node scripts/process.mjs
import * as cheerio from "cheerio";
import fs from "node:fs";
import path from "node:path";

const ORIGIN_HOSTS = new Set(["test-english.com", "www.test-english.com"]);
const OUT = "content";
const PAGES_OUT = path.join(OUT, "pages");

const exp = JSON.parse(fs.readFileSync("raw/test-english-export.json", "utf8"));
const subFile = "raw/test-english-subpages.json";
const sub = fs.existsSync(subFile) ? JSON.parse(fs.readFileSync(subFile, "utf8")) : {};

const media = new Set();
const LEVELS = ["a1", "a2", "b1", "b1-b2", "b2", "c1"];

// ---------- URL helpers ----------

function toPath(u) {
  return new URL(u, "https://test-english.com").pathname;
}

function localMedia(pathname) {
  const i = pathname.indexOf("/wp-content/uploads/");
  const local = i >= 0 ? "/media/uploads/" + pathname.slice(i + "/wp-content/uploads/".length) : "/media" + pathname.replace(/^\/staging\d+/, "");
  return local;
}

function rewriteUrl(raw, kind) {
  if (!raw) return raw;
  raw = raw.trim();
  if (raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("data:")) return raw;
  let u;
  try {
    u = new URL(raw, "https://test-english.com/");
  } catch {
    return raw;
  }
  if (!ORIGIN_HOSTS.has(u.hostname)) return raw;
  const isAsset = kind === "img" || /\.(png|jpe?g|gif|webp|svg|avif|mp3|pdf)$/i.test(u.pathname);
  if (isAsset) {
    const local = localMedia(u.pathname);
    media.add(JSON.stringify([u.origin + u.pathname, local]));
    return local;
  }
  // Internal page link: drop the /N/ pagination suffix handled by our own tabs.
  return u.pathname + u.hash;
}

// ---------- HTML cleaning ----------

const UPSELL_TEXT = /Register for more Content|Upgrade to PRO|View PRO plans|PRO overview|Download full-size image from Pinterest/i;

function cleanFragment($, root) {
  root.find("picture > source").remove();
  root.find("script,style,noscript,ins,link,#linkpagestop,#linkpagesbottom,#downloads-upgrade-banner,.page-links").remove();
  root.find('a[href*="test-english.pro"],a[href*="pinterest."]').each((_, a) => {
    const el = $(a);
    const block = el.closest("p,div,figure,li");
    (block.length && block.text().trim() === el.text().trim() ? block : el).remove();
  });
  root.find("p,div,h3,h4,h5,span").each((_, e) => {
    const el = $(e);
    if (el.children().length <= 2 && UPSELL_TEXT.test(el.text()) && el.text().length < 200) el.remove();
  });
  root.find("iframe").each((_, f) => {
    const el = $(f);
    const m = (el.attr("src") || el.attr("data-src") || "").match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]{6,})/);
    if (m) el.replaceWith(`<div data-youtube="${m[1]}"></div>`);
    else el.remove();
  });
  root.find("img").each((_, i) => {
    const el = $(i);
    const src = el.attr("data-lazy-src") || el.attr("data-src") || el.attr("src");
    if (!src || src.startsWith("data:")) return void el.remove();
    for (const a of ["srcset", "sizes", "data-src", "data-lazy-src", "data-srcset", "decoding", "fetchpriority"]) el.removeAttr(a);
    el.attr("src", rewriteUrl(src, "img"));
    el.attr("loading", "lazy");
  });
  // Cloudflare email obfuscation: hex string, first byte is the XOR key.
  const decodeCfEmail = (hex) => {
    const key = parseInt(hex.slice(0, 2), 16);
    let out = "";
    for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
    return out;
  };
  root.find("[data-cfemail]").each((_, e) => {
    $(e).replaceWith(decodeCfEmail($(e).attr("data-cfemail")));
  });
  root.find('a[href*="/cdn-cgi/l/email-protection"]').each((_, a) => {
    const el = $(a);
    const hex = (el.attr("href").split("#")[1] || "").trim();
    if (hex) el.attr("href", "mailto:" + decodeCfEmail(hex));
    else el.replaceWith(el.text());
  });
  root.find("a[href]").each((_, a) => {
    const el = $(a);
    el.attr("href", rewriteUrl(el.attr("href")));
    el.removeAttr("target").removeAttr("rel");
  });
  root.find("[style]").removeAttr("style");
  root.find("[onclick]").removeAttr("onclick");
  root.find("*").each((_, e) => {
    for (const name of Object.keys(e.attribs || {})) if (name.startsWith("data-cf-")) $(e).removeAttr(name);
  });
  root.contents().filter((_, n) => n.type === "comment").remove();
  root.find("*").contents().filter((_, n) => n.type === "comment").remove();
}

function inner($, el) {
  return ($(el).html() || "").replace(/\s+/g, " ").trim();
}

// ---------- Quiz parsing ----------

function parseQuiz($, area) {
  const form = $(area).find("form.quiz-form").first();
  const quizId = Number((form.attr("id") || "").replace("quiz-", "")) || null;
  const questions = [];
  form.find(".watu-question").each((_, qEl) => {
    const q = $(qEl);
    const id = Number(q.find("input.watupro-question-id").val());
    const type = q.find("input[class^=answerTypeCnt]").val() || "radio";
    const content = q.find(".question-content").first().clone();
    const num = content.find(".watupro_num").first().text().trim();
    content.find(".watupro_num, input[type=hidden]").remove();

    const gaps = [];
    content.find("select, input.watupro-gap, input[type=text], textarea").each((_, g) => {
      const el = $(g);
      if (g.tagName === "select") {
        const options = el.find("option").map((_, o) => $(o).text().trim()).get().filter(Boolean);
        gaps.push({ kind: "select", options });
      } else {
        gaps.push({ kind: "text" });
      }
      el.replaceWith(`<span data-gap="${gaps.length - 1}"></span>`);
    });
    cleanFragment($, content);

    const question = { id, num, type, prompt: inner($, content) };
    if (gaps.length) question.gaps = gaps;

    // Reading passages / task intros that WatuPRO shows above a question.
    const intro = q.find(".watupro-question-intro").first().clone();
    if (intro.length && intro.text().trim()) {
      cleanFragment($, intro);
      question.intro = inner($, intro);
    }

    const choicesEl = q.find(".question-choices").first();
    if (choicesEl.length) {
      const dropdown = choicesEl.find("select").first();
      if (dropdown.length) {
        question.display = "dropdown";
        question.choices = dropdown
          .find("option")
          .filter((_, o) => $(o).attr("value"))
          .map((_, o) => ({ id: Number($(o).attr("value")), html: $(o).text().trim() }))
          .get();
      } else {
        question.choices = choicesEl
          .find(".watupro-question-choice")
          .map((_, c) => {
            const input = $(c).find("input").first();
            const label = $(c).find("label").first().clone();
            cleanFragment($, label);
            const maxSel = (input.attr("class") || "").match(/watupro_max_selections-(\d+)/);
            if (maxSel) question.maxSelections = Number(maxSel[1]);
            return { id: Number(input.val()), letter: $(c).find("i").first().text().trim() || undefined, html: inner($, label) };
          })
          .get();
      }
    }
    questions.push(question);
  });
  return { id: quizId, questions };
}

// Replace quiz areas with placeholders, then clean; returns { html, quizzes }
function processTab($, el, quizzes) {
  const root = $(el).clone();
  root.find(".quiz-area, #watupro_quiz").each((_, area) => {
    const quiz = parseQuiz($, area);
    if (!quiz.questions.length) return void $(area).remove();
    quizzes.push(quiz);
    $(area).replaceWith(`<div data-quiz="${quiz.id}"></div>`);
  });
  cleanFragment($, root);
  return inner($, root);
}

// ---------- Page classification ----------

function sectionOf(p) {
  const segs = p.split("/").filter(Boolean);
  const level = LEVELS.includes(segs[1]) ? segs[1] : null;
  return { section: segs[0] || null, level, depth: segs.length };
}

const pages = [];
for (const raw of exp.pages) {
  const pagePath = toPath(raw.link);
  const { section, level, depth } = sectionOf(pagePath);
  const $ = cheerio.load(raw.live_primary || "", null, false);
  const base = {
    id: raw.id,
    path: pagePath,
    parentId: raw.parent || null,
    order: raw.menu_order || 0,
    section,
    level,
    depth,
    title: cheerio.load(raw.title || "", null, false).text().trim(),
    seo: {
      title: raw.seo?.title || null,
      description: raw.seo?.description || null,
      image: raw.seo?.og_image?.[0] ? rewriteUrl(raw.seo.og_image[0], "img") : null,
    },
    modified: raw.modified,
  };

  let page;
  if ($("#page-tabs").length) {
    const quizzes = [];
    const parts = [];
    const first = $("#tabli1-cont");
    parts.push(processTab($, first, quizzes));
    const pageCount = $("#linkpagestop .page-links a").length + 1;
    for (let n = 2; n <= pageCount; n++) {
      const html = sub[`${pagePath}${n}/`];
      if (!html) {
        console.warn("missing subpage", pagePath, n);
        continue;
      }
      const $s = cheerio.load(html, null, false);
      parts.push(processTab($s, $s.root(), quizzes));
    }
    const explanation = processTab($, $("#tabli2-cont"), quizzes);
    const hasExplanation = cheerio.load(explanation, null, false).text().replace(/\s+/g, "").length > 60;
    // The page <h1> already shows the title; drop the repeated leading <h2>.
    const dropTitle = (html) => {
      const $h = cheerio.load(html, null, false);
      const h2 = $h.root().children().first();
      if (h2.is("h2") && h2.text().trim().toLowerCase() === base.title.toLowerCase()) h2.remove();
      return $h.html().trim();
    };
    page = {
      ...base,
      kind: "lesson",
      parts: parts.map(dropTitle),
      explanation: hasExplanation ? dropTitle(explanation) : null,
      quizzes,
    };
  } else if ($("#child-pages").length) {
    const items = $("#child-pages .test-item")
      .map((_, it) => {
        const a = $(it).find("a").first();
        const img = $(it).find("img").first();
        return {
          path: rewriteUrl(a.attr("href")),
          title: $(it).find("h4").first().text().trim(),
          image: img.length ? rewriteUrl(img.attr("data-src") || img.attr("src"), "img") : null,
        };
      })
      .get();
    const intro = $.root().clone();
    intro.find("#child-pages").remove();
    cleanFragment($, intro);
    page = { ...base, kind: "listing", intro: inner($, intro), items };
  } else {
    const quizzes = [];
    const html = processTab($, $.root(), quizzes);
    page = { ...base, kind: pagePath === "/" ? "home" : "page", html, quizzes };
  }
  pages.push(page);
}

// ---------- Write output ----------

fs.rmSync(PAGES_OUT, { recursive: true, force: true });
fs.mkdirSync(PAGES_OUT, { recursive: true });
const fileFor = (p) => (p === "/" ? "_home" : p.replace(/^\/|\/$/g, "").replace(/\//g, "__")) + ".json";
for (const p of pages) fs.writeFileSync(path.join(PAGES_OUT, fileFor(p.path)), JSON.stringify(p));

const index = pages.map(({ id, path: p, parentId, order, section, level, kind, title, seo, modified }) => ({
  id, path: p, parentId, order, section, level, kind, title, image: seo.image, modified, file: fileFor(p),
}));
fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index, null, 1));
fs.writeFileSync(path.join(OUT, "media.json"), JSON.stringify([...media].map((m) => JSON.parse(m)), null, 1));
if (!fs.existsSync(path.join(OUT, "answers.json"))) fs.writeFileSync(path.join(OUT, "answers.json"), "{}\n");

const quizCount = pages.reduce((a, p) => a + (p.quizzes?.length || 0), 0);
const qCount = pages.reduce((a, p) => a + (p.quizzes || []).reduce((b, q) => b + q.questions.length, 0), 0);
const kinds = pages.reduce((a, p) => ((a[p.kind] = (a[p.kind] || 0) + 1), a), {});
console.log({ pages: pages.length, kinds, quizzes: quizCount, questions: qCount, media: media.size, subpages: Object.keys(sub).length });
