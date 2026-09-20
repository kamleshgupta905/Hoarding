# Prompt for Antigravity — Vercel deployment backlog cleanup

Copy everything inside the box below and paste it as your prompt.

---

```
Vercel team: kamlesh-guptas-projects-6fbfd271
Vercel project: hoarding-hd9a  (live site: https://hoarding-hd9a.vercel.app)

Deployment Storage is at 58.22 GB against the Hobby plan's 10 GB limit and has
not come down. Please clear the historical backlog.

=== WHY IT IS 58 GB ===

Until now every build was 211 MB, of which 208 MB was public/images/hoardings —
306 photos that nothing in the codebase referenced. Site photos are served from
Google Drive, so those files were dead weight bundled into every deployment.
With roughly 280 historical deployments at 211 MB each, that is the 58 GB.

This is already fixed in code, on branch arena/01a0b9bf-hoarding, commit 171daec:
the images were removed, taking a deployment from 211 MB to 3.4 MB (about 62x
smaller). So new deployments are tiny. Your job is only the historical backlog.

Do NOT re-add the images and do not revert that commit.

=== WHAT TO DO ===

Delete the old deployments for hoarding-hd9a using the safe flag, which skips
anything currently aliased or serving production:

  vercel rm hoarding-hd9a --safe --yes

Then verify what remains and, if the figure is still high, delete remaining
unprotected old deployments individually via the API — but always keep:

  - the current production deployment (never delete it)
  - the 3 most recent production deployments, for rollback
  - anything with an alias or custom domain attached

IMPORTANT: do not delete the hoarding-hd9a PROJECT itself. It holds 19
environment variables and the production domain, and recreating it would mean
reconfiguring all of them. Only delete deployments.

Also check Settings → Security → Recently Deleted and permanently purge anything
sitting there — soft-deleted deployments can still count against the storage
quota for up to 30 days, which is likely why earlier deletions did not move the
number.

=== ALSO ===

There was a second project, hoarding-app-2026, deploying the same repo from the
arena branch. The user already deleted it. If any trace of it remains, purge it.

While in the dashboard, set Project Settings → Security → Deployment Retention
Policy for hoarding-hd9a:
  Canceled:   7 days
  Errored:    7 days
  Preview:    7 days
  Production: 30 days   (Hobby cannot select longer)

=== RULES ===

- Never print or commit any token, API key, or environment variable value.
- Do not change any application code — this is infrastructure cleanup only.
- Do not delete the project, its environment variables, or its domains.
- Report the Deployment Storage figure before and after, the number of
  deployments deleted, and confirm https://hoarding-hd9a.vercel.app still loads.
```

---

## Why `--safe` rather than deleting the project

Deleting and recreating the project would also clear the storage, but it would
destroy 19 environment variables and release the `hoarding-hd9a` domain name,
which is not guaranteed to be immediately reclaimable. `vercel rm --safe` frees
the same storage while leaving the project, its variables and its domain intact.

## What I already fixed (don't let Antigravity redo it)

Branch `arena/01a0b9bf-hoarding`, commit `171daec`: removed
`public/images/hoardings/` (306 unused photos, 208 MB) and added it to
`.gitignore`. Verified with a grep across the whole repo that nothing referenced
those paths, then rebuilt: output went from 211 MB to 3.4 MB. Tests still pass
(116/116), ESLint reports 0 errors.

That commit is in PR #1 and **is not on `main` yet**. Until it merges, a fresh
deployment of `main` will still be 211 MB — so merging matters as much as the
cleanup does.
