# LinguaCheck

Next.js 16 rebuild of the test-english.com content: 855 pages, 1,526 quizzes, 12,157 questions, statically generated.

## Run

```bash
npm install
npm run dev            # http://localhost:3000
npm run build && npm start
```

## Content pipeline

```
raw/test-english-export.json    browser export: REST API data + rendered #primary for every page
raw/test-english-subpages.json  exercise pages 2..N (/lesson/2/, /lesson/3/ …)
        │  node scripts/process.mjs
        ▼
content/index.json              page list (path, kind, section, level, title, image)
content/pages/*.json            one file per page: lesson | listing | page | home
content/media.json              [originalUrl, localPath] for every image
content/answers.json            answer key (empty, fill in — see below)
        │  node scripts/download-media.mjs
        ▼
public/media/…                  images
```

`raw/` and `public/media/` are git-ignored.

## Page kinds

- **lesson**: `parts` (Exercise 1, 2, 3 … as HTML), `explanation`, `quizzes`. Quizzes appear in the HTML as `<div data-quiz="ID">`; YouTube videos as `<div data-youtube="ID">`.
- **listing**: level/category pages with a card grid (`items`).
- **page** / **home**: plain HTML (about, level test, …).

## Answer key

`content/answers.json` is built only from the original site's result pages (the feedback it shows after "Check Answers"):

- **7,155** answers stated explicitly by the site ("‣ B is correct…", "Correct answer: …"), extracted by `scripts/extract-site-answers.mjs`;
- **4,242** answers read from the site's feedback where it explains rather than names the answer (rule + completed sentence, listening transcript excerpt);
- **760** questions have no key: the site returned no feedback (681) or its feedback does not decide the answer (79, see `content/solve/out/*-skipped.txt`).

Every keyed question shows the site's own feedback after checking. Answers inferred from feedback that are worth a manual check
(the site's text names a form that is not among the options, elimination, etc.) are listed in `content/solve/review-site.txt`.

Rebuild: `node scripts/extract-site-answers.mjs` (explicit answers + chunks in `content/solve/in/site-NN.txt`),
answers read from feedback go to `content/solve/out/site-NN-*.json` / `listen-*.json`,
`node scripts/solve-merge.mjs check site-NN` validates a chunk, `node scripts/solve-merge.mjs site` writes `answers.json`.

Format, keyed by question id:

```json
{
  "13842": { "choices": [27118] },
  "13843": { "gaps": [["guarantee"]] },
  "13632": { "gaps": [["Rarely do such minor errors lead"]], "feedback": "<p>Inversion after <b>rarely</b>.</p>" }
}
```

- `choices`: correct choice ids (radio, checkbox, dropdown questions).
- `gaps`: accepted answers for each gap, in order (case, spacing and curly quotes are ignored).
- `feedback`: optional HTML shown after checking.

Questions without a key show "No answer key for this question" after checking.

## Config

- Site name and menu: `src/lib/site.ts`
- Colors: CSS variables in `src/app/globals.css`
- Absolute URLs for Open Graph: `SITE_URL` env var
