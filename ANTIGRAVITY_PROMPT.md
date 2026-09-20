# Prompt for Antigravity — recreate the Vercel project to clear 58 GB

Copy everything inside the box below and paste it as your prompt.

---

```
Vercel team: kamlesh-guptas-projects-6fbfd271
Vercel project: hoarding-hd9a  (live site: https://hoarding-hd9a.vercel.app)
GitHub repo: kamleshgupta905/Hoarding  (private)

Deployment Storage is stuck at 58.22 GB against the Hobby plan's 10 GB limit.
Please clear it by deleting and recreating the project.

=== WHY DELETING DEPLOYMENTS DID NOT WORK ===

The old deployments were already deleted — they are all sitting in
Settings → Security → Recently Deleted showing "21 to 29 days left".

Vercel soft-deletes deployments and keeps them restorable for 30 days, and they
continue to count against the storage quota for that whole period. There is NO
"Permanently Delete" button in the dashboard and no API to force-purge them.
So the storage will not drop for another ~29 days by waiting, and the account
risks being blocked from deploying in the meantime.

Deleting the project itself is the only way to release that storage now.

=== WHY IT WAS 58 GB IN THE FIRST PLACE ===

Every build was 211 MB, of which 208 MB was public/images/hoardings — 306 photos
that nothing in the codebase referenced. Site photos are served from Google
Drive, so those files were dead weight bundled into every deployment. Roughly
280 historical deployments at 211 MB each is the 58 GB.

Already fixed on branch arena/01a0b9bf-hoarding, commit 171daec: the images were
removed, taking a deployment from 211 MB to 3.4 MB (about 62x smaller).
Do NOT re-add those images and do not revert that commit.

=== PRECONDITION — CHECK THIS FIRST ===

PR #1 on kamleshgupta905/Hoarding must be merged into main before you create the
new project. Otherwise the first deployment will be 211 MB all over again and
the problem starts rebuilding immediately.

If PR #1 is still open, STOP and tell the user to merge it. Do not merge it
yourself.

=== GOOD NEWS: NOTHING NEEDS BACKING UP ===

The project has NO environment variables — Settings → Environment Variables
shows "No Environment Variables Added". The app reads its API keys from the
browser's localStorage, entered through the admin settings UI, not from Vercel.

There is also no custom domain, only the default hoarding-hd9a.vercel.app.

So deletion loses nothing. Do not spend time on an env var backup.

=== WHAT TO DO ===

1. Verify PR #1 is merged into main. If not, stop and report.

2. Record the current build settings before deleting: framework preset, build
   command, output directory, install command, Node version, root directory,
   and the production branch.

3. Delete the hoarding-hd9a project.

4. Create a new project with the SAME NAME, hoarding-hd9a, so the
   hoarding-hd9a.vercel.app URL is preserved. If the name is not available
   immediately after deletion, wait and retry — do not pick a different name,
   as that would change the live URL.

5. Connect it to kamleshgupta905/Hoarding with main as the production branch,
   and restore the build settings from step 2.

6. Deploy from main, then verify:
     - https://hoarding-hd9a.vercel.app loads
     - the deployment is roughly 3-4 MB, NOT 211 MB   <- the key check
     - the admin dashboard loads
     - Deployment Storage now reads near zero

7. Set Project Settings → Security → Deployment Retention Policy:
     Canceled: 7 days, Errored: 7 days, Preview: 7 days, Production: 30 days

8. Optional but useful: in Settings → Git, disable automatic preview
   deployments for non-production branches, or limit them to the production
   branch. Every push to a working branch currently creates its own deployment.

=== RULES ===

- Never print, log, or commit any token or API key.
- Do not change any application code — this is infrastructure only.
- There must be exactly ONE project named hoarding-hd9a when you finish.
- Report: storage before and after, the new deployment's size in MB, and
  confirmation that the site and admin dashboard both load.
```

---

## Why recreate rather than wait

Every old deployment is already deleted, but Vercel keeps soft-deleted
deployments restorable — and billable — for 30 days, with no way to force-purge
them. Waiting means ~29 more days above the 10 GB limit, during which deploys can
be blocked. Recreating the project releases the storage immediately.

The earlier concern about losing 19 environment variables turned out to be
unfounded: the project has none, and the app takes its API keys from
`localStorage` via the admin settings UI. Deletion therefore costs nothing but
the few minutes of reconnecting the repo.

## What I already fixed (don't let Antigravity redo it)

Branch `arena/01a0b9bf-hoarding`, commit `171daec`: removed
`public/images/hoardings/` (306 unused photos, 208 MB) and added it to
`.gitignore`. Verified by grepping the whole repo that nothing referenced those
paths, then rebuilt — output went from 211 MB to 3.4 MB. Tests pass (116/116),
ESLint reports 0 errors.

The GitHub side is already complete and verified: artifacts down from 223
(120 GB) to 2 (0.85 GB), releases pruned to 4 and 1, `v1.7.30` and
`staff-apk-latest` intact, and a weekly `prune-storage.yml` workflow in place.
