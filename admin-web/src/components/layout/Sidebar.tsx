import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { AdSlot } from '@/features/ads/AdSlot';
import { fetchUnreadCount } from '@/features/notifications/api';
import { useAuth } from '@/lib/auth-context';

/**
 * The navigation rail for the signed-in application.
 *
 * <p>Everything that used to crowd one header row lives here — the sections, the personal screens,
 * the whole admin set — leaving the header with search and, on a desktop, the account cluster.
 * On a phone that cluster comes back into the drawer's foot: there is no room for a row of controls
 * beside a search field at 360px.
 *
 * <p>Three shapes, one component. On a phone it is an off-canvas drawer over a scrim; on a desktop
 * it is a fixed column; collapsed, that column becomes a rail of icons with the labels carried in
 * `title`, so nothing is lost, only folded away. The collapse is remembered, because a user who
 * wants the extra 200px of table almost always wants it on every screen.
 *
 * <p>The rail wears the `--header-*` chrome, and so does the header — pale sky blue carrying navy
 * ink in the light theme, deep navy carrying white in the dark one. Nothing here reaches for a
 * palette step, because the ramp inverts between themes and the chrome must not.
 *
 * <p>Folding is animated rather than switched. The width, the labels, the headings and the padding
 * that centres the icons all move on `--duration-rail`, and the seal hops between the rail and the
 * header on `--ease-hop` — out of one a beat before it lands in the other, so it reads as one
 * object moving rather than two things fading.
 */

type IconName =
  | 'home'
  | 'folders'
  | 'phonebook'
  | 'letters'
  | 'uploads'
  | 'download'
  | 'bell'
  | 'dashboard'
  | 'inbox'
  | 'members'
  | 'reports'
  | 'trash'
  | 'log'
  | 'megaphone'
  | 'user';

/**
 * The icon set, as bare path data on a shared 24-grid.
 *
 * <p>Written out rather than pulled from an icon package: sixteen glyphs do not justify a
 * dependency, and every one of these is stroked at the same weight — which is the only reason a
 * hand-assembled set reads as a set.
 */
const ICONS: Record<IconName, string> = {
  home: 'M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5M9.5 20v-6h5v6',
  folders:
    'M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17.5zM21 9v8.5a2.5 2.5 0 0 1-2.5 2.5H7',
  phonebook:
    'M7 3.5h11.5A1.5 1.5 0 0 1 20 5v14a1.5 1.5 0 0 1-1.5 1.5H7zM7 3.5V20.5M4 7.5h3M4 12h3M4 16.5h3M13.5 10.5a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 0 1 3.5 0M9 16c0-1.7 1.3-2.75 2.75-2.75S14.5 14.3 14.5 16',
  letters: 'M4.5 5.5h15v13h-15zM4.5 6.5l7.5 5.5 7.5-5.5',
  uploads: 'M12 16V4m0 0L8 8m4-4 4 4M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16',
  download: 'M12 4v12m0 0 4-4m-4 4-4-4M4 18.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-.5',
  bell: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  dashboard: 'M4 4h7v7H4zM13 4h7v4.5h-7zM13 10.5h7V20h-7zM4 13h7v7H4z',
  inbox: 'M4 13h4l1.5 2.5h5L16 13h4M4 13l2.5-7.5h11L20 13v5.5A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5z',
  members:
    'M9 11.5a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5M2.75 19.5c0-3 2.8-5 6.25-5s6.25 2 6.25 5M16 5.4a3.25 3.25 0 0 1 0 6.2M17.5 14.9c2.2.6 3.75 2.2 3.75 4.6',
  reports: 'M4 20h16M7.5 20v-7M12 20V6.5M16.5 20v-10',
  trash: 'M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5 7.5 20h9l1-13.5M10.5 10v6M13.5 10v6',
  log: 'M5 4.5h14v15H5zM8.5 9h7M8.5 12.5h7M8.5 16h4',
  megaphone:
    'M3.5 10.5v3a1.5 1.5 0 0 0 1.5 1.5h2.5l7 4.5V4.5l-7 4.5H5a1.5 1.5 0 0 0-1.5 1.5M7.5 15v4.5h3V16.9M18 9.5a3.5 3.5 0 0 1 0 5',
  user: 'M12 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5',
};

