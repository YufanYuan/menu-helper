import {
  Link,
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';

import { HomePage } from './routes/HomePage';
import { WorkPage } from './routes/WorkPage';

function RootLayout() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" to="/">
          Yufan
        </Link>
        <nav className="site-nav" aria-label="Primary">
          <Link activeProps={{ className: 'active' }} to="/">
            Home
          </Link>
          <Link activeProps={{ className: 'active' }} to="/work">
            Work
          </Link>
        </nav>
      </header>
      <Outlet />
    </div>
  );
}

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
});

const workRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'work',
  component: WorkPage,
});

const routeTree = rootRoute.addChildren([indexRoute, workRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
