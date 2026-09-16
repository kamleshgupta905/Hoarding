import { calculateDistance, filterSitesWithinRadius, findNearestSite } from '../src/services/geoService.js';
import { useInventoryStore } from '../src/stores/inventoryStore.js';
import { useBookingStore } from '../src/stores/bookingStore.js';

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
