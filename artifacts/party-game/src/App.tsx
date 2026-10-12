import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom';
import { config } from '@/config';
import { en } from '@/locale/en-GB';

const queryClient = new QueryClient();

const btn =
  'btn inline-block rounded-md border-2 border-charcoal bg-amberlight px-6 py-3 font-bold text-charcoal hover:underline';

function Shell({
  dark,
  children,
}: {
  dark?: boolean;
  children: React.ReactNode;
}) {
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `px-1 py-2 font-bold underline-offset-8 ${isActive ? 'underline decoration-amber decoration-4' : 'no-underline hover:underline'}`;
  return (
    <div
      className={`flex min-h-[100dvh] flex-col ${dark ? 'on-dark bg-charcoal text-lightbg' : 'bg-lightbg text-slate'}`}
    >
      <a
        href="#main"
        className="absolute left-2 top-2 z-10 -translate-y-20 rounded bg-white px-3 py-2 font-bold text-charcoal focus:translate-y-0"
      >
        {en.skip}
      </a>
      <header className={`border-b-4 border-amber ${dark ? '' : 'bg-white'}`}>
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-3">
          <Link
            to={config.routes.home}
            className={`text-xl font-bold no-underline ${dark ? 'text-lightbg' : 'text-charcoal'}`}
          >
            {config.appName}
          </Link>
          <nav
            aria-label={en.nav.label}
            className={`flex gap-5 ${dark ? 'text-lightbg' : 'text-charcoal'}`}
          >
            <NavLink to={config.routes.home} end className={navClass}>
              {en.nav.home}
            </NavLink>
            <NavLink to={config.routes.play} className={navClass}>
              {en.nav.play}
            </NavLink>
          </nav>
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:py-20"
      >
        {children}
      </main>
      <footer
        className={`border-t px-4 py-6 text-center text-sm ${dark ? 'border-slate text-line' : 'border-line bg-white text-slate'}`}
      >
        <small>{en.footer}</small>
      </footer>
    </div>
  );
}

function Home() {
  return (
    <Shell>
      <p className="mb-4 inline-block rounded bg-amberlight px-3 py-1 text-sm font-bold text-charcoal">
        {en.home.eyebrow}
      </p>
      <h1 className="max-w-2xl break-words text-4xl font-bold leading-tight text-charcoal sm:text-5xl">
        {en.home.heading}
      </h1>
      <p className="mt-6 max-w-xl text-lg leading-relaxed">{en.home.body}</p>
      <p className="mt-4 max-w-xl border-l-4 border-amber pl-4 leading-relaxed">
        {en.home.status}
      </p>
      <p className="mt-8">
        <Link to={config.routes.play} className={btn}>
          {en.home.cta}
        </Link>
      </p>
    </Shell>
  );
}

function Play() {
  return (
    <Shell dark>
      <h1 className="max-w-2xl break-words border-l-4 border-amber pl-4 text-4xl font-bold leading-tight">
        {en.play.heading}
      </h1>
      <p className="mt-6 max-w-xl text-lg leading-relaxed text-lightbg">
        {en.play.body}
      </p>
      <p className="mt-8">
        <Link to={config.routes.home} className={btn}>
          {en.play.back}
        </Link>
      </p>
    </Shell>
  );
}

function NotFound() {
  return (
    <Shell>
      <h1 className="text-4xl font-bold text-charcoal">
        {en.notFound.heading}
      </h1>
      <p className="mt-6 max-w-xl text-lg leading-relaxed">
        {en.notFound.body}
      </p>
      <p className="mt-8">
        <Link to={config.routes.home} className={btn}>
          {en.notFound.back}
        </Link>
      </p>
    </Shell>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path={config.routes.home} element={<Home />} />
      <Route path={config.routes.play} element={<Play />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
