# Shared Loop Protocol Boundary

The Last Loop is still a solo, local-first game. This document describes the boundary for a later live-presence release; it does not enable networking in the current Vercel app.

## What stays local

- Quest state, world interactions, environmental animation and audio.
- Passenger callsign preference and save data until the player opts into a room.
- All current room-board UI: it accurately reports a solo carriage.

## Future service contract

`src/lib/game/shared-loop.ts` defines protocol version 1. A client may send:

- `hello`: protocol version, anonymous callsign and requested room ID.
- `move`: a finite three-number position and monotonically increasing sequence.
- `leave`: explicit departure.

The future service may send a welcome snapshot and room directory. Clients interpolate received positions; they never receive or submit quest progress as presence data.

## Hosting boundary

Vercel continues to host the static frontend. Live presence requires a separately deployed persistent WebSocket service with rate limits, room capacity enforcement, ephemeral connection IDs and observability. Choosing that host, authentication approach and data-retention policy is a product and infrastructure decision to make before enabling the connection.
