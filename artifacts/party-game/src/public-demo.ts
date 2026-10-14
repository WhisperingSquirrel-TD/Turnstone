export function installPublicHoldDemo(root: ParentNode = document): void {
  const pad = root.querySelector<HTMLButtonElement>('[data-public-role-demo]');
  if (!pad) return;

  const label = pad.querySelector<HTMLElement>('.home-role-label');
  const prompt = pad.dataset.demoPrompt;
  const traitor = pad.dataset.traitorLabel;
  const faithful = pad.dataset.faithfulLabel;
  if (!label || !prompt || !traitor || !faithful) {
    throw new Error('Public role demo is missing its accessible labels.');
  }

  let held = false;
  let timer: number | undefined;

  const hide = () => {
    held = false;
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timer = undefined;
    }
    label.textContent = prompt;
  };

  const reveal = () => {
    if (held) return;
    held = true;
    timer = window.setTimeout(() => {
      if (!held) return;
      const sample = new Uint8Array(1);
      crypto.getRandomValues(sample);
      label.textContent = sample[0]! % 2 === 0 ? traitor : faithful;
    }, 500);
  };

  pad.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    reveal();
  });
  pad.addEventListener('pointerup', hide);
  pad.addEventListener('pointerleave', hide);
  pad.addEventListener('pointercancel', hide);
  pad.addEventListener('blur', hide);
  pad.addEventListener('contextmenu', (event) => event.preventDefault());
  pad.addEventListener('keydown', (event) => {
    if (!event.repeat && (event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault();
      reveal();
    }
  });
  pad.addEventListener('keyup', (event) => {
    if (event.key === ' ' || event.key === 'Enter') hide();
  });
  window.addEventListener('blur', hide);
  window.addEventListener('pagehide', hide);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') hide();
  });
}
