# SMS Lead Finder

Two manual GitHub Actions that find local businesses via Google Places,
keep only the ones with an Australian mobile number, draft a personalised
SMS for each, and log everything to a Google Sheet. Sending is a separate
step from finding — nothing goes out until you mark a row `Approved = YES`
in the sheet and run the send workflow yourself.

```
SMS Leads — Find (workflow_dispatch, you provide a search query)
   -> scripts/sms-leads-find.js
   -> Google Places Text Search -> Place Details (for phone + rating)
   -> keeps only AU mobiles, skips duplicates already in the sheet
   -> drafts the SMS per business, appends rows with Approved/Status blank

   [ you review the sheet, set Approved = YES on rows you want sent ]

SMS Leads — Send Approved (workflow_dispatch)
   -> scripts/sms-leads-send.js
   -> sends every Approved=YES / Status=blank row via Texto
   -> marks each row SENT or FAILED with a timestamp
```

## Setup

### 1. Google Sheet

Create a new Google Sheet, add a tab named `Leads` (or set
`GOOGLE_SHEETS_TAB_NAME` to whatever you call it), and copy the
spreadsheet ID out of its URL:
`https://docs.google.com/spreadsheets/d/<THIS PART>/edit`

The header row is created automatically on the first run if the tab is
empty. Columns: `Added, Place ID, Business Name, Phone, Rating, Category,
Address, Draft Message, Approved, Status, Sent At`.

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

### 4. Texto

Sign up at texto.com.au and grab your API key (`txt_...`) from the
dashboard. Pay-as-you-go, no monthly fee — 3c AUD per SMS part, API
access included. Docs: https://texto.com.au/api

Optional: if you want messages to come from a registered Sender ID or
dedicated number instead of Texto's default shared number, set
`TEXTO_SENDER` as a repo secret too and add it to the workflow's `env:`.

### 5. Add GitHub repo secrets

Settings -> Secrets and variables -> Actions -> New repository secret:

| Secret | Value |
|---|---|
| `GOOGLE_PLACES_API_KEY` | Places API key from step 3 |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` from step 2 |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | `private_key` from step 2, pasted as-is (including `\n`s) |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | Spreadsheet ID from step 1 |
| `TEXTO_API_KEY` | Texto API key from step 4 |

## Running it

- **Actions tab -> "SMS Leads — Find" -> Run workflow.** Enter a search
  query (`"plumber in Perth"`, `"day spa in Brisbane"`, etc.) and an
  optional max results (default 20, capped at 60 — Places text search
  only paginates 3 pages of 20). New rows land in the sheet with
  `Approved` and `Status` blank.
- **Review the sheet.** Tweak any draft message you're not happy with,
  set `Approved` to `YES` on the rows you want to go out. Leave it blank
  (or anything else) to skip a row.
- **Actions tab -> "SMS Leads — Send Approved" -> Run workflow.** Sends
  every `Approved = YES` row with an empty `Status`, then fills in
  `Status` (`SENT`/`FAILED`) and `Sent At`. Re-running only ever touches
  rows that are still blank, so it's safe to run repeatedly as you
  approve more rows over time.

## Notes

- The finder never calls the sender — sending only happens when you
  trigger that workflow, and only for rows you've explicitly approved.
- `SMS_MAX_PER_RUN` (default 50, set via the workflow's input) caps how
  many messages a single send run can fire off.
- The draft message is deliberately plain GSM text (no emoji) and kept
  under 306 characters, so it sends as 2 SMS parts. Adding an emoji or
  going over that length flips the whole message to Unicode encoding,
  which drops the per-part limit from 153 to 70 chars and multiplies
  cost — check message length before changing the template in
  scripts/sms-leads-find.js.
- AU mobile matching accepts `+614XXXXXXXX`, `0061 4XX XXX XXX`, and
  `04XX XXX XXX` in any spacing Places returns; anything else (landlines,
  no listed number) is skipped automatically.
