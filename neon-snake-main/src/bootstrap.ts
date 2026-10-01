import { FamobiPlatform } from './platform/FamobiPlatform';
import type { FamobiSdk } from './platform/FamobiSdk';

const shell = document.querySelector<HTMLElement>('.game-shell')!;
shell.inert = true;

async function boot(): Promise<void> {
  const sdk: FamobiSdk | undefined = window.GameInterface;
  if (!sdk) throw new Error('Famobi SDK could not be loaded.');

  await FamobiPlatform.initialize(sdk, () => import('./main'));
}

void boot().catch((error: unknown) => {
  console.error('Unable to initialize Neon Snake', error);
  document.querySelector('#overlay-title')!.textContent = 'Unable to load the game';
  document.querySelector('#overlay-copy')!.textContent = 'Check your connection and reload to try again.';
  document.querySelector('#primary-action')!.textContent = 'Reload';
  document.querySelector('#primary-action')!.addEventListener('click', () => location.reload());
  shell.inert = false;
});
