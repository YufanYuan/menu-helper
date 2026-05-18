import { Outlet, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';

import { HomePage } from './routes/HomePage';
import { WorkPage } from './routes/WorkPage';

function RootLayout() {
  return (
    <div className="app-shell">
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
