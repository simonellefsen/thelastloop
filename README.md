# The Last Loop

A tiny, original railway world built for iPhone landscape and the browser. Walk a hillside station town, recover its forgotten name, restore the first route, complete two local side stories, travel to Harbour Works for a dockside repair shift, and hear an adaptive original soundscape.

## Development

```bash
pnpm install
pnpm dev
pnpm check
pnpm test
pnpm build
```

## Deployment

The frontend is a static Vite application deployed to Vercel. The production project is named `thelastloop`.

```bash
vercel link --project thelastloop
vercel --prod
```

The required production domain is `https://thelastloop.vercel.app/`. Do not substitute a fallback hostname without an explicit product decision.

See [the design brief](docs/DESIGN.md) and [the roadmap](docs/ROADMAP.md) for the story, visual rules and future multiplayer boundary.
