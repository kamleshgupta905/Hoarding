# Prompt for Antigravity — GitHub + Vercel storage cleanup

Copy everything inside the box below and paste it as your prompt.

---

```
Repo: kamleshgupta905/Hoarding (private)
Second repo: kamleshgupta905/hoarding-desktop-releases (public, holds the desktop installers)
Vercel project: the one deploying https://hoarding-hd9a.vercel.app

I need two storage problems fixed permanently. Do the one-time cleanup AND set up
automation so it never fills up again.

=== BACKGROUND ===

This project builds a ~680 MB Windows desktop app (Electron) and a ~211 MB Android
APK on every push to main, via two workflows:
  .github/workflows/build-desktop.yml
  .github/workflows/build-apk.yml

Nothing was ever cleaned up, so right now there are:
  - 223 GitHub Actions artifacts totalling ~120 GB (free tier is 500 MB)
  - 99 releases on kamleshgupta905/Hoarding
  - 37 releases on kamleshgupta905/hoarding-desktop-releases
  - a large pile of old Vercel deployments

The desktop build already FAILS on its last step with:
  "Artifact storage quota has been hit. Unable to upload any new artifacts."

Note the build itself and the release publishing both SUCCEED — only the artifact
upload step fails. So the app is fine, the storage is not.

=== TASK 1: GitHub one-time cleanup ===

Delete ALL Actions artifacts except the single newest one per artifact name.
The artifact names in use are "Heera-Advertising-Admin-Desktop-Windows",
"heera-staff-camera-apk" and "Heera-Staff-Camera-APK".

Then delete old releases on BOTH repos, keeping only the newest 3 on each, and
delete their git tags too.

CRITICAL CONSTRAINT: do not delete whatever GitHub marks as the "latest" release on
kamleshgupta905/hoarding-desktop-releases. The desktop app's auto-updater
(electron-updater) resolves updates by reading latest.yml from that release. Deleting
it would strand every installed copy of the app with no way to update. Currently that
is v1.7.30. Also never delete the release tagged "staff-apk-latest" on the main repo —
field staff download the Android APK from it directly.

=== TASK 2: GitHub automation ===

There is already a prune step called "🧹 Prune Old Releases and Artifacts" at the end
of build-desktop.yml. Verify it is correct and actually works, fix it if not. It should
keep the newest 3 releases per repo plus all superseded artifacts deleted, run with
"if: always()" so a build that failed because storage was full still drains storage,
and never touch the latest release.

Additionally create a scheduled workflow (weekly) that performs the same prune, so
storage stays bounded even during periods when no build runs. It should also be
runnable manually via workflow_dispatch.

=== TASK 3: Vercel ===

Old deployments are filling the Hobby plan's 10 GB Deployment Storage.

First set the retention policy in the dashboard under
Project Settings → Security → Deployment Retention Policy:
  Canceled:   7 days
  Errored:    7 days
  Preview:    7 days
  Production: 30 days   (Hobby cannot select longer)

Then delete the existing backlog of old deployments. Never delete the current
production deployment, and keep enough recent production deployments to roll back to
(at least 3).

Note: Vercel changed Hobby retention on 16 Sep 2026 — each Hobby project now
automatically keeps only its 3 most recent production deployments plus 3 most recent of
any type, and deletes unprotected ones immediately when over 10 GB. So CHECK CURRENT
USAGE FIRST: the backlog may already have shrunk on its own, and there may be little
left to do beyond setting the policy.

If the dashboard retention policy is not sufficient on its own, add a scheduled GitHub
Actions workflow that prunes Vercel deployments via the Vercel API, reading a
VERCEL_TOKEN from GitHub repository secrets. Do not hardcode any token.

=== RULES ===

- Never commit or print any token, API key or credential.
- Do not change any application code — this is purely CI/CD and infrastructure.
- Do not modify the actual build or packaging steps; only retention/cleanup.
- Work on a branch and open a PR rather than committing straight to main.
- Report back: how much storage was freed on each of GitHub and Vercel, and confirm
  that the desktop auto-updater still resolves v1.7.30 (or newer) correctly afterwards.
```

---

## Why this is needed

My sandbox can reach `api.github.com`, but the GitHub token I run under is a bot
account (`arena-ai-coding-agent[bot]`) with repo-contents permission only — deleting
artifacts and releases returns `403 Resource not accessible by integration`. Vercel and
Google are blocked at the network level entirely, so no credential would help there.

## What I already did (don't let Antigravity redo it)

On branch `arena/01a0b9bf-hoarding`, commit `065bddc`:

- Artifact retention cut from 30 days to 3 days in both workflows
- `continue-on-error: true` on both upload steps, so a full quota can no longer make an
  otherwise good build report as failed
- Added the `🧹 Prune Old Releases and Artifacts` step to `build-desktop.yml`

That commit is **not on `main` yet** — it is in PR #1. If that PR gets merged first,
Antigravity only needs the one-time cleanup, the weekly scheduled workflow, and Vercel.
