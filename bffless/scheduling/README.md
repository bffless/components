# `@bffless/components` — Scheduling install pack

Source-of-truth schemas + pipelines for the scheduling primitive (`BookingFlow`, `useScheduling`, `useSchedulingAdmin`, `useGoogleCalendarConnect`, and the `Scheduling/Admin/*` primitives).

A template that wants bookings should provision **everything in this folder** to its BFFless project, then mount the React primitives. **Do not redefine schemas or pipelines in the template's own `.bffless/` directory** — the canonical shape lives here so we can fix bugs and ship enhancements without touching every consumer.

---

## What's in here

```
bffless/scheduling/
├── README.md         ← you are here
├── schemas.json      ← 8 schema definitions
└── pipelines.json    ← 1 proxy rule set (29 rules)
```

---

## Schemas (8)

| Name | Purpose | Notes |
|---|---|---|
| `scheduling_service` | What customers can book | Generic store fields; `vertical_preset` in settings drives display labels |
| `scheduling_resource` | Who/what provides the service (staff, room, equipment) | `google_calendar_id` null → no Calendar mirror for this resource |
| `scheduling_resource_service` | M:N — which resources can perform which services | Both fields together are the natural key |
| `scheduling_working_hours` | Day-of-week schedule | Multiple rows per `(resource_id, day_of_week)` = split shifts (lunch breaks) |
| `scheduling_time_off` | Blocked windows (vacations, holidays) | `resource_id` null = site-wide |
| `scheduling_booking` | The actual appointment row | DB-canonical; Google Calendar is a mirror. `user_id` stores the SuperTokens user.id when the booking was made by a signed-in customer (null for anonymous) |
| `scheduling_settings` | Singleton site-wide config | Provision a single row at first run; pipelines fetch via `pageSize: 1` |
| `scheduling_admin_user` | Per-site admin allowlist | Bootstrap via `POST /api/scheduling/admin/claim` while empty |

Field definitions live in [`schemas.json`](./schemas.json).

---

## Pipelines (30 rules in one rule set named `scheduling`)

### Public (anonymous OK)

| Method | Path | Pipeline |
|---|---|---|
| GET | `/api/scheduling/services` | `scheduling_services` |
| GET | `/api/scheduling/resources?service_id=…` | `scheduling_resources` |
| GET | `/api/scheduling/availability?service_id=…[&resource_id=…]&from=…&to=…` | `scheduling_availability` |
| POST | `/api/scheduling/bookings` | `scheduling_booking_create` — captures `user.id` when authenticated; anonymous bookings store `user_id = null` |
| POST | `/api/scheduling/bookings/manage` | `scheduling_booking_manage` |

### Member (auth-required)

| Method | Path | Pipeline | Frontend hook + primitive |
|---|---|---|---|
| GET | `/api/scheduling/my-bookings` | `scheduling_my_bookings` — returns the signed-in user's bookings (filtered by `user_id`), denormalized with service + resource names + manage URL | `useMyBookings()` + `<MyBookingsList>` (compound primitive with `.Loading` / `.Error` / `.Empty` / `.Upcoming` / `.Past`, render-prop on `Upcoming`/`Past` `renderItem`) |

### Admin gate (per-site, not platform)

| Method | Path | Pipeline | Auth |
|---|---|---|---|
| GET | `/api/scheduling/admin/me` | `scheduling_admin_me` | session |
| POST | `/api/scheduling/admin/claim` | `scheduling_admin_claim` | session — open while `scheduling_admin_user` is empty, 403 after |

Frontend: `useSchedulingAdminGate({ auth })` exposes the discriminated `status: 'loading' | 'signed_out' | 'not_admin_no_one_claimed' | 'not_admin' | 'admin'` plus `claim()`. Consumers render one branch per status; the hook handles the GET /admin/me probe + POST /admin/claim dance.

### Admin Google integration

| Method | Path | Pipeline |
|---|---|---|
| GET | `/api/scheduling/admin/google/calendars` | `scheduling_admin_google_calendars` |

### Admin CRUD (services / resources / resource_services / working_hours / time_off)

