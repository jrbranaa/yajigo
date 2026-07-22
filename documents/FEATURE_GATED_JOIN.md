# Feature: Account-Gated Join Links

## Goal

Prevent anonymous access to session join links. Visitors must create an account to see or use a join link. The intent is not security theater — it's friction that filters for people who are genuinely interested, supporting deeper connections over high volume.

## User Flow

### New visitor
1. Visits the schedule page, sees a session is live
2. Join button is visible but clicking it prompts account creation
3. Creates an account (name + email, no password — magic link or similar)
4. Returns to the session, join link is now accessible

### Returning visitor
1. Visits the schedule page
2. Already authenticated — join link works immediately

### Host (admin)
- No change to admin flow
- Can view a list of registered accounts

## Design Considerations

- **Low friction signup:** magic link (email only, no password) is the right call here — a password adds friction without adding meaningful trust
- **What an "account" means:** name + email is enough; no profile, no social graph
- **Join link visibility:** options are (a) show the button but gate the click, or (b) hide the button entirely until authenticated. Option (a) is better — it makes the value visible and motivates signup
- **Widget:** the widget should not show a join link to unauthenticated visitors — it has no login context. Could show "Sign in to join →" linking to the schedule page

## Data

New file: `data/accounts.json`
```json
[
  { "id": "...", "name": "Jane", "email": "jane@example.com", "createdAt": "..." }
]
```

New file: `data/tokens.json` — magic link tokens with expiry

## API

- `POST /auth/request` — accepts email, sends magic link
- `GET /auth/verify?token=...` — validates token, sets session cookie
- `GET /auth/me` — returns current user or 401
- `POST /auth/logout`
- `GET /admin/accounts` — list of registered accounts (admin only)

## Open Questions

- Should accounts be per-tenant (yes, given container-per-tenant architecture)?
- Should the host be able to revoke an account's access?
- Is there a concept of "approved" accounts (host must approve before join link is accessible)?
- Email sender: needs SMTP config or a transactional email service (Resend, Postmark, etc.)
