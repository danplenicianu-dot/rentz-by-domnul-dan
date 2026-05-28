# Rentz by Domnul Dan

A fresh multiplayer implementation of **Rentz by Domnul Dan**, built as a strict TypeScript monorepo with a React client, authoritative WebSocket server, and shared rules engine.

The game is designed for exactly 4 real human players. There are no bots, no login, and no fake seats. The first player in a room is the host and is seated South / bottom.

## Stack

- Monorepo with npm workspaces
- Frontend: Vite, React, TypeScript
- Backend: Node.js, TypeScript, `ws`
- Shared package: serializable types and pure game engine functions
- Tests: Vitest

## Project Structure

```text
client/                  React card-table UI
server/                  Authoritative WebSocket room server
shared/src/types/        Shared TypeScript models and messages
shared/src/game-engine/  Deck, flow, validation, scoring, Rentz rules
shared/src/rulesets/     Reserved for expanded rule modules
shared/src/tests/        Deterministic rules-engine tests
README.md
```

## Run Locally

Install dependencies:

```bash
npm install
```

Start server and client together:

```bash
npm run dev
```

Or start them separately:

```bash
npm run dev:server
npm run dev:client
```

Open the client at:

```text
http://localhost:5173
```

The local WebSocket server runs at:

```text
ws://localhost:8787
```

## Test With 4 Tabs

1. Open `http://localhost:5173` in 4 browser tabs.
2. In tab 1, enter a name and create a room.
3. Copy the room code.
4. In tabs 2, 3, and 4, enter names, paste the room code, and join.
5. The host can start once all 4 players are connected.

Each tab receives a private view: its own hand is visible, while opponents show only card backs and card counts.

## Tests

Run the shared rules test suite:

```bash
npm test
```

Run TypeScript checks:

```bash
npm run typecheck
```

Build all packages:

```bash
npm run build
```

## Deployment

### Backend on Render

Create a new Render Web Service from this repository.

- Root directory: `server`
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Environment variables:
  - `PORT`: Render sets this automatically
  - `NODE_ENV=production`
  - `ALLOWED_ORIGINS=https://your-vercel-domain.vercel.app`

After deploy, note the public backend URL. The WebSocket URL is the same host with `wss://`, for example:

```text
wss://rentz-by-domnul-dan.onrender.com
```

### Frontend on Vercel

Create a new Vercel project from this repository.

- Root directory: `client`
- Build command: `npm install && npm run build`
- Output directory: `dist`
- Environment variables:
  - `VITE_WS_URL=wss://your-render-service.onrender.com`

Redeploy the frontend after changing `VITE_WS_URL`.

### CORS / Origins

The server checks WebSocket origins in production. Add every allowed frontend origin to `ALLOWED_ORIGINS` as a comma-separated list:

```text
ALLOWED_ORIGINS=https://rentz-by-domnul-dan.vercel.app,https://www.example.com
```

## Manual Test Checklist

1. Start server.
2. Start client.
3. Open 4 tabs.
4. Create room in tab 1.
5. Join same room in tabs 2, 3, and 4.
6. Verify host is South.
7. Verify game cannot start before 4 players.
8. Start game.
9. Verify each tab sees only its own hand.
10. Verify opponents show only card count.
11. Verify chooser selects subgame.
12. Verify illegal cards cannot be played.
13. Verify trick winner is same on all tabs.
14. Verify scoring after subgame.
15. Verify round summary overlay.
16. Verify Continue rotates chooser.
17. Verify chosen subgame becomes unavailable for that chooser.
18. Verify Rentz board placement.
19. Verify Rentz refusal redeals and keeps same chooser.
20. Verify final ranking after all subgames.

## Known Limitations

- Rooms are stored in memory. Use a durable store such as Redis if multiple backend instances are needed.
- Reconnection preserves seats for 10 minutes while the server process remains alive.
- There is no spectator mode because the product requirement is exactly 4 real players.
- The first release focuses on a complete playable flow and rules validation; richer table animations and sound can be added later.

## Next Improvements

- Add persisted room state for process restarts.
- Add optional host controls for abandoned rooms.
- Add end-to-end browser tests that drive all four tabs.
- Add localized Romanian labels throughout the UI.
