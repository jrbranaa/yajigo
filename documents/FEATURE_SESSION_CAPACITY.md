# Feature: Session Capacity Control

## Goal

Allow the host to disable the join link mid-session and replace it with a "Session full" message. Supports intentional, intimate gatherings over open-ended drop-in.

## User Flow

### Host
1. Goes live — join link is active as normal
2. Decides the session is full
3. Toggles "Session full" in the admin panel
4. Join link is immediately replaced with "Session full" for all visitors
5. Can re-enable the link at any time (e.g. someone drops off)

### Visitor
- Sees join link while capacity is open
- Sees "Session full" when host has disabled it — no join button, no link
- Widget and schedule page both reflect the state in real time via SSE

## Admin Panel Changes

When live, show a secondary toggle below the Go Live button:
```
[ Go Offline ]
[ Session full  ○——● ]   ← toggle, only visible when live
```

## State

Add `sessionFull` boolean to `data/state.json`:
```json
{ "present": true, "sessionFull": false, "updatedAt": "..." }
```

## API

- `POST /admin/presence` already broadcasts state via SSE — extend it to carry `sessionFull`
- New endpoint: `POST /admin/session-full` — toggles `sessionFull` in state, broadcasts via SSE

## Widget / Schedule Page Changes

- When `state.present && state.sessionFull`: hide join button, show "Session full" label
- When `state.present && !state.sessionFull`: show join button as normal
- SSE already pushes state updates — no polling needed

## Open Questions

- Should "Session full" be automatic based on a participant count, or always manual? Manual is simpler and gives the host more control.
- Should there be a visible participant count anywhere?
