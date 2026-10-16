import type { Request } from 'express';
import type { PinPepperConfig } from '@workspace/security/seat-pin';
import type { AppOptions } from './app';

type ServerEnvironment = {
  NODE_ENV: 'development' | 'production' | 'test';
  APP_BASE_URL?: string;
  REPLIT_DEV_DOMAIN?: string;
  SESSION_SECRET: string;
  PIN_PEPPER: string;
  PIN_PEPPER_VERSION: number;
  PIN_PEPPER_PREVIOUS?: string;
  PIN_PEPPER_PREVIOUS_VERSION?: number;
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
  const publicBaseUrl =
    environment.APP_BASE_URL ??
    (environment.NODE_ENV === 'development' && environment.REPLIT_DEV_DOMAIN
      ? `https://${environment.REPLIT_DEV_DOMAIN}`
      : undefined);
  const allowedOrigins = publicBaseUrl ? [new URL(publicBaseUrl).origin] : [];

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
    pinPepperConfig: {
      current: {
        version: environment.PIN_PEPPER_VERSION,
        secret: environment.PIN_PEPPER,
      },
      ...(environment.PIN_PEPPER_PREVIOUS !== undefined &&
      environment.PIN_PEPPER_PREVIOUS_VERSION !== undefined
        ? {
            previous: {
              version: environment.PIN_PEPPER_PREVIOUS_VERSION,
              secret: environment.PIN_PEPPER_PREVIOUS,
            },
          }
        : {}),
    } satisfies PinPepperConfig,
    publicBaseUrl,
  };
}