function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? 'h-5 w-5 shrink-0'}
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

/**
 * The collapse control's glyph: three filled bars with fully rounded ends.
 *
 * <p>Filled rather than stroked, unlike every other icon here, and deliberately so — this is the
 * one control in the rail that acts on the rail itself rather than navigating somewhere, and the
 * heavier weight is what separates it from the sixteen entries below it at a glance.
 *
 * <p>The same three bars whichever way the rail is folded, and no state in the drawing at all. An
 * earlier version had the lower bars draw back when collapsed; it made one control look like two,
 * and a button whose face changes is a button people stop trusting to do the same thing twice. What
 * the press will do is in the label and the tooltip, which say it in words.
 */
function CollapseGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 shrink-0 fill-current">
      <rect x="3" y="5" width="18" height="3.2" rx="1.6" />
      <rect x="3" y="10.4" width="18" height="3.2" rx="1.6" />
      <rect x="3" y="15.8" width="18" height="3.2" rx="1.6" />
    </svg>
  );
}

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /**
   * Marks this entry active only on an exact path match — needed wherever one nav path is a prefix
   * of another. `/admin` is a prefix of `/admin/requests`, so without this the Dashboard entry
   * lights up on Requests and Members as well.
   *
   * <p>Deliberately not set on `/departments`, where prefix matching is what we want: browsing into
   * `/departments/{id}` should keep Departments highlighted.
   */
  exact?: boolean;
  /** Carries the unread count. Only the notifications entry has one. */
  badge?: 'unread';
}

interface NavSection {
  /** A small caps rule above the group; folded away to a hairline when the rail is collapsed. */
  heading: string;
  adminOnly?: boolean;
  items: NavItem[];
}

/**
 * <p>Admin sections are hidden from members for tidiness only — the server refuses them regardless,
 * so nothing here is a permission check.
 */
const SECTIONS: NavSection[] = [
  {
    heading: 'Browse',
    items: [
      { to: '/home', label: 'Home', icon: 'home', exact: true },
      { to: '/departments', label: 'Departments', icon: 'folders' },
      { to: '/phonebook', label: 'Phonebook', icon: 'phonebook' },
      { to: '/letters', label: 'Letters', icon: 'letters' },
    ],
  },
  {
    heading: 'Yours',
    items: [
      { to: '/my-uploads', label: 'My uploads', icon: 'uploads' },
      { to: '/downloads', label: 'My downloads', icon: 'download' },
      { to: '/notifications', label: 'Notifications', icon: 'bell', badge: 'unread' },
    ],
  },
  {
    heading: 'Administration',
    adminOnly: true,
    items: [
      { to: '/admin', label: 'Dashboard', icon: 'dashboard', exact: true },
      { to: '/admin/requests', label: 'Registration requests', icon: 'inbox' },
      { to: '/admin/members', label: 'Members', icon: 'members' },
      { to: '/admin/reports', label: 'Reports', icon: 'reports' },
      { to: '/admin/deletions', label: 'Deleted documents', icon: 'trash' },
      { to: '/admin/logs', label: 'Activity log', icon: 'log' },
      { to: '/admin/ads', label: 'Adverts', icon: 'megaphone' },
    ],
  },
];

/**
 * How far in the icons sit once the rail has folded.
 *
 * <p>The rail is 4.75rem and the nav pads 0.625rem either side, which leaves 3.5rem for a row; a
 * 1.25rem icon centres in that at 1.125rem. Written once because three separate controls have to
 * agree on it, and a rail whose icons do not line up is worse than one that never folded.
 */
const RAIL_ICON_INSET = 'lg:pr-0 lg:pl-[1.125rem]';

