# ThiraiHub

Book Tamil movie tickets in Chennai, and resell the ones you cannot use.

This is a prototype: the Angular client runs against an in-memory mock API, so there is no
backend to set up. Data resets when the page reloads.

## What it does

- **Home:** a swipeable featured film (the newest release), more films below, and a
  "Your next show" pill for signed-in users that opens into ticket cards.
- **Booking:** pick a film and language, choose a day (only days with shows), choose seats,
  pay from the wallet or a card, and get a ticket with a QR code. Each ticket carries a
  fixed service fee.
- **My bookings:** active, completed and resale-listed tickets in one place, plus a Theatres tab with the
  theatres you have been to, a seat map of the seats you used and the films you watched from each.
- **Resale:** list some or all of a booking, browse spare tickets by day, and buy them.
- **Sharing:** give some seats of a booking to someone else by their mobile number; the seats
  move to their account at once as a ticket of their own.
- **Profile and settings:** name, birthday and photo; phone and email changes are verified
  with an OTP; themes (Ice Grey, Plain Grey, Plain Burgundy) live in Settings.
- **Wallet:** balance, history, earnings from resale.

## Try it

Sign in with the demo user **Mad Monkey**, phone `+919876543210`. Any OTP flow accepts
`123456`.

To try buying, selling or sharing between people, sign out (account menu) and sign in as
someone else. Stay inside the app, because a full page reload resets the demo data.

| Name | Phone | Notes |
| --- | --- | --- |
| Mad Monkey | `9876543210` | the demo user, with wallet money and many tickets |
| Priya Nair | `9810001111` | a 4-seat ticket for Karuppu to share, plenty of wallet money |
| Karthik Subramanian | `9810006666` | a 3-seat ticket for Scene to share |
| Rahul Verma, Sneha Iyer, Imran Khan, Divya Menon | `9810002222`, `9810003333`, `9810004444`, `9810005555` | sellers with tickets on the marketplace |
| Ananya Rao | `9810007777` | an account with no tickets, handy as a receiver |

## Run locally

Needs Node 20.19+ (or 22).

```bash
cd client
npm install
npm start        # http://localhost:4200
npm run build    # output in client/dist/task-manager/browser
npm test         # unit tests (Vitest)
```

The theatre admin app runs the same way from `admin/`:

```bash
cd admin
npm install
npm start        # http://localhost:4201
npm run build    # output in admin/dist/admin/browser
```

## Project layout

```
.
├── client/                 Angular 20 app (standalone components, signals, OnPush)
│   ├── src/app/core/       models, services, guards, interceptors, mock API and seed data
│   ├── src/app/pages/      landing, movies, booking, resale, profile, wallet, search
│   ├── src/app/shared/     navbar, footer, day strip, cards and other shared components
│   ├── public/             film posters
│   └── vercel.json         Vercel build settings
├── admin/                  Theatre admin app: shows, screens and seat layouts (mock API)
│   ├── public/             film posters and theatre logos
│   └── vercel.json         Vercel build settings
└── .claude/skills/verify/  how to build and drive the app in a browser to check a change
```

The mock API lives in `client/src/app/core/data/` (`mock-store.ts`, `mock-seed.ts`, and an
HTTP interceptor that serves it), so pages call it like a real REST backend. Replacing it
with a real backend means removing the interceptor and pointing the services at the API.

## Deploy (Vercel)

Set the project's **Root Directory** to `client`. Build settings come from
`client/vercel.json`: `npm ci`, `npm run build`, output `dist/task-manager/browser`, and a
rewrite of every route to `index.html` so deep links work. Leave the dashboard's build
overrides off.

The admin app is a second Vercel project from the same repository, with **Root Directory**
set to `admin`. `admin/vercel.json` holds the same settings with output
`dist/admin/browser`.

## Notes

- Film posters are copyrighted and are here for local prototyping only. Replace them with
  licensed artwork before any public launch.
- Film ratings and descriptions are placeholder data.
- See [client/README.md](client/README.md) for the Angular CLI reference.
