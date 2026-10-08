// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderGuide } from './guideMarkdown';

const MD = `# Page

Some **bold** and *italic* text with \`code\`,
continued on a second line.

- one
- two [next page](02-drawing.md)

1. first
2. second

| Action | Key |
|---|---|
| Group | Ctrl+G |

> A note.

<script>alert(1)</script>
`;

describe('the guide renderer', () => {
  it('renders the subset as elements and never HTML', () => {
    const go = vi.fn();
    const { container } = render(<div>{renderGuide(MD, go)}</div>);
    expect(container.querySelector('h2')?.textContent).toBe('Page');
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelector('em')?.textContent).toBe('italic');
    expect(container.querySelector('code')?.textContent).toBe('code');
    expect(container.querySelector('p')?.textContent).toContain('continued on a second line');
    expect(container.querySelectorAll('ul li')).toHaveLength(2);
    expect(container.querySelectorAll('ol li')).toHaveLength(2);
    expect(container.querySelector('th')?.textContent).toBe('Action');
    expect(container.querySelector('td + td')?.textContent).toBe('Ctrl+G');
    expect(container.querySelector('.guide-note')?.textContent).toBe('A note.');
    expect(container.querySelector('script')).toBeNull();
    fireEvent.click(screen.getByText('next page'));
    expect(go).toHaveBeenCalledWith('02-drawing');
  });
});
