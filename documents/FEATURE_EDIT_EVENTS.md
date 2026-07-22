# Feature: Edit Events

## Goal

Allow the host to edit existing scheduled sessions from the admin panel. Currently sessions can only be added or deleted.

## Editable Fields

- Label
- Date
- Time
- Duration
- Join link

## User Flow

1. Host views the upcoming sessions list in the admin panel
2. Clicks an edit icon on a session
3. Fields become editable inline (or a form appears below)
4. Host updates fields and saves
5. Changes are reflected immediately on the schedule page

## Admin Panel Changes

Two viable approaches:

### Option A: Inline editing
Clicking edit on a session transforms the row into editable inputs in place. Clean but more complex to implement.

### Option B: Pre-fill the Add Session form
Clicking edit on a session populates the existing Add Session form with its values and changes the submit button to "Save changes". Simpler to implement, reuses existing form logic.

Option B is recommended as a first pass — same result, less new code.

## API

New endpoint: `PUT /admin/schedule/:id`
```json
{
  "date": "2026-06-20",
  "time": "14:00",
  "label": "Office Hours",
  "duration": 60,
  "link": "https://meet.google.com/..."
}
```

Server finds the entry by ID, updates it in `schedule.json`, re-sorts by date/time, and returns the updated entry.

## Notes

- Date/time inputs should follow the same local→UTC conversion as the Add Session form (see timezone handling)
- Editing a currently active session should be allowed but flagged with a warning
