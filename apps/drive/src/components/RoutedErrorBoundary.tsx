import { type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';

/**
 * ErrorBoundary that resets itself on route changes. A class component can't use
 * hooks, so this thin functional wrapper feeds the current pathname as the
 * boundary's `resetKey` — once the user navigates, the boundary clears its error
 * state instead of staying stuck on a dead screen (a real problem with the
 * single global Suspense + lazy routes here).
 */
export function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
}

export default RoutedErrorBoundary;
