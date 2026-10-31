import { Outlet } from 'react-router-dom';
import ProductionSettingsShell from '../../components/production/settings/ProductionSettingsShell';

/**
 * Production Settings layout route.
 *
 * Owns the PDE-style shell for every /production/settings/* page. Because it is
 * a layout route, the shell mounts ONCE for the whole settings area: moving
 * between sections swaps only the content column, so the rail keeps its scroll
 * position and selection, the heading never re-renders, and unsaved edits made
 * inside a section are not discarded by navigating to a sibling section.
 */
export default function SettingsLayout() {
  return (
    <ProductionSettingsShell>
      <Outlet />
    </ProductionSettingsShell>
  );
}
