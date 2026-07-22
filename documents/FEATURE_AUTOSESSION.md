# Feature: Auto-Create Session on Go Live

## Goal

When the host clicks Go Live and no session is currently scheduled, automatically create a session using the current time and a saved default join link. Reduces friction for unplanned drop-ins.

## User Flow

1. Host clicks Go Live
2. Server checks if a session is currently active (time window overlaps now)
3. **If yes:** proceeds as today — no change
4. **If no:** creates a new session with:
   - Date/time: now (UTC)
   - Label: default label (configurable)
   - Link: default link (configurable)
   - Duration: default duration (configurable)
   - Flagged as auto-created so it can be identified/cleaned up
5. Host can edit the auto-created session immediately if needed (see FEATURE_EDIT_EVENTS.md)

## Configuration

Add to `data/config.json`:
```json
{
  "siteName": "...",
  "defaultSessionLabel": "Drop-in",
  "defaultSessionLink": "https://meet.google.com/...",
  "defaultSessionDuration": 60
}
```

Editable in the admin panel under a "Defaults" section.

## Admin Panel Changes

- Add a "Defaults" card with fields for default label, link, and duration
- These values pre-populate the Add Session form as well (nice to have)

## Server Changes

- Modify `setPresence(true)` to check for an active session
- If none found, call the existing schedule creation logic with default values
- Mark the entry with `"autoCreated": true` in `schedule.json`

## Cleanup

Auto-created sessions that have passed should be cleaned up automatically or flagged in the admin panel so they don't clutter the schedule.

## Open Questions

- Should the host be notified/prompted when an auto-session is created, or should it be silent?
- Should auto-created sessions be hidden from the public schedule, or shown like any other session?
