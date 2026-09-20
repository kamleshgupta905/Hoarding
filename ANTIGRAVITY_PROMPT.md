# Prompt for Antigravity — recreate the Vercel project to clear 58 GB

> **Do the backup step below FIRST. Deleting the project destroys 19 environment
> variables and they cannot be recovered afterwards.**

## STEP 1 — back up the environment variables yourself (do not skip)

In the Vercel dashboard: **hoarding-hd9a → Settings → Environment Variables**.

Copy all 19 names and values into a local file outside this repo — for example
`Documents\vercel-env-backup.txt`. Do not paste them into a chat, and do not save
them inside the repository.

Or via CLI, which writes them straight to a file:

```
vercel env pull vercel-env-backup.txt --environment=production --yes
```

Also note, from **Settings → Domains**, every domain attached to the project —
at minimum `hoarding-hd9a.vercel.app`, plus any custom domain.

Only continue once that file exists and you have checked it is not empty.

## STEP 2 — the prompt

Copy everything inside the box and paste it as your prompt.

---

```
Vercel team: kamlesh-guptas-projects-6fbfd271
Vercel project: hoarding-hd9a  (live site: https://hoarding-hd9a.vercel.app)
GitHub repo: kamleshgupta905/Hoarding  (private)

Deployment Storage is at 58.22 GB against the Hobby plan's 10 GB limit. Deleting
deployments individually is not working, so recreate the project instead.

=== WHY IT IS 58 GB ===

Until now every build was 211 MB, of which 208 MB was public/images/hoardings —
306 photos that nothing in the codebase referenced. Site photos are served from
Google Drive, so those files were dead weight bundled into every deployment.
Roughly 280 historical deployments at 211 MB each is the 58 GB.

Already fixed in code on branch arena/01a0b9bf-hoarding, commit 171daec: the
images were removed, taking a deployment from 211 MB to 3.4 MB (about 62x
smaller). Do NOT re-add those images and do not revert that commit.

=== PRECONDITION ===

The fix must be on main before the new project is created, otherwise the first
deployment will be 211 MB again. Check whether PR #1 on kamleshgupta905/Hoarding
is merged. If it is not, STOP and tell the user to merge it first — do not merge
it yourself.

=== WHAT TO DO ===

1. Confirm the user has backed up the 19 environment variables. If you cannot
   confirm this, STOP and ask. They are unrecoverable after deletion.

2. Record the current settings before deleting: framework preset, build command,
   output directory, install command, Node version, root directory, the
   production branch, and every attached domain.

3. Delete the hoarding-hd9a project.

4. Create a new project with the SAME NAME, hoarding-hd9a, so the
   hoarding-hd9a.vercel.app URL is preserved. If the name is not immediately
   available after deletion, wait and retry rather than picking a different one.

5. Connect it to the kamleshgupta905/Hoarding repo with main as the production
   branch, and restore the build settings recorded in step 2.

6. Restore all 19 environment variables from the user's backup, to the same
   environments (production / preview / development) they were set for.

7. Reattach any custom domains.

8. Deploy from main, then verify:
     - https://hoarding-hd9a.vercel.app loads
     - the new deployment is roughly 3-4 MB, NOT 211 MB
     - the admin dashboard loads and site photos appear (they come from Google
       Drive, so a blank grid means an environment variable is missing)

9. Set Project Settings → Security → Deployment Retention Policy:
     Canceled: 7 days, Errored: 7 days, Preview: 7 days, Production: 30 days

=== RULES ===

- Never print, log, or commit any token, API key, or environment variable value.
- Do not change any application code — this is infrastructure only.
- Do not create a second project; there must be exactly one when you finish.
- Report: storage before and after, the new deployment's size, and confirmation
  that the site and admin dashboard both load.
```

---

## Why this route

Deleting individual deployments was not working, so the project itself has to go.
That clears the whole 58 GB at once. The cost is the 19 environment variables and
the domain binding, which is why the backup step comes first and why the new
project must reuse the exact same name.

## What I already fixed (don't let Antigravity redo it)

Branch `arena/01a0b9bf-hoarding`, commit `171daec`: removed
`public/images/hoardings/` (306 unused photos, 208 MB) and added it to
`.gitignore`. Verified by grepping the whole repo that nothing referenced those
paths, then rebuilt — output went from 211 MB to 3.4 MB. Tests pass (116/116),
ESLint reports 0 errors.

That commit is in PR #1 and **is not on `main` yet**. Merge it before the new
project is created, or the first deployment will be 211 MB all over again.