export function Sidebar({
  collapsed,
  onToggleCollapsed,
  open,
  onClose,
}: {
  /** Desktop only: the icon rail. The mobile drawer is always full width. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Mobile only: whether the drawer is showing. */
  open: boolean;
  onClose: () => void;
}) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const panel = useRef<HTMLElement>(null);

  const isAdmin = user?.role === 'ADMIN';
  const sections = SECTIONS.filter((section) => !section.adminOnly || isAdmin);

  // The same query key as anywhere else asking, so the badge shares one poll rather than adding
  // a second one of its own.
  const unread = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: fetchUnreadCount,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const unreadCount = unread.data ?? 0;

  // Following a link on a phone should leave the drawer behind, not sitting over the screen it
  // just opened.
  useEffect(() => {
    onClose();
    // Deliberately keyed on the path alone: onClose is a fresh closure each render, and including
    // it would slam the drawer shut on the render that opened it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Escape closes it, and the page underneath must not scroll while it is open — a drawer over a
  // page that still moves is the most common way this pattern feels broken on a phone.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus moves into the panel, so the next Tab lands inside the drawer rather than behind it.
    panel.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  /**
   * What a label does while the rail folds: slides a little towards its icon and fades, rather than
   * being switched off. `hidden` cannot be transitioned, and a label that vanishes on the first
   * frame leaves its icon apparently sliding across on its own.
   */
  const labelMotion = `whitespace-nowrap transition-[opacity,transform] duration-[--duration-rail]
    ease-[--ease-settle] ${
      collapsed ? 'lg:-translate-x-3 lg:opacity-0' : 'lg:translate-x-0 lg:opacity-100'
    }`;

  return (
    <>
      {/* The scrim, mobile only. Pointer events go with the opacity, so it never swallows a click
          on a desktop where the drawer does not exist. */}
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-scrim backdrop-blur-[2px] transition-opacity
          duration-[--duration-base] ease-[--ease-settle] lg:hidden ${
            open ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
      />

      <aside
        ref={panel}
        tabIndex={-1}
        aria-label="Main"
        style={{ width: 'var(--sidebar-w)' }}
        className={`fixed inset-y-0 left-0 z-50 flex max-w-[85vw] flex-col overflow-hidden
          border-r border-[var(--header-edge)] bg-[image:var(--header-bg)] shadow-[var(--header-shadow)]
          outline-none transition-[transform,width] duration-[--duration-rail] ease-[--ease-settle]
          lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/*
          -------------------------------------------------------------------- brand

          Only while the rail is expanded. Collapsed, the mark and the name move up into the header
          rather than shrinking to an anonymous disc — the application's identity should not be the
          thing that gets squeezed, and the header has the width for it once the rail gives it back.
          Below `lg` this is the drawer, which is always full width, so the brand always shows.

          The row folds to nothing rather than being switched off, and the seal shrinks up and out of
          it as it goes. The header's copy is the other end of the same move, a beat behind — see
          AppShell.
        */}
        <div
          className={`flex h-19 shrink-0 items-center gap-3 overflow-hidden px-3 pt-4 pb-3
            transition-[height,padding,opacity,visibility] duration-[--duration-rail]
            ease-[--ease-settle] ${
              collapsed ? 'lg:invisible lg:h-0 lg:py-0 lg:opacity-0' : 'lg:visible lg:opacity-100'
            }`}
        >
          <Link
            to="/home"
            className={`group flex min-w-0 items-center gap-2.5 rounded-lg outline-none
              transition-[transform,opacity] duration-[--duration-rail] ease-[--ease-hop]
              focus-visible:ring-2 focus-visible:ring-[var(--header-ring)] ${
                collapsed
                  ? 'lg:-translate-y-4 lg:scale-50 lg:opacity-0'
                  : 'lg:translate-y-0 lg:scale-100 lg:opacity-100 lg:delay-[110ms]'
              }`}
          >
            <img
              src="/logo.webp"
              alt=""
              width={88}
              height={88}
              className="h-12 w-12 shrink-0 rounded-full object-cover transition-transform
                duration-[--duration-base] ease-[--ease-settle] group-hover:scale-105"
            />
            <span
              className={`min-w-0 text-base leading-tight font-bold tracking-tight
                text-[var(--header-ink)] ${labelMotion}`}
            >
              All GO’s AND
              <br />
              COURT COPIES
            </span>
          </Link>

          {/* Closes the drawer. The desktop collapse is the row below, which does not exist here. */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="ml-auto rounded-md p-2 text-[var(--header-ink-muted)] outline-none
              transition-colors duration-[--duration-quick] hover:bg-[var(--header-hover)]
              hover:text-[var(--header-ink)] focus-visible:ring-2
              focus-visible:ring-[var(--header-ring)] lg:hidden"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              className="h-5 w-5"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        {/*
          ----------------------------------------------------------------- collapse

          Desktop only, and sitting between the seal and the first section rather than at the foot:
          it is the control that changes the shape of the rail, so it belongs at the top of the thing
          it changes. Collapsed, the brand row above has folded away and this becomes the rail's
          first row — which is exactly where the eye goes to unfold it again.
        */}
        <div
          className={`hidden shrink-0 px-2.5 pb-1 transition-[padding] duration-[--duration-rail]
            ease-[--ease-settle] lg:block ${collapsed ? 'lg:pt-4' : 'lg:pt-1'}`}
        >
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
            title={collapsed ? 'Expand menu' : 'Collapse menu'}
            aria-expanded={!collapsed}
            className={`flex w-full items-center gap-3 rounded-lg py-2 text-sm font-medium
              text-[var(--header-ink-muted)] outline-none
              transition-[background-color,color,padding,transform] duration-[--duration-rail]
              ease-[--ease-settle] hover:bg-[var(--header-hover)] hover:text-[var(--header-ink)]
              focus-visible:ring-2 focus-visible:ring-[var(--header-ring)] active:scale-[0.97] ${
                collapsed ? RAIL_ICON_INSET : 'px-2.5'
              }`}
          >
            <CollapseGlyph />
            <span className={`min-w-0 flex-1 truncate text-left ${labelMotion}`}>Collapse menu</span>
          </button>
        </div>

        {/* ----------------------------------------------------------------- sections */}
        <nav className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2.5 pb-2">
          {sections.map((section) => (
            <div key={section.heading} className="mb-1.5">
              <p
                className={`h-8 overflow-hidden px-2.5 pt-3 pb-1 text-[0.6875rem] font-semibold
                  tracking-[0.09em] uppercase text-[var(--header-ink-muted)]
                  transition-[height,padding,opacity,transform] duration-[--duration-rail]
                  ease-[--ease-settle] ${
                    collapsed
                      ? 'lg:h-0 lg:-translate-x-2 lg:py-0 lg:opacity-0'
                      : 'lg:translate-x-0 lg:opacity-100'
                  }`}
              >
                {section.heading}
              </p>
              {/* Collapsed the heading is gone, so a hairline keeps the groups apart. It arrives as
                  the heading leaves, on the same clock. */}
              <span
                aria-hidden
                className={`mx-3 hidden h-px bg-[var(--header-edge)] transition-[opacity,margin]
                  duration-[--duration-rail] ease-[--ease-settle] lg:block ${
                    collapsed ? 'mb-1.5 opacity-100' : 'mb-0 opacity-0'
                  }`}
              />

              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.exact}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        `relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium
                         outline-none transition-[background-color,color,padding]
                         duration-[--duration-rail] ease-[--ease-settle] focus-visible:ring-2
                         focus-visible:ring-[var(--header-ring)] ${
                           collapsed ? RAIL_ICON_INSET : ''
                         } ${
                           isActive
                             ? 'bg-[var(--header-active)] text-[var(--header-ink)]'
                             : 'text-[var(--header-ink-muted)] hover:bg-[var(--header-hover)] hover:text-[var(--header-ink)]'
                         }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {/* Scales out from its centre, so moving between entries reads as one
                              marker travelling down the rail rather than two blinking. */}
                          <span
                            aria-hidden
                            className={`absolute top-1/2 left-0 h-5 w-[3px] origin-center -translate-y-1/2
                              rounded-r-full bg-[var(--header-marker)] transition-transform
                              duration-[--duration-base] ease-[--ease-settle] ${
                                isActive ? 'scale-y-100' : 'scale-y-0'
                              }`}
                          />
                          <Icon name={item.icon} />
                          <span className={`min-w-0 flex-1 truncate ${labelMotion}`}>
                            {item.label}
                          </span>
                          {item.badge === 'unread' && unreadCount > 0 && (
                            // Collapsed there is no room for a number beside a 20px icon, so it
                            // shrinks to a dot over the corner — still the same signal, still red.
                            <span
                              className={`animate-pop flex h-4.5 min-w-4.5 items-center justify-center
                                rounded-full bg-danger px-1 text-[10px] font-bold tabular-nums text-on-danger ${
                                  collapsed
                                    ? 'lg:absolute lg:top-1.5 lg:right-2.5 lg:h-2 lg:min-w-2 lg:px-0 lg:text-[0px]'
                                    : ''
                                }`}
                            >
                              {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/*
            The rail's advert, last of everything and inside the scrolling area — so however tall it
            is, it can never push a navigation entry off the screen.

            Hidden on a desktop once the rail folds: 4.75rem of icons has no room for one, and a
            banner squeezed into it would be unreadable as well as unwelcome. It stays in the phone
            drawer, which is full width whatever the desktop rail is doing.
          */}
          <AdSlot placement="SIDEBAR" className={`mt-4 ${collapsed ? 'lg:hidden' : ''}`} />
        </nav>

        {/*
          ------------------------------------------------------------------- account

          Phones only. On a desktop the account cluster — theme, notifications, profile, sign out —
          sits in the header's top-right corner where this kind of control is looked for; a drawer
          that has to be opened first is the wrong place for it. On a phone there is no room for a
          row of controls beside the search field, so they stay here, where the drawer is already
          full width and nothing has to shrink.
        */}
        <div className="shrink-0 border-t border-[var(--header-edge)] px-2.5 py-3 lg:hidden">
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-2 py-2 outline-none transition-colors
               duration-[--duration-base] focus-visible:ring-2 focus-visible:ring-[var(--header-ring)] ${
                 isActive ? 'bg-[var(--header-active)]' : 'hover:bg-[var(--header-hover)]'
               }`
            }
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full
                bg-[var(--header-active)] text-[var(--header-ink)]"
            >
              <Icon name="user" className="h-4.5 w-4.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-[var(--header-ink)]">
                {user?.fullName}
              </span>
              <span className="block truncate text-xs text-[var(--header-ink-muted)]">
                {isAdmin ? 'Administrator' : (user?.designation ?? 'Member')}
              </span>
            </span>
            {isAdmin && (
              <span
                className="rounded-full bg-[var(--header-active)] px-2 py-0.5 text-[10px]
                  font-semibold text-[var(--header-marker)]"
              >
                Admin
              </span>
            )}
          </NavLink>

          <div className="mt-2 flex items-center gap-1">
            {/* The quick two-way flip. The three-way choice, including following the operating
                system, is on My Profile. */}
            <ThemeToggle className="text-[var(--header-ink-muted)]! hover:bg-[var(--header-hover)]! hover:text-[var(--header-ink)]!" />

            <button
              type="button"
              onClick={handleSignOut}
              className="flex flex-1 items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold
                text-[var(--header-ink-muted)] outline-none transition-all duration-[--duration-quick]
                ease-[--ease-settle] hover:bg-[var(--header-hover)] hover:text-[var(--header-ink)]
                focus-visible:ring-2 focus-visible:ring-[var(--header-ring)] active:scale-[0.97]"
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.7}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5 shrink-0"
              >
                <path d="M15 17v1.5A1.5 1.5 0 0 1 13.5 20h-7A1.5 1.5 0 0 1 5 18.5v-13A1.5 1.5 0 0 1 6.5 4h7A1.5 1.5 0 0 1 15 5.5V7M10 12h10m0 0-3-3m3 3-3 3" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
