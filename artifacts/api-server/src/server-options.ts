import type { Request } from 'express';
import type { AppOptions } from './app';

type ServerEnvironment = {
  NODE_ENV: 'development' | 'production' | 'test';
  APP_BASE_URL?: string;
  SESSION_SECRET: string;
  MAX_ACTIVE_GAMES?: number;
};

type ServerAppOptionsInput = {
  environment: ServerEnvironment;
  resolveViewer: NonNullable<AppOptions['resolveViewer']>;
  resolveCoordinatorViewer?: NonNullable<
    AppOptions['resolveCoordinatorViewer']
  >;
  publishGame: NonNullable<AppOptions['publishGame']>;
  countActiveGames: NonNullable<AppOptions['countActiveGames']>;
};

export function createServerAppOptions({
  environment,
  resolveViewer,
  resolveCoordinatorViewer,
  publishGame,
  countActiveGames,
}: ServerAppOptionsInput): AppOptions {
  const allowedOrigins = environment.APP_BASE_URL
    ? [new URL(environment.APP_BASE_URL).origin]
    : [];

  return {
    resolveViewer: (request: Request) => resolveViewer(request),
    ...(resolveCoordinatorViewer
      ? {
          resolveCoordinatorViewer: (request: Request) =>
            resolveCoordinatorViewer(request),
        }
      : {}),
    publishGame,
    allowedOrigins,
    maxActiveGames: environment.MAX_ACTIVE_GAMES,
    countActiveGames,
    secureCookies: environment.NODE_ENV === 'production',
    rateLimitSecret: environment.SESSION_SECRET,
    publicBaseUrl: environment.APP_BASE_URL,
  };
}
