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

## Stage two: Supabase sign-in, secrets and data security

The app also has `/sign-in` (emailed one-time code) and a guarded `/account` page with a
secret check and private notes. It needs two more public build-time variables,
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (see `.env.example`). Without
them the weather pages still work and sign-in shows a "not configured" message.

The backend lives in `supabase/`:

- `migrations/`: the `notes` table, its grants and row-level security policies.
- `functions/secret-check`: signed-in callers only; returns `{ found, length }` for the
  `TEST_SECRET` secret, never its value.
- `functions/send-email`: Supabase's Send Email hook. Verifies the hook signature, then
  sends the code through Votel. The provider sits behind `functions/_shared/emailSender.ts`.

Deploying it (each step changes the Supabase project, so run them deliberately):

```sh
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
npx supabase functions deploy secret-check --use-api
npx supabase functions deploy send-email --use-api
npx supabase secrets set TEST_SECRET=... VOTEL_API_HOST=... VOTEL_API_KEY=... \
  VOTEL_OTP_TEMPLATE_KEY=... SEND_EMAIL_HOOK_SECRET=...
```

Then enable the Send Email hook in the Supabase dashboard (Authentication, Hooks),
pointing at the `send-email` function URL. Secrets are set only in Supabase; none of
them belongs in this repository or in a `VITE_` variable.

## Where things are

- `src/services/backend.ts`: the only file that talks to Supabase.
- `src/stores/auth.ts`: the signed-in user, restored on load.

- `src/services/weather.ts`: the only file that calls the weather API. Swap the provider here.
- `src/composables/useWeather.ts`: fetches weather for a city and tracks loading, empty and error states.
- `src/stores/preferences.ts`: saved cities and the unit preference, persisted to `localStorage`.
- `src/views/`: one component per route.
