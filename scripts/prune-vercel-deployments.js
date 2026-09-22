import { execSync } from 'child_process';

/**
 * 🧹 Vercel Deployment Pruner
 * Ensures project keeps strictly the latest 2 deployments (active + 1 previous rollback).
 * All older deployments are deleted safely using `vercel remove <url> --yes`.
 */
export async function pruneVercelDeployments(keepCount = 2) {
  console.log(`🔍 Checking Vercel deployments (retaining newest ${keepCount})...`);

  try {
    const rawOutput = execSync('npx vercel ls', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const lines = rawOutput.split('\n');

    // Extract all vercel.app deployment URLs
    const deploymentUrls = [];
    const urlRegex = /https:\/\/[a-zA-Z0-9_-]+\.vercel\.app/g;

    for (const line of lines) {
      const matches = line.match(urlRegex);
      if (matches) {
        for (const url of matches) {
          if (!deploymentUrls.includes(url)) {
            deploymentUrls.push(url);
          }
        }
      }
    }

    console.log(`📊 Found ${deploymentUrls.length} deployment(s) on Vercel:`);
    deploymentUrls.forEach((u, idx) => console.log(`   [${idx + 1}] ${u}`));

    if (deploymentUrls.length <= keepCount) {
      console.log(`✅ Total deployments (${deploymentUrls.length}) is <= ${keepCount}. Nothing to prune.`);
      return { kept: deploymentUrls, removed: [] };
    }

    const kept = deploymentUrls.slice(0, keepCount);
    const toRemove = deploymentUrls.slice(keepCount);

    console.log(`\n🛡️ Keeping newest ${keepCount} deployment(s):`);
    kept.forEach(u => console.log(`   🌟 ${u}`));

    console.log(`\n🗑️ Removing ${toRemove.length} older deployment(s)...`);
    const removed = [];

    for (const url of toRemove) {
      try {
        console.log(`   Deleting: ${url}...`);
        execSync(`npx vercel remove ${url} --yes`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        console.log(`   ✅ Deleted: ${url}`);
        removed.push(url);
      } catch (delErr) {
        console.warn(`   ⚠️ Warning: Could not delete ${url}:`, delErr.message || delErr);
      }
    }

    console.log(`\n🎉 Vercel deployment pruning complete! ${removed.length} removed, ${kept.length} active.`);
    return { kept, removed };
  } catch (err) {
    console.error('❌ Error pruning Vercel deployments:', err.message || err);
    throw err;
  }
}

// If executed directly from CLI
if (process.argv[1] && process.argv[1].includes('prune-vercel-deployments')) {
  pruneVercelDeployments(2).catch(() => process.exit(1));
}
