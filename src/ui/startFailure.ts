/** A minimal recovery page for a failed start (note 26): plain DOM, since React may be what failed. */
import { BRAND } from '@/brand';

export function showStartFailure(root: HTMLElement, error: unknown): void {
  console.error(error);
  const box = document.createElement('div');
  box.className = 'crash';
  box.setAttribute('role', 'alertdialog');
  box.setAttribute('aria-labelledby', 'crash-title');
  box.tabIndex = -1;
  const h = document.createElement('h1');
  h.id = 'crash-title';
  h.textContent = `${BRAND.name} could not start`;
  const p = document.createElement('p');
  p.textContent =
    'Figures kept in this browser are not deleted. Reload to try again; if it keeps happening, try another browser window.';
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'primary';
  b.textContent = 'Reload';
  b.addEventListener('click', () => {
    window.location.reload();
  });
  box.append(h, p, b);
  root.replaceChildren(box);
  box.focus();
}
