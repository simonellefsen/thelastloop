# The Last Loop

A tiny, original railway world built for iPhone landscape and the browser. Walk a hillside station town, recover its forgotten name, restore the first route, complete two local side stories, and travel to Harbour Works or Moonhill Observatory for compact repair journeys.

The station passenger pass is local-only and non-identifying. There are no live rooms or networked players in this release.

Quest progress, audio and motion preferences, the selected district, and the last safe local street position are stored only in versioned browser storage. Refresh resumes the journey; **Start fresh** clears story progress, routes and position while retaining sound, motion and player-style preferences.

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

See [the design brief](docs/DESIGN.md), [complete planet masterplan](docs/WORLD_MASTERPLAN.md), [roadmap](docs/ROADMAP.md), and [shared-loop protocol boundary](docs/SHARED_LOOP.md) for the story, world-continuity rules and future multiplayer boundary.

The [world detail plan](docs/WORLD_DETAIL_PLAN.md) describes the planned zoom from mini-globe to locally flat, street-scale terrain.
