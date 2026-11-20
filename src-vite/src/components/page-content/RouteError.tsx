import { useRouteError } from 'react-router-dom';
import { Button } from '../ui/button';

export function RouteError() {
  const error = useRouteError();
  console.error('[route] render error', error);

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground max-w-md text-sm">
        Your photos and library are safe. Reload to try again.
      </p>
      <Button onClick={() => window.location.reload()}>Reload</Button>
    </div>
  );
}
