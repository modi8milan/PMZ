'use client';
import { Button, Feedback } from '../components/ui';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="route-state">
      <Feedback error>
        The foundation could not be loaded. Please try again.
      </Feedback>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
