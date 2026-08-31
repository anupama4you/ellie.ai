# ELLIE SEO Engine

Automated SEO article publishing for callellie.com, one post every 2 days. A GitHub Action runs on that schedule, asks Claude to write one genuinely useful article from the keyword queue, saves it as a static HTML page with full schema markup, updates the blog index and sitemap, and commits it. Netlify picks up the commit and deploys automatically.

Cost: roughly $0.05 to $0.15 per article in API usage. No other fees.

## How it works

```
GitHub Action (every 2 days, ~7am Adelaide)
   -> scripts/generate-article.js
   -> picks next unpublished keyword from content-queue/keywords.json
   -> calls Claude API with ELLIE facts + past article list (for internal links)
   -> renders blog/<slug>.html from blog-template/article-template.html
   -> updates blog/index.json + sitemap-blog.xml
   -> marks keyword published, commits, pushes
   -> Netlify deploys
```

## Setup (10 minutes)

1. Copy this whole folder structure into the root of your callellie.com repo
   (or keep it as its own repo if the site pulls content at build time).

2. Copy `blog-template/blog-index.html` to `blog/index.html` once manually.

3. Add your API key as a repo secret:
   GitHub repo -> Settings -> Secrets and variables -> Actions
   -> New repository secret
   Name: ANTHROPIC_API_KEY
   Value: your key from console.anthropic.com

3b. (Optional, for hero images) Add a free Pexels API key the same way:
   Name: PEXELS_API_KEY
   Value: your key from pexels.com/api (free, no card required)
   Without this, articles publish fine, just without a header photo.

4. Test it manually first:
   GitHub repo -> Actions tab -> "Weekly SEO Article" -> Run workflow

5. Check the generated article in /blog, tweak the template styling if
   needed, then let the schedule take over.

6. Submit the sitemap once in Google Search Console:
   https://callellie.com/sitemap-blog.xml

## Managing the queue

- 40 keywords are pre-loaded, but at one post every 2 days that's only
  ~2.5 months of runway per full queue — much shorter than the old
  once-a-week pace. As of this schedule change only 10 are unpublished
  (~3 weeks left), so top up content-queue/keywords.json soon.
- Add more anytime by appending to content-queue/keywords.json:
  { "keyword": "...", "intent": "...", "audience": "...", "published": false }
- Reorder freely. The script always takes the first unpublished entry.

## Quality control options

By default articles publish fully automatically. If you want review first,
change the workflow to open a pull request instead of pushing to main:
replace the push step with peter-evans/create-pull-request action. You then
merge each week's article with one click from your phone.

## Changing the schedule

Edit the cron in .github/workflows/daily-article.yml (the file kept its
original name, but the schedule now controls the actual cadence):
  every 2 days (current): "30 21 */2 * *"
  weekly:                  "30 21 * * 0"
  daily:                   "30 21 * * *"
  Mon/Wed/Fri:             "30 21 * * 1,3,5"

Cron has no native "every 2 weeks" — for a slower-than-weekly cadence,
leave the schedule off and trigger each run manually from the Actions tab
(workflow_dispatch) whenever you want the next article out.

## Important notes

- The generator hard-strips em dashes as a safety net.
- FAQ JSON-LD is included on every article. This is what gets content
  quoted in Google rich results and by AI search engines.
- Internal links: each article receives the 10 most recent article titles
  and URLs and links to them where relevant, building site structure
  automatically over time.
- If your site is a React SPA, make sure /blog/*.html is served as static
  files (Netlify does this automatically for files in the publish folder).
