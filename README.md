# hosting-test-weather

A throwaway weather lookup app for testing static hosting. Vue 3, Vite, Vue Router
(history mode), Pinia and Tailwind CSS. No backend, no accounts, no secrets.

Weather data comes from [Open-Meteo](https://open-meteo.com/), which needs no API key.
Its free tier is for non-commercial use, is rate limited (10,000 calls a day) and
requires the attribution shown in the footer.

## Commands

Requires Node.js `^22.18.0` or `>=24.12.0`.

| Task                     | Command              |
| ------------------------ | -------------------- |
| Install                  | `npm install`        |
| Dev server               | `npm run dev`        |
| Tests                    | `npm test`           |
| Lint                     | `npm run lint`       |
| Type check               | `npm run type-check` |
| Production build         | `npm run build`      |
| Serve the build locally  | `npm run preview`    |

## Build output

`npm run build` writes the static site to **`dist/`**. Point the host at that folder.

## Environment variable

`VITE_APP_LABEL` is shown in the footer. It is read at build time, so set it before
building (in the hosting dashboard, or locally by copying `.env.example` to `.env`)
and rebuild after changing it. When it is missing the footer shows `not set`.

## Hosting notes

The app uses history-mode routing, so the host must serve `index.html` for any path
that is not a real file (often called an SPA fallback or rewrite). Without it,
`/city/miami` works when reached by clicking but returns the host's 404 when opened
or refreshed directly.

## Hosting test checklist

- [ ] The home page loads on a phone
- [ ] Opening `/city/miami` directly works
- [ ] Refreshing `/city/miami` works
- [ ] `VITE_APP_LABEL` shows in the footer
- [ ] A custom subdomain works over HTTPS
- [ ] A second subdomain pointing at the same site works

Saved cities and the unit preference live in `localStorage`, which is per origin,
so each subdomain keeps its own list.

## Where things are

- `src/services/weather.ts`: the only file that calls the weather API. Swap the provider here.
- `src/composables/useWeather.ts`: fetches weather for a city and tracks loading, empty and error states.
- `src/stores/preferences.ts`: saved cities and the unit preference, persisted to `localStorage`.
- `src/views/`: one component per route.