For each of the five collections, you get the standard four:

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/scheduling/admin/<collection>` | List all |
| POST | `/api/scheduling/admin/<collection>` | Create — body = full row |
| PATCH | `/api/scheduling/admin/<collection>` | Partial update — body = `{ id, …fieldsToChange }` |
| DELETE | `/api/scheduling/admin/<collection>` | Body = `{ id }` |

`resource_services` is create + delete only (no PATCH — it's an M:N link, you delete + recreate).

### Admin settings (singleton)

| Method | Path | Pipeline |
|---|---|---|
| GET | `/api/scheduling/admin/settings` | `scheduling_admin_get_settings` |
| PATCH | `/api/scheduling/admin/settings` | `scheduling_admin_update_settings` |

Pipeline JSON lives in [`pipelines.json`](./pipelines.json).

---

## Install steps for a template

The pack ships with a `bffless-install` CLI binary (also part of `@bffless/components`). The CLI merges this pack's schemas + rule set into the consumer's `.bffless/schemas/schemas.json` and `.bffless/proxy-rules/proxy-rules.json`. The existing `bffless/actions/provision-site` GitHub Action then picks them up like any other template-authored config — same `{{schema_name}}` placeholder substitution, same alias attachment.

1. **Add the install step to the template's `provision.yml`** (the workflow that runs on first deploy). Place it after the checkout and before the `provision-site` action:

   ```yaml
   - uses: actions/setup-node@v4
     with:
       node-version: '22'

   - name: Install scheduling pack into .bffless/
     run: |
       npm install --no-save --prefix . @bffless/components@latest
       npx bffless-install scheduling
   ```

   The CLI is idempotent — re-running on a project that already has the pack is a no-op (entries deduped by name). Pass `--force` to overwrite existing entries with the pack's current shape after a pack upgrade.

   Local dev never runs the CLI; the working tree is throwaway in CI. If you do run it locally for testing, `git diff` will flag the merged content and you can revert before committing.

2. **`scheduling_settings` seeds itself on first save.** The PATCH `/api/scheduling/admin/settings` pipeline is an upsert — when no row exists yet, the pipeline CREATES one seeded with sane defaults overlaid by the request body. The first admin's `<SchedulingSettingsPanel>` submission is enough to bring the singleton into existence; subsequent saves UPDATE it. No manual MCP / curl seeding needed.

   The pipeline's defaults if the body omits a field and no row exists: `America/New_York` timezone, 30-min granularity, 60-min lead time, 60-day max advance, 24-hr cancellation window, `salon` preset, `{}` labels.

5. **Mount the React primitives.** From the template's React island:

   ```tsx
   import {
     // Public booking flow
     useScheduling,
     BookingFlow,
     // Member account page (signed-in customer's own bookings)
     useMyBookings,
     MyBookingsList,
     // Admin gate (signed-in / claim / admin status machine)
     useSchedulingAdminGate,
     // Admin data + integrations
     useSchedulingAdmin,
     useGoogleCalendarConnect,
     SchedulingCalendarConnect,
     SchedulingServicesTable,
     SchedulingResourcesTable,
     // Settings panel — compound primitive with sub-primitives per field
     SchedulingSettingsPanel,
     DEFAULT_TIMEZONE_GROUPS,
   } from '@bffless/components';
   ```

   Admin gate quick shape:

   ```tsx
   const auth = useAuth();
   const gate = useSchedulingAdminGate({ auth });
   const admin = useSchedulingAdmin({ skipInitialLoad: !gate.isAdmin });
   const connect = useGoogleCalendarConnect({ skipInitialLoad: !gate.isAdmin });

   switch (gate.status) {
     case 'loading': return <Pending />;
     case 'signed_out': return <SignInPrompt />;
     case 'not_admin_no_one_claimed':
       return <ClaimPrompt onClaim={gate.claim} claiming={gate.claiming} error={gate.error} />;
     case 'not_admin': return <AskOwnerCopy />;
     case 'admin': return <AdminUI admin={admin} connect={connect} />;
   }
   ```

   Settings panel compound shape:

   ```tsx
   <SchedulingSettingsPanel admin={admin} className="grid sm:grid-cols-2 gap-x-5 gap-y-5">
     <SchedulingSettingsPanel.Timezone className="sm:col-span-2" help="..." />
     <SchedulingSettingsPanel.Granularity help="..." />
     <SchedulingSettingsPanel.VerticalPreset help="..." />
     <SchedulingSettingsPanel.MinLeadTime help="..." />
     <SchedulingSettingsPanel.MaxAdvance help="..." />
     <SchedulingSettingsPanel.CancellationWindow className="sm:col-span-2" help="..." />
     <SchedulingSettingsPanel.Labels className="sm:col-span-2" help="..." />
     <SchedulingSettingsPanel.Error className="sm:col-span-2 ..." />
     <div className="sm:col-span-2 flex items-center gap-4">
       <SchedulingSettingsPanel.Submit className="...">Save settings</SchedulingSettingsPanel.Submit>
       <SchedulingSettingsPanel.Saved className="text-xs text-accent" />
     </div>
   </SchedulingSettingsPanel>
   ```

   `Timezone` defaults to `groups={DEFAULT_TIMEZONE_GROUPS}` (curated regional dropdown + Custom… fallback + browser-tz shortcut). Pass `groups={null}` for a free-text input. Pass `presets`/`options` to the preset/granularity sub-primitives as either `string[]` / `number[]` or `Array<{ value, label }>` for descriptive labels.

   Quick `<MyBookingsList>` shape (style with className strings to match the template's palette):

   ```tsx
   const bookings = useMyBookings();
   <MyBookingsList bookings={bookings} className="space-y-8">
     <MyBookingsList.Loading />
     <MyBookingsList.Error className="…" />
     <MyBookingsList.Empty>No bookings yet — <a href="/book">book one</a>.</MyBookingsList.Empty>
     <MyBookingsList.Upcoming
       renderItem={(b, { cancel, cancelling }) => (
         <BookingCard key={b.id} b={b} cancelling={cancelling} onCancel={cancel} />
       )}
     >
       <h3>Upcoming</h3>
     </MyBookingsList.Upcoming>
     <MyBookingsList.Past renderItem={(b) => <BookingCard key={b.id} b={b} muted />} >
       <h3>Past</h3>
     </MyBookingsList.Past>
   </MyBookingsList>
   ```

   See `salon-luxe-salon-luxe` demo (`src/components/BookingIsland.tsx`, `src/components/AdminSchedulingIsland.tsx`) for a full end-to-end wiring with style overrides.

6. **Wire the `auth.json` proxy** — already standard in every template, but worth checking. The scheduling admin endpoints are gated by `auth_required`, which needs `/api/auth/*` proxied to the BFFless auth handler.

---

## Required Google Calendar Integration setup

Most templates will want the Google Calendar mirror enabled. This is a project-level configuration in CE Project Settings → Integrations, **not** a per-template provision. The `scheduling_resource.google_calendar_id` field is what wires a stylist/provider to a sub-calendar of the connected Google account.

Pipelines that touch Google are all marked `optional: true` on the `google_calendar` step, so a project without the integration still works — bookings just don't mirror.

---

## Architectural decisions worth knowing

These are settled — don't relitigate without surfacing the trade-off first.

- **DB-canonical**, not Calendar-canonical. Bookings live in `scheduling_booking`. Google is a mirror that may be skipped. See `reference/design-decisions.md` in the original story.
- **`slot_granularity_minutes` = the grid** (which start times exist). **`service.duration_minutes` = the appointment length.** A 30-min granularity with a 90-min service offers starts at `9:00`, `9:30`, `10:00`… each producing a 90-min appointment. The slot's `end` is `start + duration`.
- **Buffers were removed.** `scheduling_service.buffer_before_minutes` / `buffer_after_minutes` exist on the schema for forward-compat but no pipeline reads them. Add buffer logic back if a template genuinely needs cleanup time between appointments.
- **"Any stylist" mode.** When `resource_id` is null on `/availability`, the pipeline fans out across all eligible resources for the chosen service and dedupes slots by start time (lowest `sort_order` wins). When `resource_id` is null on `POST /bookings`, the `assign` step picks the first eligible resource that's still free at the requested slot and writes the real id to the row.
- **Per-site admin gate ≠ platform admin.** `/api/scheduling/admin/me` returns whether the signed-in user is in `scheduling_admin_user`. Different from `/api/admin/toolbar`, which is the centralized BFFless platform admin (gates content edits + build pipelines, not business rules).

---

## Bug-fix history (don't reintroduce)

Some non-obvious gotchas baked into the canonical pipelines and hooks. If you re-author any of this from scratch, keep these in mind:

1. **Pipeline `condition` fields don't evaluate `===` / `>` / `&&`.** Precompute booleans in a `function_handler` and reference the property directly. (Memory: `feedback_pipeline_step_conditions.md`.)
2. **`form_handler` returns `null` for missing optional fields**, not `undefined`. Read-then-merge logic must use `request.body.hasOwnProperty(field)` to detect what the client sent. (Memory: `feedback_form_handler_null_defaults.md`.)
3. **Update pipelines respond with `{{{steps.merge}}}`**, not `{{{steps.update}}}`. `data_update`'s output is partial; the hook would replace the row with that partial and blank untouched fields.
4. **PATCH/DELETE put the record `id` in the body**, not the URL. Pipelines match on the bare collection path; `id` comes from `request.body.id` via `form_handler`.
5. **Admin paths use underscores, not hyphens.** `/admin/working_hours`, `/admin/time_off`, `/admin/resource_services` — match the schema names. (Hook bug fixed in `@bffless/components@0.10.2`.)
6. **`useScheduling.loadAvailability` and `submit` use a `stateRef`**, not the `setState((prev) => ...)` updater pattern, to read latest state synchronously inside async ops. (Bug fixed in `0.10.1`.)
7. **`autoSkipSingleResource` defaults to `false`** in `useScheduling`. Skipping the resource picker when there's only one option is surprising UX; opt back in if you genuinely want it.

---

## Files

- [`schemas.json`](./schemas.json) — provision once per project
- [`pipelines.json`](./pipelines.json) — one rule set `scheduling`, 29 rules; references schemas by `{{name}}`

---

## Versioning

These artifacts are versioned together with `@bffless/components`. When the JSON shape changes, the package minor version bumps. Templates SHOULD pin to a `^x.y.0` range so they pick up patch fixes (e.g. the bug-fix history above) automatically.
