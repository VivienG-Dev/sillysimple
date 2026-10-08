// Where the site leads to: the links of the bar at the top, and those of the foot.

export interface SiteLink {
  label: string
  to: string
}

/** The bar at the top. On a phone they are behind the menu button. */
export const NAV_LINKS: SiteLink[] = [
  { label: 'Stories', to: '/#stories' },
  { label: 'Guides', to: '/guides/' },
  { label: 'Help', to: '/help/' },
]

/** The foot of every page: the same, and what the bar has no room for. */
export const FOOT_LINKS: SiteLink[] = [
  ...NAV_LINKS,
  { label: 'First launch', to: '/#first-launch' },
  { label: 'Privacy', to: '/#privacy' },
  { label: 'Download', to: '/#download' },
]
