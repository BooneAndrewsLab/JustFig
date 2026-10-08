// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderCredits } from './creditsMarkdown';

describe('CREDITS.md rendering', () => {
  it('renders headings, lists, bold and https links', () => {
    const { container } = render(
      <div>
        {renderCredits(
          '# Icon credits\n\n## Bioicons\n\nHomepage: https://bioicons.com/\n\n### CC BY 3.0 (2)\n\n- **Servier** (2): Cell, Erythrocyte\\_5\n',
        )}
      </div>,
    );
    expect(container.querySelector('h2')?.textContent).toBe('Icon credits');
    expect(container.querySelector('h3')?.textContent).toBe('Bioicons');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://bioicons.com/');
    expect(container.querySelector('li strong')?.textContent).toBe('Servier');
    expect(container.querySelector('li')?.textContent).toBe('Servier (2): Cell, Erythrocyte_5');
  });

  it('never renders markup from the file', () => {
    const { container } = render(
      <div>{renderCredits('- <img src=x onerror=alert(1)> javascript:alert(1)\n')}</div>,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
