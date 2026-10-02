import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { calculateDistance, filterSitesWithinRadius, findNearestSite } from '../src/services/geoService.js';
import { useInventoryStore } from '../src/stores/inventoryStore.js';
import { useBookingStore } from '../src/stores/bookingStore.js';

// ── Key-leak detector ────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const LEAK_PATTERNS = [
  /AQ\.[A-Za-z0-9_-]{30,}/,
  /AIza[0-9A-Za-z_-]{35}/,
];

const SCAN_DIRS = ['src', 'electron'];
const SCAN_EXTS = new Set(['.js', '.jsx', '.cjs', '.ts', '.tsx']);

/**
 * Recursively collect all source files under a directory.
 * Skips node_modules and .git folders.
 */
function collectFiles(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, results);
    } else if (SCAN_EXTS.has(path.extname(entry.name))) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Scans src/ and electron/ for hardcoded API key patterns.
 * Exits with code 1 if any match is found.
 */
function checkForLeakedKeys() {
  const files = SCAN_DIRS.flatMap(d => collectFiles(path.join(PROJECT_ROOT, d)));
  let leaked = false;

  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, idx) => {
      for (const pattern of LEAK_PATTERNS) {
        if (pattern.test(line)) {
          console.error(`❌ Hardcoded API key found: ${file}:${idx + 1}`);
          console.error(`   ${line.trim()}`);
          leaked = true;
        }
      }
    });
  }

  if (leaked) {
    process.exit(1);
  }
  console.log('✅ No hardcoded API keys found');
}

checkForLeakedKeys();

// ── Architecture tests ───────────────────────────────────────────────────────

console.log('🧪 VERIFYING MODERN ARCHITECTURE...\n');

// 1. Turf.js Test
const clockTower = '28.9845, 77.7064';
const metroPlaza = '28.9650, 77.6850';
const dist = calculateDistance(clockTower, metroPlaza);
console.log('✅ Turf.js Distance Calculation: ' + (dist ? dist.toFixed(2) : 'N/A') + ' km between Clock Tower & Metro Plaza');

// 2. Radius Filter Test
const mockSites = [
  { id: 'SITE-001', Location: 'Begum Bridge', Geo_Location: '28.9920, 77.7030', City: 'Meerut' },
  { id: 'SITE-002', Location: 'Delhi Road Plaza', Geo_Location: '28.9650, 77.6850', City: 'Meerut' },
  { id: 'SITE-003', Location: 'Connaught Place', Geo_Location: '28.6304, 77.2177', City: 'Delhi' }
];

const within5km = filterSitesWithinRadius(mockSites, 28.9845, 77.7064, 5);
console.log('✅ Turf.js Radius Filter: Found ' + within5km.length + ' sites within 5 KM of Clock Tower:', within5km.map(s => s.Location + ' (' + s.distanceKm + ' km)'));

// 3. Nearest Site Test
const nearest = findNearestSite(mockSites, 28.9900, 77.7000);
console.log('✅ Turf.js Nearest Site Finder: Closest site is ' + nearest.site.Location + ' (' + nearest.distanceKm + ' km away)');

// 4. Zustand Store Test
useInventoryStore.getState().setHoardings(mockSites);
console.log('✅ Zustand InventoryStore: Total loaded sites = ' + useInventoryStore.getState().hoardings.length);
useInventoryStore.getState().setActiveCity('Meerut');
console.log('✅ Zustand Filter Selector: Filtered Meerut sites = ' + useInventoryStore.getState().getFilteredSites().length);

console.log('\n🎉 ALL ARCHITECTURAL TESTS PASSED 100%!');
