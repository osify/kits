/** All POS screens. `main` ones are on the phone bottom bar; the rest live under "More". */
export interface NavItem {
  to: string
  key: string
  icon: string
  main?: boolean
}

export const NAV: NavItem[] = [
  { to: '/', key: 'home', icon: 'pi pi-home', main: true },
  { to: '/sell', key: 'sell', icon: 'pi pi-shopping-cart', main: true },
  { to: '/quick', key: 'quick', icon: 'pi pi-bolt', main: true },
  { to: '/summary', key: 'summary', icon: 'pi pi-chart-bar', main: true },
  { to: '/customers', key: 'customers', icon: 'pi pi-users' },
  { to: '/stock', key: 'stock', icon: 'pi pi-warehouse' },
  { to: '/setup', key: 'setup', icon: 'pi pi-box' },
  { to: '/backup', key: 'backup', icon: 'pi pi-cloud-upload' },
]
