---
always_on: true
description: Architectural and code quality guidelines for the AdHoardings project.
---

# AdHoardings Codebase Architecture Rules

1. **State Management**:
   - Prefer Zustand stores (src/stores/) for cross-cutting state (inventory, active filters, selected sites).
   - Never mutate state directly; always use store actions.

2. **Data Integrity**:
   - Google Sheets is the source of truth for inventory. Maintain strict schema mapping defined in src/core/hoardingSchema.js.
   - Google Drive thumbnail links must be normalized through getDirectDriveLink().

3. **Geospatial Math**:
   - For all radius, proximity, and distance calculations, use src/services/geoService.js (powered by Turf.js).

4. **Component Design**:
   - Keep components modular. Decompose complex panels into smaller focused files under src/components/dashboard/.
   - Preserve existing prop interfaces and backwards compatibility.
