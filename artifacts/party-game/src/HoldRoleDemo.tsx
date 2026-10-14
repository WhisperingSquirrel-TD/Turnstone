import { useEffect, useRef, useState } from 'react';
import { en } from '@/locale/en-GB';
import './HoldRoleDemo.css';

export function HoldRoleDemo() {
  const [role, setRole] = useState<'Traitor' | 'Faithful' | null>(null);
  const held = useRef(false);
  const timer = useRef<number | null>(null);

  function clearReveal() {
    held.current = false;
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setRole(null);
  }

  function beginReveal() {
    if (held.current) return;
    held.current = true;
    timer.current = window.setTimeout(() => {
      if (!held.current) return;
      const sample = new Uint8Array(1);
      crypto.getRandomValues(sample);
      setRole(sample[0]! % 2 === 0 ? 'Traitor' : 'Faithful');
    }, 500);
  }

  useEffect(() => {
    const hideWhenUnavailable = () => {
      if (document.visibilityState !== 'visible') clearReveal();
    };
    window.addEventListener('blur', clearReveal);
    window.addEventListener('pagehide', clearReveal);
    document.addEventListener('visibilitychange', hideWhenUnavailable);
    return () => {
      window.removeEventListener('blur', clearReveal);
      window.removeEventListener('pagehide', clearReveal);
      document.removeEventListener('visibilitychange', hideWhenUnavailable);
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  return (
    <section className="home-role-demo" aria-labelledby="home-demo-heading">
      <h2 id="home-demo-heading">{en.publicSite.demoHeading}</h2>
      <p>{en.publicSite.demoDescription}</p>
      <button
        className="home-role-seal"
        type="button"
        aria-label={en.publicSite.demoHeading}
        onPointerDown={beginReveal}
        onPointerUp={clearReveal}
        onPointerLeave={clearReveal}
        onPointerCancel={clearReveal}
        onKeyDown={(event) => {
          if (
            !event.repeat &&
            (event.key === ' ' || event.key === 'Enter')
          ) {
            event.preventDefault();
            beginReveal();
          }
        }}
        onKeyUp={(event) => {
          if (event.key === ' ' || event.key === 'Enter') clearReveal();
        }}
        onBlur={clearReveal}
        onContextMenu={(event) => event.preventDefault()}
      >
        <span aria-hidden="true" className="home-role-seal-ring" />
        <span className="home-role-label" aria-live="polite" aria-atomic="true">
          {role ?? en.publicSite.demoPrompt}
        </span>
      </button>
      <a className="home-demo-link" href={`${import.meta.env.BASE_URL}play`}>
        {en.publicSite.demoLink}
      </a>
    </section>
  );
}
