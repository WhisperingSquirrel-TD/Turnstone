import type { Page } from '@playwright/test';

export type LayoutFinding = {
  screen: string;
  viewport: string;
  kind: string;
  selectors: string[];
  boxes?: { x: number; y: number; width: number; height: number }[];
};

/** Run after the state screenshot: focusing a held private control can hide it. */
export async function auditFocusAndBorders(
  page: Page,
  screen: string,
): Promise<LayoutFinding[]> {
  await page.keyboard.press('Tab');
  return page.evaluate((name) => {
    const findings: LayoutFinding[] = [];
    const selector = (el: Element) =>
      el.id
        ? `#${CSS.escape(el.id)}`
        : el.getAttribute('data-testid')
          ? `[data-testid="${CSS.escape(el.getAttribute('data-testid')!)}"]`
          : `${el.tagName.toLowerCase()}[data-layout-audit-node="${el.getAttribute('data-layout-audit-node')}"]`;
    const add = (kind: string, el: Element, ancestor?: Element) =>
      findings.push({
        screen: name,
        viewport: `${innerWidth}x${innerHeight}`,
        kind,
        selectors: [el, ...(ancestor ? [ancestor] : [])].map(selector),
        boxes: [el, ...(ancestor ? [ancestor] : [])].map((node) => {
          const { x, y, width, height } = node.getBoundingClientRect();
          return { x, y, width, height };
        }),
      });
    const visible = (el: Element) =>
      el.isConnected &&
      el.getClientRects().length > 0 &&
      el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) !==
        false &&
      !el.closest(
        '[hidden], [inert], [aria-hidden="true"], .sr-only, .game-connection-label--visually-hidden',
      );
    const focusable =
      'button:not(:disabled), a[href], input:not(:disabled):not([type=hidden]), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]';
    const targets = Array.from(
      document.querySelectorAll<HTMLElement>('*'),
    ).filter((el) => {
      if (!visible(el)) return false;
      const css = getComputedStyle(el);
      return (
        el.matches(focusable) ||
        parseFloat(css.borderLeftWidth) > 0 ||
        parseFloat(css.borderRightWidth) > 0
      );
    });
    const initialFocus = document.activeElement;
    for (const bar of Array.from(
      document.querySelectorAll('.game-status-bar'),
    )) {
      const chip = bar.querySelector('[data-testid="game-status-phase"]');
      const label = chip?.querySelector('.game-status-phase-label');
      const menu = bar.querySelector('.game-status-menu > summary');
      if (chip && label) {
        const range = document.createRange();
        range.selectNodeContents(label);
        if (
          chip.getBoundingClientRect().width >
          range.getBoundingClientRect().width + 24
        )
          add('phase-chip-stretched', chip);
      }
      if (menu && menu.getBoundingClientRect().right > innerWidth - 15.5)
        add('menu-missing-edge-clearance', menu, bar);
    }
    for (const el of targets) {
      if (!visible(el)) continue;
      el.scrollIntoView({
        block: 'center',
        inline: 'nearest',
        behavior: 'instant',
      });
      const before = getComputedStyle(el).boxShadow;
      if (el.matches(focusable)) el.focus({ preventScroll: true });
      if (!visible(el)) continue;
      const css = getComputedStyle(el),
        r = el.getBoundingClientRect();
      let outset =
        document.activeElement === el && css.outlineStyle !== 'none'
          ? Math.max(
              0,
              parseFloat(css.outlineWidth) + parseFloat(css.outlineOffset),
            )
          : 0;
      if (document.activeElement === el && css.boxShadow !== before) {
        for (const shadow of css.boxShadow.split(/,(?![^(]*\))/)) {
          if (shadow.includes('inset')) continue;
          const lengths =
            shadow
              .replace(/rgba?\([^)]*\)/g, '')
              .match(/-?[\d.]+px/g)
              ?.map(parseFloat) ?? [];
          if (lengths.length >= 3)
            outset = Math.max(
              outset,
              Math.max(Math.abs(lengths[0]!), Math.abs(lengths[1]!)) +
                Math.max(0, (lengths[2] ?? 0) * 1.5 + (lengths[3] ?? 0)),
            );
        }
      }
      const box = {
        left: r.left - outset,
        right: r.right + outset,
        top: r.top - outset,
        bottom: r.bottom + outset,
      };
      if (
        outset &&
        (box.left < -0.5 ||
          box.right > innerWidth + 0.5 ||
          box.top < -0.5 ||
          box.bottom > innerHeight + 0.5)
      )
        add('focus-ring-clipped', el);
      for (
        let ancestor = el.parentElement;
        ancestor;
        ancestor = ancestor.parentElement
      ) {
        if (css.position === 'fixed' || el.matches('dialog:modal')) break;
        const style = getComputedStyle(ancestor),
          bounds = ancestor.getBoundingClientRect();
        const left = bounds.left + ancestor.clientLeft,
          right = left + ancestor.clientWidth;
        const top = bounds.top + ancestor.clientTop,
          bottom = top + ancestor.clientHeight;
        if (
          ['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX) &&
          (box.left < left - 0.5 || box.right > right + 0.5)
        )
          add(
            outset ? 'focus-ring-clipped' : 'border-under-scrollbar-or-clipped',
            el,
            ancestor,
          );
        if (
          outset &&
          ['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowY) &&
          (box.top < top - 0.5 || box.bottom > bottom + 0.5)
        )
          add('focus-ring-clipped', el, ancestor);
        if (ancestor.matches('dialog:modal') || style.position === 'fixed')
          break;
      }
    }
    if (initialFocus instanceof HTMLElement && visible(initialFocus))
      initialFocus.focus({ preventScroll: true });
    document
      .querySelectorAll('main')
      .forEach((el) => el.scrollTo({ top: 0, behavior: 'instant' }));
    return findings;
  }, screen);
}

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
      const auditId = element.getAttribute('data-layout-audit-node');
      if (auditId)
        return `${element.tagName.toLowerCase()}[data-layout-audit-node="${auditId}"]`;
      const parent = element.parentElement;
      return parent
        ? `${selector(parent)} > ${element.tagName.toLowerCase()}:nth-child(${Array.from(parent.children).indexOf(element) + 1})`
        : element.tagName.toLowerCase();
    };
    const visible = (element: Element) =>
      element.getClientRects().length > 0 &&
      !(
        element.matches('[role="status"]') &&
        getComputedStyle(element).clip.replace(/[\s,]/g, '') ===
          'rect(0px0px0px0px)'
      ) &&
      element.checkVisibility?.({
        checkOpacity: true,
        checkVisibilityCSS: true,
      }) !== false &&
      !element.matches('a[href="#main"]:not(:focus)') &&
      !Array.from(document.querySelectorAll('details:not([open])')).some(
        (details) =>
          details !== element &&
          details.contains(element) &&
          !details.querySelector(':scope > summary')?.contains(element),
      ) &&
      getComputedStyle(element).visibility !== 'hidden' &&
      getComputedStyle(element).display !== 'none' &&
      !element.closest('[hidden], [inert], [aria-hidden="true"]');
    const add = (kind: string, ...elements: Element[]) =>
      findings.push({
        screen: name,
        viewport,
        kind,
        selectors: elements.map(selector),
        boxes: elements.map((el) => {
          const { x, y, width, height } = el.getBoundingClientRect();
          return { x, y, width, height };
        }),
      });
    const dialogs = Array.from(
      document.querySelectorAll('dialog[open], [aria-modal="true"]'),
    ).filter(visible);
    const menus = Array.from(
      document.querySelectorAll(
        'details[open].game-status-menu,details[open].public-home-menu',
      ),
    ).filter(visible);
    const scope = dialogs.at(-1) ?? menus.at(-1) ?? document.body;
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
    // Scroll-edge clipping is painted by the browser, not an overlap with bars
    // outside the scrollport. The full audit still scrolls and hit-tests each target.
    const paintedRect = (element: Element, rect: DOMRect) => {
      const box = {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      };
      for (
        let node: Element | null = element;
        node;
        node = node.parentElement
      ) {
        const style = getComputedStyle(node);
        if (node.matches('dialog:modal') || style.position === 'fixed') break;
        if (node === element) continue;
        const bounds = node.getBoundingClientRect();
        if (['auto', 'scroll'].includes(style.overflowY)) {
          box.top = Math.max(box.top, bounds.top);
          box.bottom = Math.min(box.bottom, bounds.bottom);
        }
      }
      return box;
    };
    const inViewport = ({
      rect,
    }: {
      rect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>;
    }) =>
      rect.bottom > 0 &&
      rect.top < innerHeight &&
      rect.right > 0 &&
      rect.left < innerWidth &&
      rect.bottom > rect.top;
    const visibleBoxes = boxes
      .map(({ element, rect }) => ({
        element,
        rect: paintedRect(element, rect),
      }))
      .filter(inViewport);
    for (let index = 0; index < visibleBoxes.length; index++) {
      const first = visibleBoxes[index]!;
      if (first.rect.left < -0.5 || first.rect.right > innerWidth + 0.5)
        add('horizontal-clipping', first.element);
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

/** Audit all painted content, not only the first viewport. No clicks or values are recorded. */
export async function auditApplicationLayout(
  page: Page,
  screen: string,
): Promise<LayoutFinding[]> {
  await page.evaluate(() => document.fonts.ready);
  const reached = await page.evaluate((name) => {
    const findings: LayoutFinding[] = [];
    const viewport = `${innerWidth}x${innerHeight}`;
    const selector = (el: Element) =>
      el.id
        ? `#${CSS.escape(el.id)}`
        : el.getAttribute('data-testid')
          ? `[data-testid="${CSS.escape(el.getAttribute('data-testid')!)}"]`
          : `${el.tagName.toLowerCase()}[data-layout-audit-node="${el.getAttribute('data-layout-audit-node')}"]`;
    const add = (kind: string, ...els: Element[]) =>
      findings.push({
        screen: name,
        viewport,
        kind,
        selectors: els.map(selector),
        boxes: els.map((el) => {
          const { x, y, width, height } = el.getBoundingClientRect();
          return { x, y, width, height };
        }),
      });
    const visible = (el: Element) =>
      el.getClientRects().length > 0 &&
      !(
        el.matches('[role="status"]') &&
        getComputedStyle(el).clip.replace(/[\s,]/g, '') === 'rect(0px0px0px0px)'
      ) &&
      el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) !==
        false &&
      !el.matches('a[href="#main"]:not(:focus)') &&
      !Array.from(document.querySelectorAll('details:not([open])')).some(
        (details) =>
          details !== el &&
          details.contains(el) &&
          !details.querySelector(':scope > summary')?.contains(el),
      ) &&
      getComputedStyle(el).visibility !== 'hidden' &&
      getComputedStyle(el).display !== 'none' &&
      !el.closest(
        '[hidden], [inert], [aria-hidden="true"], .sr-only, .game-connection-label--visually-hidden',
      );
    const dialogs = Array.from(
      document.querySelectorAll('dialog[open], [aria-modal="true"]'),
    ).filter(visible);
    const menus = Array.from(
      document.querySelectorAll(
        'details[open].game-status-menu, details[open].public-home-menu',
      ),
    ).filter(visible);
    const scope = dialogs.at(-1) ?? menus.at(-1) ?? document.body;
    const controls =
      'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=tab], [role=button]';
    const targets = new Set<Element>(
      Array.from(scope.querySelectorAll(`${controls}, img, [role=img]`)).filter(
        visible,
      ),
    );
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const parent = walker.currentNode.parentElement;
      if (
        !parent ||
        !walker.currentNode.textContent?.trim() ||
        !visible(parent) ||
        parent.closest('script,style')
      )
        continue;
      targets.add(parent.closest('p,h1,h2,h3,h4,li,label,legend') ?? parent);
    }
    Array.from(document.querySelectorAll('*')).forEach((el, index) =>
      el.setAttribute('data-layout-audit-node', String(index)),
    );
    const bars = Array.from(scope.querySelectorAll('*')).filter(
      (el) =>
        visible(el) &&
        ['fixed', 'sticky'].includes(getComputedStyle(el).position),
    );
    const intersects = (
      a: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
      b: DOMRect,
    ) =>
      Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 &&
      Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
    const independent = (a: Element, b: Element) =>
      !a.contains(b) && !b.contains(a);
    const barPairs = () => {
      for (let i = 0; i < bars.length; i++)
        for (const b of bars.slice(i + 1)) {
          const a = bars[i]!;
          if (
            independent(a, b) &&
            intersects(a.getBoundingClientRect(), b.getBoundingClientRect())
          )
            add('fixed-bars-overlap', a, b);
        }
    };
    const scrollers = [
      ...new Set([
        document.scrollingElement!,
        ...Array.from(scope.querySelectorAll('*')).filter(
          (el) =>
            visible(el) &&
            ['auto', 'scroll'].includes(getComputedStyle(el).overflowY),
        ),
      ]),
    ];
    const scrollAll = (edge: 'top' | 'bottom') => {
      for (const el of scrollers)
        el.scrollTo({
          top: edge === 'top' ? 0 : el.scrollHeight,
          behavior: 'instant',
        });
    };
    const paintedRect = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const box = {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      };
      for (
        let node: Element | null = element;
        node;
        node = node.parentElement
      ) {
        const style = getComputedStyle(node);
        if (node.matches('dialog:modal') || style.position === 'fixed') break;
        if (node === element) continue;
        if (['auto', 'scroll'].includes(style.overflowY)) {
          const bounds = node.getBoundingClientRect();
          box.top = Math.max(box.top, bounds.top);
          box.bottom = Math.min(box.bottom, bounds.bottom);
        }
      }
      return box;
    };
    const atRest = (edge: 'top' | 'bottom') => {
      scrollAll(edge);
      barPairs();
      for (const el of targets) {
        if (!visible(el)) continue;
        const r = paintedRect(el);
        if (r.bottom <= 0 || r.top >= innerHeight || r.bottom <= r.top)
          continue;
        for (const bar of bars)
          if (
            independent(el, bar) &&
            intersects(r, bar.getBoundingClientRect())
          )
            add(`fixed-bar-overlap-at-${edge}`, el, bar);
      }
    };
    // Exercise the stack throughout the document, including sticky transition boundaries.
    const scrollStops = new Set([0, document.documentElement.scrollHeight]);
    for (let y = 0; y < document.documentElement.scrollHeight; y += 32)
      scrollStops.add(y);
    for (const bar of bars) {
      const rect = bar.getBoundingClientRect(),
        top = Number.parseFloat(getComputedStyle(bar).top) || 0;
      for (const boundary of [
        rect.top + scrollY - top,
        (bar.parentElement?.getBoundingClientRect().bottom ?? rect.bottom) +
          scrollY -
          rect.height -
          top,
      ])
        for (const delta of [-1, 0, 1])
          scrollStops.add(Math.max(0, boundary + delta));
    }
    for (const scroller of scrollers) {
      for (let y = 0; y <= scroller.scrollHeight; y += 32) {
        scroller.scrollTo({ top: y, behavior: 'instant' });
        barPairs();
      }
      for (const top of scrollStops) {
        scroller.scrollTo({ top, behavior: 'instant' });
        barPairs();
      }
    }
    atRest('top');
    atRest('bottom');
    for (const el of targets) {
      if (!visible(el)) continue;
      el.scrollIntoView({
        block: 'center',
        inline: 'nearest',
        behavior: 'instant',
      });
      barPairs();
      const r = el.getBoundingClientRect();
      if (r.left < -0.5 || r.right > innerWidth + 0.5)
        add('horizontal-clipping', el);
      if (r.top < -0.5 || r.bottom > innerHeight + 0.5)
        add('not-fully-reachable', el);
      for (const bar of bars)
        if (independent(el, bar) && intersects(r, bar.getBoundingClientRect()))
          add('covered-after-scroll', el, bar);
      const hit = document.elementFromPoint(
        r.x + r.width / 2,
        r.y + r.height / 2,
      );
      if (!hit || !(hit === el || el.contains(hit)))
        add('centre-not-hittable', el, ...(hit ? [hit] : []));
      const css = getComputedStyle(el);
      if (
        css.textOverflow === 'ellipsis' &&
        el.scrollWidth > el.clientWidth + 0.5
      )
        add('meaning-hidden-by-ellipsis', el);
      for (
        let ancestor = el.parentElement;
        ancestor;
        ancestor = ancestor.parentElement
      ) {
        if (getComputedStyle(el).position === 'fixed') break;
        const style = getComputedStyle(ancestor),
          box = ancestor.getBoundingClientRect();
        if (
          (['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX) &&
            (r.left < box.left - 0.5 || r.right > box.right + 0.5)) ||
          (['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowY) &&
            (r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5))
        )
          add('ancestor-clipping', el, ancestor);
        // A native top-layer modal escapes clipping by its document ancestors.
        if (ancestor.matches('dialog:modal') || style.position === 'fixed')
          break;
      }
      if (el.matches(controls) && (r.width < 43.5 || r.height < 43.5))
        add('tap-target-under-44', el);
      if (
        el.matches('.primary-action,.entry-primary-action') &&
        r.height < 55.5
      )
        add('primary-under-56', el);
      if (
        el.matches(
          'button:disabled.primary-action,button:disabled.entry-primary-action',
        )
      ) {
        const reasons = (el.getAttribute('aria-describedby') ?? '')
          .split(/\s+/)
          .map((id) => document.getElementById(id));
        if (
          !reasons.some(
            (reason) => reason && visible(reason) && reason.textContent?.trim(),
          )
        )
          add('disabled-primary-without-reason', el);
      }
      if (el instanceof HTMLImageElement && (!el.complete || !el.naturalWidth))
        add('broken-image', el);
    }
    if (document.documentElement.scrollWidth > innerWidth + 0.5)
      add('horizontal-scroll', document.documentElement);
    for (const el of scrollers)
      if (el.scrollWidth > el.clientWidth + 0.5) add('horizontal-scroll', el);
    scrollAll('bottom');
    const lastControl = [...targets]
      .filter(
        (el) =>
          el.matches(controls) &&
          visible(el) &&
          !bars.some((bar) => bar === el || bar.contains(el)),
      )
      .at(-1);
    if (lastControl) {
      const bottomBars = bars
        .map((bar) => bar.getBoundingClientRect())
        .filter((r) => r.top > innerHeight / 2 && r.top < innerHeight);
      const limit = Math.min(innerHeight, ...bottomBars.map((r) => r.top));
      if (lastControl.getBoundingClientRect().bottom > limit - 15.5)
        add(
          'last-control-without-clear-space',
          lastControl,
          ...(lastControl.closest('main')
            ? [lastControl.closest('main')!]
            : []),
          ...bars,
        );
    }
    scrollAll('top');
    return findings;
  }, screen);
  const overlaps = await inspectVisibleLayout(page, screen);
  const unique = new Map(
    [...reached, ...overlaps].map((finding) => [
      JSON.stringify(finding),
      finding,
    ]),
  );
  return [...unique.values()];
}
