import { useNavigate } from 'react-router-dom';
import {
  Activity,
  Bell,
  Building2,
  KeyRound,
  MapPin,
  Network,
  ShieldCheck,
  SlidersHorizontal,
  Users
} from 'lucide-react';
import { getStoredUser } from '../services/authService';
import SettingsPageHeader from '../components/Settings/SettingsPageHeader';
import SettingsCard from '../components/Settings/SettingsCard';
import SettingsSection from '../components/Settings/SettingsSection';
import '../styles/settings-ui.css';

/**
 * Advanced Settings (route `/settings`).
 *
 * Administrative landing page for the whole settings area, taken from the
 * Advanced Settings reference package (FinancialSettings.jsx → AdvancedSettings)
 * and adapted to THIS app.
 *
 * Rules this page follows (the reference's, kept verbatim):
 *   • no invented statistics — there is no summary strip with made-up
 *     "available now / coming soon" counts, only the real destinations;
 *   • a card is only clickable when the route actually exists (`path`),
 *     otherwise it is a non-clickable "Coming soon" tile — unfinished
 *     features are never presented as implemented;
 *   • Access & Security is admin-gated (matching the authorization the
 *     destination pages enforce server-side);
 *   • no routes, permissions or backend behaviour are changed here — the page
 *     only presents the destinations this app really has.
 *
 * WHAT CHANGED FROM THE REFERENCE
 * -------------------------------
 * The reference package ships for a build that also contains Device
 * Management, User Management, Roles & Permissions and Departments pages.
 * This app does not have those routes — the only `/settings*` route that
 * existed was `/settings` itself — so their `path` is `null` here and they
 * render as "Coming soon" tiles rather than linking to pages that would 404.
 * The one destination this app DOES have is wired for real:
 *   • Notifications → `/notifications` (existing page).
 * The reference package contains no Writing/editor components, so none are
 * included.
 *
 * The reference's Finance section is not presented here: the Financial
 * Settings page still exists and is still routed at `/settings/financial`, it
 * is simply no longer linked from this landing page.
 */

const isAdmin = () => String(getStoredUser()?.role || '').toUpperCase() === 'ADMIN';

// Access & Security — none of these routes exist in this app yet, so every
// card is a non-clickable "Coming soon" tile.
const ACCESS_CARDS = [
  {
    key: 'device-management',
    title: 'Device Management',
    description: 'Review and approve employee desktop device activation requests.',
    path: null,
    icon: ShieldCheck,
    tone: 'brand'
  },
  {
    key: 'user-management',
    title: 'User Management',
    description: 'Manage employee accounts, approvals, roles, departments, and access.',
    path: null,
    icon: Users,
    tone: 'sky'
  },
  {
    key: 'roles-permissions',
    title: 'Roles & Permissions',
    description: 'Control role-based access to ERP modules and administrative functions.',
    path: null,
    icon: KeyRound,
    tone: 'indigo'
  }
];

// Organization — no Company Profile, Departments or Locations route exists
// yet, so these stay non-clickable instead of pointing at a missing page.
const ORGANIZATION_CARDS = [
  {
    key: 'company-profile',
    title: 'Company Profile',
    description:
      'Manage company identity, contact information, branding, and organization details.',
    path: null,
    icon: Building2,
    tone: 'indigo'
  },
  {
    key: 'departments',
    title: 'Departments',
    description: 'Manage company departments and employee department assignments.',
    path: null,
    icon: Network,
    tone: 'emerald'
  },
  {
    key: 'locations',
    title: 'Locations',
    description: 'Manage office, branch, and operational locations.',
    path: null,
    icon: MapPin,
    tone: 'amber'
  }
];

// System — Notifications is the one live destination in this section.
const SYSTEM_CARDS = [
  {
    key: 'system-preferences',
    title: 'System Preferences',
    description: 'Configure regional formats, defaults, and application-wide behavior.',
    path: null,
    icon: SlidersHorizontal,
    tone: 'slate'
  },
  {
    key: 'notifications',
    title: 'Notifications',
    description: 'Review system notifications, alerts, and delivery activity.',
    path: '/notifications',
    icon: Bell,
    tone: 'purple'
  },
  {
    key: 'audit-activity',
    title: 'Audit & Activity',
    description: 'Review administrative actions, sign-ins, and system activity.',
    path: null,
    icon: Activity,
    tone: 'rose'
  }
];

export default function AdvancedSettings() {
  const navigate = useNavigate();
  const admin = isAdmin();

  const sections = [
    {
      key: 'access',
      label: 'Access & Security',
      icon: ShieldCheck,
      tone: 'emerald',
      title: 'Administrative controls',
      description: 'Approve employee devices and manage accounts, roles, and access.',
      emphasis: true,
      badge: admin ? 'Admin only' : undefined,
      cards: admin ? ACCESS_CARDS : [],
      notice: admin
        ? null
        : 'Administrator access is required to manage devices and user accounts.'
    },
    {
      key: 'organization',
      label: 'Organization',
      icon: Building2,
      tone: 'sky',
      title: 'Company setup',
      description: 'Company identity, departments, and operational locations.',
      cards: ORGANIZATION_CARDS
    },
    {
      key: 'system',
      label: 'System',
      icon: SlidersHorizontal,
      tone: 'slate',
      title: 'System configuration',
      description: 'Preferences, notifications, and activity auditing.',
      cards: SYSTEM_CARDS
    }
  ];

  return (
    <div className="erp-settings-ui p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Shared admin page header — Back · title · subtitle · contextual
          indicator. `data-erp-sticky-header` pins it via useStickyPageHeader. */}
      <SettingsPageHeader
        title="Advanced Settings"
        subtitle="Manage organization, users, security, and system configuration."
        onBack={() => navigate(-1)}
        actions={
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
              admin
                ? 'border-[#0B4A3D]/20 bg-[#0B4A3D]/[0.07] text-[#0B4A3D]'
                : 'border-line bg-surface-2 text-ink-2'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            {admin ? 'Admin workspace' : 'Standard access'}
          </span>
        }
      />

      {/* No summary strip: every figure would be an invented count of what is
          or is not implemented. The sections below show the real destinations. */}
      <div className="space-y-4">
        {sections.map((section) => (
          <SettingsSection
            key={section.key}
            label={section.label}
            icon={section.icon}
            tone={section.tone}
            title={section.title}
            description={section.description}
            emphasis={section.emphasis}
            badge={section.badge}
          >
            {section.notice ? (
              <p className="rounded-xl border border-line bg-surface px-4 py-3 text-[13px] text-ink-2 sm:col-span-2">
                {section.notice}
              </p>
            ) : (
              section.cards.map(({ key, path, ...card }) => (
                <SettingsCard
                  key={key}
                  {...card}
                  comingSoon={!path}
                  onOpen={path ? () => navigate(path) : undefined}
                />
              ))
            )}
          </SettingsSection>
        ))}
      </div>
    </div>
  );
}
