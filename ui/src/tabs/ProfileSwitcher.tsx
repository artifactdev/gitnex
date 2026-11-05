import { forwardRef, type Ref } from 'react';
import { Pencil, Plus, Trash2, type LucideIcon, type LucideProps } from 'lucide-react';
import { profileLabel } from '../app/profileLabel';
import { useAppState } from '../app/state';
import { Avatar } from '../avatars/Avatar';
import { openMenuAt } from '../menu/menuStore';
import { pressOpener } from '../menu/pressDrag';
import type { MenuRow } from '../menu/types';
import { confirmAction } from '../ui/ConfirmDialog';
import { HoverTooltip } from '../ui/HoverTooltip';
import { ProfileDialog, useProfileDialog } from './ProfileDialog';

/**
 * K69: each profile's row shows its colour, as a dot the size of a menu icon; the current one's
 * dot has a ring (in place of the old check). One component per colour/state, kept, so the menu's
 * memoized rows don't remount their icon.
 */
function ProfileMarker({ name, email, color, current, size = 16 }: { name: string; email?: string; color: string; current: boolean; size?: number }) {
  const address = email?.trim();
  if (address) return <Avatar name={name.trim() || address} email={address} size={size} />;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden data-profile-dot={color}>
      <circle cx="12" cy="12" r={current ? 6 : 7} fill={color} />
      {current && <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2" />}
    </svg>
  );
}

const markers = new Map<string, LucideIcon>();
/** A profile's menu mark: its Gravatar (from the commit email) when it has one, else its dot. */
export function profileMarkerIcon(name: string, email: string | undefined, color: string, current: boolean): LucideIcon {
  const key = `${name}|${email ?? ''}|${color}|${current}`;
  let icon = markers.get(key);
  if (!icon) {
    const Marker = forwardRef<SVGSVGElement, LucideProps>(({ size = 16, className }, ref) => (
      <span ref={ref as unknown as Ref<HTMLSpanElement>} className={className} style={{ display: 'inline-flex' }}>
        <ProfileMarker name={name} email={email} color={color} current={current} size={typeof size === 'number' ? size : 16} />
      </span>
    ));
    Marker.displayName = `ProfileMarker(${key})`;
    icon = Marker as unknown as LucideIcon;
    markers.set(key, icon);
  }
  return icon;
}

function rows(): MenuRow[] {
  const { profiles, profile, switchProfile, deleteProfile } = useAppState.getState();
  const others = profiles.filter((p) => p.id !== profile.id);
  return [
    ...profiles.map((p): MenuRow => ({
      kind: 'action',
      id: `profile.${p.id}`,
      label: profileLabel(p.name),
      icon: profileMarkerIcon(p.gitName?.trim() || p.name, p.gitEmail, p.color, p.id === profile.id),
      tooltip: '',
      run: () => { void switchProfile(p.id); },
    })),
    { kind: 'separator' },
    { kind: 'action', id: 'profile.new', label: 'New profile…', icon: Plus, tooltip: 'Create a profile with its own tabs, recent repos and settings', run: () => useProfileDialog.getState().open('new') },
    { kind: 'action', id: 'profile.rename', label: 'Edit profile…', icon: Pencil, tooltip: 'Change this profile\'s name and color', run: () => useProfileDialog.getState().open('rename') },
    ...(others.length
      ? [{
          kind: 'submenu' as const, id: 'profile.delete', label: 'Delete profile', icon: Trash2, tooltip: 'Delete another profile (switch away before deleting the current one)',
          rows: others.map((p): MenuRow => {
            const name = profileLabel(p.name);
            return {
              kind: 'action', id: `profile.delete.${p.id}`, label: `${name}…`, icon: Trash2, tooltip: `Delete ${name} and its tabs`,
              // K68: never in one click — the profile, its tabs and its recent list go.
              run: () => {
                void confirmAction({
                  title: `Delete the profile “${name}”?`,
                  body: 'Its tabs, recent repositories and settings are removed. Your repositories on disk are not touched. This cannot be undone.',
                  confirmLabel: 'Delete profile',
                  arm: `Click again to delete ${name} and its tabs`,
                  danger: true,
                }).then((ok) => { if (ok) void deleteProfile(p.id); });
              },
            };
          }),
        }]
      : []),
  ];
}

/** Far right of the tab bar (spec §6.2), and its New/Edit/Delete dialog. A profile without a
 * name shows just its colour. */
export function ProfileSwitcher() {
  const name = useAppState((s) => s.profile.name).trim();
  const commitName = useAppState((s) => s.profile.gitName ?? '').trim();
  const email = useAppState((s) => s.profile.gitEmail ?? '').trim();
  const color = useAppState((s) => s.profile.color);
  return (
    <>
      <HoverTooltip content="Switch profile">
        <button type="button" className="profile-switcher" aria-label={`Profile: ${profileLabel(name)}`} {...pressOpener((el) => openMenuAt(el, rows(), `profile.${useAppState.getState().profile.id}`, rows, 'Switch profile'))}>
          {email
            ? <Avatar name={commitName || name || email} email={email} size={18} />
            : <span className="profile-dot" style={{ background: color }} aria-hidden />}
          {name || null}
        </button>
      </HoverTooltip>
      <ProfileDialog />
    </>
  );
}
