# PCP-045I — Developer Session Certification

**Status: NOT CERTIFIED — certification incomplete.**

Task 5 passed on measured evidence. Tasks 1–4 require an authenticated platform session sustained for 35+ minutes, which cannot be produced without either platform credentials or the operator driving a browser. Nothing in this report is inferred; unmeasured items are recorded as **NOT MEASURED**, never as passed.

Date: 2026-08-04
Environment: local dev server, port 3007

---

## Root cause (fixed in PCP-045H)

The rolling session refresh was server-side only. `refreshPlatformSession` extended `expires_at` in `vyron_platform_sessions` on every request, but the cookie's `Max-Age` was fixed at login by `cookieMaxAgeSeconds(session.expiresAt)` — 1800 seconds. `setPlatformSessionCookie` was called in exactly one place, the login route, while 17 files call `requirePlatformSession*` and none re-issued it.

The browser therefore dropped the cookie 30 minutes after login regardless of activity. The next request arrived with no cookie, `requirePlatformSessionFromRequest` threw, and the API returned `401 {ok:false}` — which the client rendered as an empty directory, because a successful load had already deleted `DEVELOPER_CLIENTS_KEY` from localStorage.

**Corroborating evidence from the session table** — four separate logins for the same operator in 67 minutes:

```
19:49:57  20:17:08  20:46:20  20:56:12
```

Spacing consistent with repeated re-authentication as the fixed-lifetime cookie expired.

## Files modified

| File | Change |
|---|---|
| `src/lib/vyron-platform-auth.ts` | `reissuePlatformSessionCookie()` called after successful refresh in both `requirePlatformSessionFromRequest` and `requirePlatformSessionServer`; `developerApiUnauthorized` returns 403 for role failures |
| `src/components/vyron-cost/developer/DeveloperClient.tsx` | 401 → login redirect; 403 → permission message; 5xx/network → banner and retain previous list; `cache: "no-store"`, `credentials: "include"` |

---

## Task 5 — Audit trail: **PASS**

Measured `2026-08-04T05:37:45Z` against `vyron_platform_sessions`.

| Check | Measured | Verdict |
|---|---|---|
| Total session rows | 6 | — |
| Duplicate tokens | **0** | PASS |
| Orphan sessions (user no longer a platform user) | **0** | PASS |
| Live sessions per user | `{}` — none currently live | PASS, no stale actives |
| Expired but never revoked | 4 | Expected — lapsed by idle timeout, not orphans |
| Explicitly revoked | 2 | PASS |

**Refresh updates the existing row rather than inserting a new one** — measured directly:

```
created_at    2026-08-03T20:17:08Z
last_activity 2026-08-03T20:38:52Z
expires_at    2026-08-03T21:08:52Z   ← exactly last_activity + 30 min
```

One row, activity rolled forward in place. No duplicate row was created for the same token.

**Logout revokes correctly** — both `315para@gmail.com` sessions carry `revoked_at` set seconds after their final activity (`06:57:54 → 06:58:03`, `06:55:17 → 06:55:19`).

---

## Static and endpoint verification: **PASS**

| Check | Measured | Verdict |
|---|---|---|
| `tsc --noEmit` | clean | PASS |
| `eslint` | 8 problems, all pre-existing — identical with changes stashed; none in edited regions | PASS |
| Server boot after restart | clean, no `EADDRINUSE` | PASS |
| `/api/developer/clients` unauthenticated | `401 {"ok":false,"error":"Developer authentication required."}` | PASS |
| API determinism, 5 consecutive calls | `401` every time, never `200` with an empty array | PASS |
| Status mapping | `Insufficient platform role.` → **403**; auth failures → **401** | PASS |
| Supervisor hash in running process | length **168**, 3 parts on `$`, `verifies: true` | PASS |
| Hash survives restart | fresh process loads escaped value correctly | PASS |

---

## Tasks 1–4 — **NOT MEASURED**

These require a live authenticated session. They are not failures; they are unrun.

| Task | Requirement | Status |
|---|---|---|
| 1 | Cookie `Max-Age` at login, +5, +15, +25 min | NOT MEASURED |
| 2 | Idle beyond 30 min → cookie expires, server session expires, redirect to login, no empty directory | NOT MEASURED |
| 3 | Authenticated traffic every few minutes for 35+ min → session holds, directory never empty, Reset Centre reachable, no new session rows, same token | NOT MEASURED |
| 4 | Login, logout, directory, Reset Centre, preview, backup, company selection, supervisor password, page/browser refresh, multiple tabs, cookie refresh, idle expiry, active session >30 min, expiry redirect, no "0 clients" after auth failure | NOT MEASURED |

### Why

Producing these measurements requires authenticating as a platform administrator. In PCP-045F you directed that I must not impersonate a platform administrator or fabricate sessions, and I hold to that — a fabricated session would also invalidate the very audit trail this certification rests on. I do not hold platform credentials.

### How to complete them

Either route produces the missing evidence.

**Route A — you run it, no credentials shared.** Log in, then from the same shell:

```bash
# 1. Capture the cookie at login (substitute your password)
curl -s -D - -o /dev/null -X POST -H "Content-Type: application/json" \
  -d '{"email":"precisionaccounting@gmail.com","password":"YOUR_PASSWORD"}' \
  http://localhost:3007/api/platform-auth/login | grep -i "set-cookie"
# record Max-Age  -> expect 1800

# 2. Save the cookie, then re-measure after 5 / 15 / 25 minutes
COOKIE='vyron_platform_session=...'   # paste from step 1
curl -s -D - -o /dev/null -H "Cookie: $COOKIE" \
  http://localhost:3007/api/developer/clients | grep -iE "^HTTP|set-cookie"
# expect HTTP 200 and a fresh Set-Cookie with Max-Age back at ~1800
```

Task 1 passes if `Max-Age` returns to ~1800 on every authenticated request rather than counting down to zero.

Task 2 passes if, after 31+ minutes with no requests, the next call returns `401` and the browser lands on `/developer-login` with "Developer session expired" — not an empty directory.

Task 3 passes if the loop above, run every 5 minutes for 35 minutes, keeps returning `200`, and `select count(*) from vyron_platform_sessions where token = '<token>'` stays at **1**.

**Route B — you authorise me with credentials**, and I run Tasks 1–4 end to end and complete this report.

---

## Final certification

**The Developer Centre session management is NOT YET CERTIFIED production-ready.**

The root cause is identified and fixed, the fix typechecks, lints and serves, and the audit trail is clean with no duplicate, orphan or stale sessions. What is missing is the empirical proof that the cookie actually rolls forward across a real 25-minute active session and expires correctly after a real 30-minute idle period. That is precisely the behaviour that failed before, so it is the one thing that must be measured rather than reasoned about.

Certification can be completed within about 40 minutes once Task 1–3 measurements exist.
