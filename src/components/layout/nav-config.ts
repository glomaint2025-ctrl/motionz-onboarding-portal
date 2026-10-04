import type { IconName } from '@/components/brand/Icon';

export type ShellRole = 'client' | 'admin' | 'csm';

export interface NavConfigItem {
  label: string;
  /** Shorter label for the mobile bottom bar. */
  shortLabel?: string;
  href: string;
  icon: IconName;
  /** Feature toggle key that hides this item when set to false. */
  featureKey?: string;
}

export interface NavConfigGroup {
  label: string;
  items: NavConfigItem[];
}

export function getNavGroups(
  role: ShellRole,
  clientId: string,
  featureToggles?: Record<string, boolean>
): NavConfigGroup[] {
  let groups: NavConfigGroup[];

  if (role === 'admin') {
    groups = [
      {
        label: 'Overview',
        items: [
          { label: 'Dashboard', href: '/admin', icon: 'dashboard' },
          { label: 'Clients', href: '/admin/clients', icon: 'clients' },
          { label: 'Staff', href: '/admin/staff', icon: 'team' },
        ],
      },
      {
        label: 'Configuration',
        items: [
          { label: 'Portal Templates', shortLabel: 'Templates', href: '/admin/templates', icon: 'template' },
          { label: 'Settings & Integrations', shortLabel: 'Settings', href: '/admin/integrations', icon: 'settings' },
        ],
      },
      {
        label: 'Security',
        items: [
          { label: 'Audit Logs', href: '/admin/audit-logs', icon: 'shield' },
          { label: 'Security Alerts', shortLabel: 'Alerts', href: '/admin/security-alerts', icon: 'alert' },
        ],
      },
    ];
  } else if (role === 'csm') {
    groups = [
      {
        label: 'Workspace',
        items: [
          { label: 'Dashboard', href: '/csm', icon: 'dashboard' },
          { label: 'My Clients', shortLabel: 'Clients', href: '/csm/clients', icon: 'clients' },
          { label: 'Setup Review Queue', shortLabel: 'Queue', href: '/csm/setup-queue', icon: 'queue' },
        ],
      },
    ];
  } else {
    const base = `/portal/${clientId}`;
    groups = [
      {
        label: 'Getting started',
        items: [
          { label: 'Home', href: base, icon: 'home' },
          { label: 'Setup Progress', shortLabel: 'Setup', href: `${base}/onboarding`, icon: 'checklist', featureKey: 'onboarding' },
          { label: 'Book a Call', shortLabel: 'Book', href: `${base}/book-call`, icon: 'calendar', featureKey: 'book_call' },
        ],
      },
      {
        label: 'Grow',
        items: [
          { label: 'Leads', href: `${base}/leads`, icon: 'leads', featureKey: 'leads' },
          { label: 'Results Tracking', shortLabel: 'Results', href: `${base}/tracking`, icon: 'chart', featureKey: 'tracking' },
          { label: 'Video Scripts', shortLabel: 'Scripts', href: `${base}/video-scripts`, icon: 'video', featureKey: 'video_scripts' },
          { label: 'Roof Measurement', shortLabel: 'Roofs', href: `${base}/roof-measurement`, icon: 'roof', featureKey: 'roof_measurement' },
          { label: 'Tools & Resources', shortLabel: 'Tools', href: `${base}/tools`, icon: 'grid', featureKey: 'tools' },
        ],
      },
      {
        label: 'Account',
        items: [
          { label: 'Contract', href: `${base}/contract`, icon: 'contract', featureKey: 'contracts' },
          { label: 'Company Profile', shortLabel: 'Profile', href: `${base}/profile`, icon: 'building' },
          { label: 'Team', href: `${base}/team`, icon: 'team', featureKey: 'team' },
        ],
      },
    ];
  }

  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !item.featureKey || !featureToggles || featureToggles[item.featureKey] !== false
      ),
    }))
    .filter((group) => group.items.length > 0);
}

/** Home routes only match exactly; everything else also matches nested routes. */
export function isNavItemActive(href: string, pathname: string | null, role: ShellRole, clientId: string): boolean {
  if (!pathname) return false;
  const isRoot = href === `/portal/${clientId}` || href === '/admin' || href === '/csm';
  if (isRoot) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Items shown in the phone bottom bar (the rest live in the "More" drawer). */
export function getBottomBarItems(
  role: ShellRole,
  clientId: string,
  featureToggles?: Record<string, boolean>
): NavConfigItem[] {
  const all = getNavGroups(role, clientId, featureToggles).flatMap((g) => g.items);
  const wanted =
    role === 'client'
      ? [`/portal/${clientId}`, `/portal/${clientId}/onboarding`, `/portal/${clientId}/leads`, `/portal/${clientId}/tracking`]
      : role === 'admin'
        ? ['/admin', '/admin/clients', '/admin/templates']
        : ['/csm', '/csm/clients', '/csm/setup-queue'];
  return wanted
    .map((href) => all.find((item) => item.href === href))
    .filter((item): item is NavConfigItem => Boolean(item));
}

export function roleHomeHref(role: ShellRole, clientId: string): string {
  return role === 'admin' ? '/admin' : role === 'csm' ? '/csm' : `/portal/${clientId}`;
}
