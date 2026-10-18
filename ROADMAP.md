# Roadmap

## Recently done

- Side-projects page with live on-device demos (FSP Simulator, Resume AI, Spardose Analytics, PixelMorph).
- Fixed the `<meta charset>` typo, removed the `twitter:creator` placeholder, and kept canonical/`og:url` at `https://shawaiz.de/` instead of `/de/` and `/en/` paths that don't exist.
- Removed the dead "Slides" link (`url: "#"`) from the portfolio project dialog.

## Next

- **Quality**
  - Run a Lighthouse and accessibility pass on all pages: contrast, focus states, `alt` texts, and the avatar modal's `aria-labelledby` target, which is hidden with `display:none`.
  - Add CI (GitHub Actions) for HTML validation and an automated link checker.
  - Move `<meta charset>` above the gtag script so it is the first element in `<head>`.
  - Replace the Unsplash hotlinked images in the portfolio project cards with local, optimized images.
- **i18n**
  - Make the meta `description` and `og:*` tags on the projects page language-aware, the way they already are on the main page.
  - Consider real `/en/` URLs (or `?lang=en`) so search engines can index both languages. Right now both `hreflang` alternates point at the same URL.
- **Design**
  - Share the header, footer, theme and language toggle across `index.html` and `projects/index.html`, which currently duplicate styling and logic.
  - Give each project its own Open Graph image.
- **Projects**
  - Move the FSP simulator into its own repo (served at `/fsp-simulator/` or similar) and redirect `/fsp/`.
  - Use `static/js/ondevice-llm.js` in future demos, or drop it if nothing uses it.
  - Add more side projects.
- **Privacy**
  - Add a short privacy/imprint page covering Google Analytics, Google Fonts and the external avatar iframe. Consider cookieless analytics or a consent banner.
