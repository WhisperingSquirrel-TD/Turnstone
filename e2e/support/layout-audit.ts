import type { Page } from '@playwright/test';

export type LayoutFinding = {
  screen: string;
  viewport: string;
  kind: string;
  selectors: string[];
};

/** No text contents, private values or request bodies enter the report. */
export async function inspectVisibleLayout(
  page: Page,
  screen: string,
): Promise<LayoutFinding[]> {
  return page.evaluate((name) => {
    const findings: LayoutFinding[] = [];
    const viewport = `${innerWidth}x${innerHeight}`;
    const selector = (element: Element): string => {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const testId = element.getAttribute('data-testid');
      if (testId) return `[data-testid="${CSS.escape(testId)}"]`;
      const parent = element.parentElement;
      return parent
        ? `${selector(parent)} > ${element.tagName.toLowerCase()}:nth-child(${Array.from(parent.children).indexOf(element) + 1})`
        : element.tagName.toLowerCase();
    };
    const visible = (element: Element) =>
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== 'hidden' &&
      getComputedStyle(element).display !== 'none' &&
      !element.closest('[hidden], [inert], [aria-hidden="true"]');
    const add = (kind: string, ...elements: Element[]) =>
      findings.push({
        screen: name,
        viewport,
        kind,
        selectors: elements.map(selector),
      });
    const dialogs = Array.from(
      document.querySelectorAll('dialog[open], [aria-modal="true"]'),
    ).filter(visible);
    const scope = dialogs.at(-1) ?? document.body;
    const boxes: { element: Element; rect: DOMRect }[] = [];
    const controls = Array.from(
      scope.querySelectorAll(
        'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="tab"], [role="button"]',
      ),
    ).filter(visible);
    for (const element of controls) {
      const rect = element.getBoundingClientRect();
      if (rect.width < 44 || rect.height < 44)
        add('tap-target-under-44', element);
      if (
        element.matches('.primary-action, .entry-primary-action') &&
        rect.height < 56
      )
        add('primary-under-56', element);
      if (
        element.matches(
          'button:disabled.primary-action, button:disabled.entry-primary-action',
        )
      ) {
        const hint = element.getAttribute('aria-describedby');
        const reason = hint ? document.getElementById(hint) : null;
        if (!reason || !visible(reason) || !reason.textContent?.trim())
          add('disabled-primary-without-reason', element);
      }
      boxes.push({ element, rect });
    }
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const element = node.parentElement;
      if (
        !element ||
        !node.textContent?.trim() ||
        !visible(element) ||
        element.closest(
          'script, style, .sr-only, .game-connection-label--visually-hidden',
        )
      )
        continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of Array.from(range.getClientRects())) {
        if (rect.width && rect.height) boxes.push({ element, rect });
      }
    }
    const inViewport = ({ rect }: { rect: DOMRect }) =>
      rect.bottom > 0 &&
      rect.top < innerHeight &&
      rect.right > 0 &&
      rect.left < innerWidth;
    const visibleBoxes = boxes.filter(inViewport);
    for (let index = 0; index < visibleBoxes.length; index++) {
      const first = visibleBoxes[index]!;
      if (
        first.rect.left < -0.5 ||
        first.rect.right > innerWidth + 0.5 ||
        first.rect.top < -0.5 ||
        first.rect.bottom > innerHeight + 0.5
      )
        add('viewport-clipping', first.element);
      for (const second of visibleBoxes.slice(index + 1)) {
        if (
          first.element.contains(second.element) ||
          second.element.contains(first.element)
        )
          continue;
        if (
          Math.min(first.rect.right, second.rect.right) -
            Math.max(first.rect.left, second.rect.left) >
            0.5 &&
          Math.min(first.rect.bottom, second.rect.bottom) -
            Math.max(first.rect.top, second.rect.top) >
            0.5
        )
          add('overlap', first.element, second.element);
      }
    }
    for (const image of Array.from(scope.querySelectorAll('img')).filter(
      visible,
    )) {
      if (
        !(image as HTMLImageElement).complete ||
        !(image as HTMLImageElement).naturalWidth
      )
        add('broken-image', image);
    }
    if (document.documentElement.scrollWidth > innerWidth)
      add('horizontal-scroll', document.documentElement);
    return findings;
  }, screen);
}
