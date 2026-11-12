import { AppShell, CommandPalette } from './app-shell';
import { QuickCreateHost } from '@/features/forms';
import { ConfirmHost } from '@/components/ui/overlay';

/** Everything a signed-in user needs around the page itself. */
export function Shell() {
  return (
    <>
      <AppShell />
      <CommandPalette />
      <QuickCreateHost />
      <ConfirmHost />
    </>
  );
}
