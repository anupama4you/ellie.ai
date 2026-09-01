# Lead Finder + SMS/Email Sender

Three manual GitHub Actions that find local businesses via Google Places,
keep any with a phone number (mobile or landline), scrape their website for
a contact email, draft a personalised SMS and a personalised email for
each, and log everything to one Google Sheet. Sending is a separate step
from finding, and SMS/email are approved independently — nothing goes out
until you mark the relevant `Approved` column `YES` in the sheet and run
the matching send workflow yourself.

```
Leads — Find (workflow_dispatch, you provide a search query)
   -> scripts/leads-find.js
   -> Google Places Text Search -> Place Details (phone, website, rating)
   -> keeps any business with a phone number, skips duplicates already in the sheet
   -> scrapes the business's website for a contact email
   -> drafts an SMS + an email per business, appends rows with both
      Approved/Status pairs blank

   [ you review the sheet, set SMS Approved / Email Approved = YES per row ]

SMS Leads — Send Approved (workflow_dispatch)
   -> scripts/sms-leads-send.js
   -> sends every SMS Approved=YES / SMS Status=blank row via Texto,
      but only if Phone Type = Mobile (landlines are marked SKIPPED)
   -> marks each row SENT / FAILED / SKIPPED with a timestamp

Email Leads — Send Approved (workflow_dispatch)
   -> scripts/email-leads-send.js
   -> sends every Email Approved=YES / Email Status=blank row (with an
      email address) via Gmail SMTP
   -> marks each row SENT or FAILED with a timestamp
```

## Setup

### 1. Google Sheet

Create a new Google Sheet, add a tab named `Leads` (or set
`GOOGLE_SHEETS_TAB_NAME` to whatever you call it), and copy the
spreadsheet ID out of its URL:
`https://docs.google.com/spreadsheets/d/<THIS PART>/edit`

The header row is created automatically on the first run if the tab is
empty. Columns: `Added, Place ID, Business Name, Phone, Phone Type,
Website, Email, Rating, Category, Address, SMS Draft, SMS Approved,
SMS Status, SMS Sent At, Email Subject, Email Body, Email Approved,
Email Status, Email Sent At`.

> If you already have a sheet from before this tool grew email support,
> its old 11/13-column layout won't line up with the new header. Rename
> the existing tab (e.g. `Leads (old)`) and let the next Find run create a
> fresh `Leads` tab, or manually re-insert the new columns yourself.

### 2. Google service account (for Sheets access)

1. Google Cloud Console -> IAM & Admin -> Service Accounts -> Create.
2. Create a JSON key for it, open the JSON, note the `client_email` and
   `private_key` fields.
3. Enable the **Google Sheets API** on that project.
4. Open your Sheet -> Share -> add the service account's email
   (`...@...iam.gserviceaccount.com`) as an Editor.

### 3. Google Places API

Enable the **Places API** (the original one, not "Places API (New)") on
the same or another Google Cloud project, and create an API key for it.

### 4. Texto (for SMS)

Sign up at texto.com.au and grab your API key (`txt_...`) from the
dashboard. Pay-as-you-go, no monthly fee — 3c AUD per SMS part, API
access included. Docs: https://texto.com.au/api

Optional: if you want messages to come from a registered Sender ID or
dedicated number instead of Texto's default shared number, set
`TEXTO_SENDER` as a repo secret too and add it to the workflow's `env:`.

### 5. Gmail App Password (for email)

Uses Gmail SMTP directly, sending as the mailbox in `GMAIL_USER` (e.g.
`hello@callellie.com`):

1. That Google account needs 2-Step Verification turned on.
2. Google Account -> Security -> 2-Step Verification -> App passwords ->
   create one (any name, e.g. "Ellie lead sender").
3. Use the generated 16-character password as `GMAIL_APP_PASSWORD` — not
   the account's normal login password.

Gmail enforces a daily sending cap (roughly 500/day on a personal
account, 2,000/day on Workspace) and can flag an account that sends a lot
of unsolicited mail in a burst, so keep `EMAIL_MAX_PER_RUN` conservative
for cold outreach.

### 6. Add GitHub repo secrets

Settings -> Secrets and variables -> Actions -> New repository secret:

| Secret | Value |
|---|---|
| `GOOGLE_PLACES_API_KEY` | Places API key from step 3 |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` from step 2 |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | `private_key` from step 2, pasted as-is (including `\n`s) |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | Spreadsheet ID from step 1 |
| `TEXTO_API_KEY` | Texto API key from step 4 |
| `GMAIL_USER` | Sending mailbox, e.g. `hello@callellie.com` |
| `GMAIL_APP_PASSWORD` | App password from step 5 |

## Running it

- **Actions tab -> "Leads — Find" -> Run workflow.** Enter a search query
  (`"plumber in Perth"`, `"day spa in Brisbane"`, etc.) and an optional
  max results (default 20, capped at 60 — Places text search only
  paginates 3 pages of 20). New rows land in the sheet with both
  `Approved`/`Status` pairs blank.
- **Review the sheet.** Tweak any draft SMS or email you're not happy
  with, set `SMS Approved` and/or `Email Approved` to `YES` on the rows
  you want to go out on that channel. Leave a column blank (or anything
  else) to skip that channel for a row — you can approve just SMS, just
  email, both, or neither, per row.
- **Actions tab -> "SMS Leads — Send Approved" -> Run workflow.** Sends
  every `SMS Approved = YES` row with an empty `SMS Status` and a mobile
  number, then fills in `SMS Status` (`SENT`/`FAILED`/`SKIPPED (not
  mobile)`) and `SMS Sent At`.
- **Actions tab -> "Email Leads — Send Approved" -> Run workflow.** Sends
  every `Email Approved = YES` row with an empty `Email Status` and an
  email address, then fills in `Email Status` (`SENT`/`FAILED`) and
  `Email Sent At`.
- Re-running either send workflow only ever touches rows that are still
  blank for that channel, so it's safe to run repeatedly as you approve
  more rows over time.

## Notes

- The finder never calls either sender — sending only happens when you
  trigger that workflow, and only for rows you've explicitly approved.
- `SMS_MAX_PER_RUN` / `EMAIL_MAX_PER_RUN` (set via each workflow's input)
  cap how many messages a single send run can fire off.
- The finder now keeps **any** business with a phone number, not just
  mobiles — landline-only businesses can still be reached by email, but
  the SMS sender skips them automatically (`Phone Type` column shows
  `Mobile`, `Landline`, or `Other`).
- The draft SMS is deliberately plain GSM text (no emoji, no smart
  quotes) and kept under 308 characters, so it sends as 2 credits.
  Adding an emoji or any non-GSM character flips the whole message to
  Unicode encoding — Texto then charges 2 credits per part instead of 1,
  *and* shrinks the per-part limit from 154 to 67 chars, so one emoji
  in this template jumps it from 2 credits to 8. Check message length
  and encoding before changing the template in scripts/leads-find.js.
- The draft email is HTML and modelled on an email already sent from
  hello@callellie.com — the opening line adapts per business category,
  the rest of the copy is fixed. Edit the `Email Subject`/`Email Body`
  cells per row before approving if a lead needs a different pitch.
- Australia's Spam Act 2003 requires commercial electronic messages to
  identify the sender and include a functional unsubscribe facility. The
  email template has a footer with the sender's identity and a
  `mailto:` link that replies "Unsubscribe" — but the Act also requires
  opt-out requests to be honoured within 5 business days, and there's no
  automated suppression list here. If someone unsubscribes, you need to
  manually make sure `leads-find.js` never re-adds that email (e.g. keep
  a block-list, or just don't re-run the same search query).
