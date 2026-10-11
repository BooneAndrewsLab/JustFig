/** A gallery entry drawn small (note 08), as a data URL of its first page; shared by the Templates dialog and the front page. */
import { exportSvg } from '@/export/svg';
import type { GalleryEntry } from '@/gallery/gallery';

export const svgUrl = (svg: string): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export function galleryThumbnail(e: GalleryEntry): string {
  const fig = e.build();
  const page = fig.doc.pages[0];
  if (!page) return '';
  return svgUrl(exportSvg(fig, page, { textMode: 'outline', footer: false, background: true }, ''));
}
