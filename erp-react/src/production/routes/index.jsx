// ============================================================
// Production routes — derived from src/data/navigation.js so the
// sidebar menu and the router always stay in sync.
//
//   /production                     → Production Dashboard (index)
//   /production/orders              → Production Orders
//   /production/casting             → Casting
//   /production/casting/pouring     → Casting (stage: Pouring)
//   /production/fabrication         → Fabrication
//   /production/fabrication/welding → Fabrication (stage: Welding)
//   /production/machine-shop        → Machine Shop
//   /production/assembly            → Assembly
//   /production/quality             → Quality
//   /production/packing             → Packing
//   /production/dispatch            → Dispatch
//   /production/reports             → Reports
//   /production/reports/...         → each report
//   /production/settings            → Settings
//   /production/settings/...        → each settings section
//
// Child keys reuse existing page elements from the registry, so
// no duplicate pages are created.
// ============================================================
import productionPages from '../pages/production';
import { menuItems } from '../data/navigation';

const rel = (path) => path.replace(/^\/production\/?/, '');

// Every menu item except the dashboard (which is the index route)
// becomes a nested route under /production; children become
// nested child routes that reuse the same page registry.
export const productionRouteList = menuItems
  .filter((item) => item.key !== 'dashboard')
  .flatMap((item) => {
    const routes = [];
    if (productionPages[item.key]) {
      routes.push({ path: rel(item.path), element: productionPages[item.key] });
    }
    if (item.children) {
      item.children.forEach((child) => {
        if (productionPages[child.key]) {
          routes.push({ path: rel(child.path), element: productionPages[child.key] });
        }
      });
    }
    return routes;
  });
