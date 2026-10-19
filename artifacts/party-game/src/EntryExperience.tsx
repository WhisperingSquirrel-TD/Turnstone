import {
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ClipboardEvent,
  type ReactNode,
} from 'react';
import { recommended } from '@workspace/shared';
import { BrandFooter } from './BrandFooter';
import { EntryActionError } from './entry-action-error';
import './EntryExperience.css';

export type EntryScreen =
  | 'welcome'
  | 'join-code'
  | 'join-name'
  | 'join-pin'
  | 'join-wait'
  | 'create-name'
  | 'create-count'
  | 'create-organiser'
  | 'lobby'
  | 'rehearsal-setup';

export type EntryInputKey =
  | 'joinCodeEntry'
  | 'joinName'
  | 'joinPin'
  | 'createGameName'
  | 'createPlayerCount'
  | 'organiserName'
  | 'organiserPin'
  | 'rehearsalPlayerCount'
  | 'rehearsalSpeed'
  | 'rehearsalName';

export interface EntryExperienceInputs {
  joinCodeEntry: string;
  joinName: string;
  joinPin: string;
  createGameName: string;
  createPlayerCount: number;
  organiserName: string;
  organiserPin: string;
  rehearsalPlayerCount: number;
  rehearsalSpeed: 'fast' | 'normal';
  rehearsalName: string;
}

export interface EntryJoiner {
  id: string;
  name: string;
}

export interface EntryPlayer {
  id: string;
  name: string;
}

export interface EntryExperienceOptions {
  tapToReveal: boolean;
  largeText: boolean;
  simpleLanguage: boolean;
}

export interface EntryExperienceBusy {
  join: boolean;
  create: boolean;
  approveJoinerIds: string[];
  startGame: boolean;
  rehearsal: boolean;
  share: boolean;
}

export interface EntryExperienceErrors {
  join?: string;
  create?: string;
  approve?: string;
  startGame?: string;
  rehearsal?: string;
}

export interface EntryExperienceCopy {
  brand: string;
  brandGoldSuffix: string;
  brandDescriptor: string;
  headlineFirst: string;
  headlineSecond: string;
  subtitle: string;
  welcomeDescription: string;
  createGame: string;
  joinGame: string;
  practiseAlone: string;
  joinProgress: string;
  joinProgressStep: (step: number) => string;
  codeHeading: string;
  codeHelp: string;
  codeLabel: (digit: number) => string;
  continue: string;
  back: string;
  nameHeading: string;
  firstNameLabel: string;
  firstNamePlaceholder: string;
  duplicateNamePrompt: (name: string) => string;
  duplicateNameYes: string;
  duplicateNameNo: string;
  differentNameError: (name: string) => string;
  reservedPracticeName: string;
  optionsHeading: string;
  tapToReveal: string;
  largeText: string;
  simpleLanguage: string;
  pinHeading: string;
  pinLabel: string;
  pinHint: string;
  joinButton: string;
  joinPending: string;
  waitingHeading: (organiser: string) => string;
  waitingBody: string;
  joinRetry: string;
  statusError: string;
  joinRejected: string;
  busy: string;
  qrPreparing: string;
  defaultOrganiser: string;
  lobbyPlayerCount: (joined: number, total: number) => string;
  minimumPlayers: (count: number) => string;
  createNameHeading: string;
  gameNameLabel: string;
  gameNamePlaceholder: string;
  createCountHeading: string;
  playerCountLabel: string;
  decreasePlayers: string;
  increasePlayers: string;
  recommendedTraitors: (count: number) => string;
  createOrganiserHeading: string;
  organiserNameLabel: string;
  organiserPinLabel: string;
  createButton: string;
  createPending: string;
  lobbyHeading: string;
  lateInviteHeading: string;
  lateInviteBody: string;
  createLateInvite: string;
  createLateInvitePending: string;
  backToGame: string;
  latePlayerCount: (count: number) => string;
  qrAlt: string;
  codeCaption: string;
  share: string;
  sharePending: string;
  shareUnavailable: string;
  rosterHeading: string;
  pendingHeading: string;
  noPendingJoiners: string;
  approve: string;
  approvePending: string;
  startGame: string;
  startGamePending: string;
  rehearsalHeading: string;
  rehearsalDescription: string;
  rehearsalPlayersLabel: string;
  rehearsalRange: string;
  rehearsalSpeedLabel: string;
  fast: string;
  normal: string;
  rehearsalNameLabel: string;
  rehearsalButton: string;
  rehearsalPending: string;
  errorFallback: string;
  codeError: string;
  nameError: string;
  pinError: string;
}

export interface EntryExperienceProps {
  copy: EntryExperienceCopy;
  screen?: EntryScreen;
  inviteMode?: boolean;
  lateJoinMode?: boolean;
  coordinatorPanel?: ReactNode;
  inputs: EntryExperienceInputs;
  onInputChange: (field: EntryInputKey, value: string | number) => void;
  options: EntryExperienceOptions;
  onOptionChange: (field: keyof EntryExperienceOptions, value: boolean) => void;
  busy: EntryExperienceBusy;
  errors?: EntryExperienceErrors;
  organiserDisplayName: string;
  defaultGameName: string;
  joinCode: string;
  shareUrl: string;
  qrCode: ReactNode;
  players: EntryPlayer[];
  requiredPlayerCount?: number;
  pendingJoiners: EntryJoiner[];
  onJoin: (data: {
    shortCode: string;
    name: string;
    pin: string;
  }) => void | Promise<void>;
  onCheckJoinName: (data: {
    shortCode: string;
    name: string;
  }) => Promise<'available' | 'duplicate' | 'reserved'>;
  onRecover: (data: {
    shortCode: string;
    name: string;
    pin: string;
  }) => void | Promise<void>;
  onCheckJoinStatus: () => void | Promise<void>;
  onCreate: (data: {
    gameName: string;
    playerCount: number;
    organiserName: string;
    organiserPin: string;
  }) => void | Promise<void>;
  onApproveJoiner: (joinerId: string) => void | Promise<void>;
  onStartGame: () => void | Promise<void>;
  onCreateLateInvite?: () => void | Promise<void>;
  onRehearsal: (data: {
    playerCount: number;
    speed: 'fast' | 'normal';
    name: string;
  }) => void | Promise<void>;
  onShare: (shareUrl: string) => void | Promise<void>;
  onClearSensitiveValues: () => void;
  onScreenChange?: (screen: EntryScreen) => void;
}

const VALID_CODE = /^[A-HJ-NP-Z2-9]{6}$/;

export function EntryExperience({
  copy,
  screen: controlledScreen,
  inviteMode = false,
  lateJoinMode = false,
  coordinatorPanel,
  inputs,
  onInputChange,
  options,
  onOptionChange,
  busy,
  errors = {},
  organiserDisplayName,
  defaultGameName,
  joinCode,
  shareUrl,
  qrCode,
  players,
  requiredPlayerCount = 5,
  pendingJoiners,
  onJoin,
  onCheckJoinName,
  onRecover,
  onCheckJoinStatus,
  onCreate,
  onApproveJoiner,
  onStartGame,
  onCreateLateInvite,
  onRehearsal,
  onShare,
  onClearSensitiveValues,
  onScreenChange,
}: EntryExperienceProps) {
  const [internalScreen, setInternalScreen] = useState<EntryScreen>('welcome');
  const [localError, setLocalError] = useState('');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [duplicateName, setDuplicateName] = useState<string | null>(null);
  const [recoveringSeat, setRecoveringSeat] = useState(false);
  const codeRefs = useRef<Array<HTMLInputElement | null>>([]);
  const screen = controlledScreen ?? internalScreen;

  function moveTo(next: EntryScreen) {
    setInternalScreen(next);
    onScreenChange?.(next);
    setLocalError('');
  }

  function clearJoinSecrets() {
    onInputChange('joinCodeEntry', '');
    onInputChange('joinPin', '');
  }

  function abandonJoin() {
    clearJoinSecrets();
    onClearSensitiveValues();
    setDuplicateName(null);
    setRecoveringSeat(false);
    moveTo('welcome');
  }

  function beginJoin() {
    setLocalError('');
    setDuplicateName(null);
    setRecoveringSeat(false);
    moveTo(
      VALID_CODE.test(inputs.joinCodeEntry.trim().toUpperCase())
        ? 'join-name'
        : 'join-code',
    );
  }

  function updateCode(value: string) {
    const clean = value
      .toUpperCase()
      .replace(/[^A-HJ-NP-Z2-9]/g, '')
      .slice(0, 6);
    onInputChange('joinCodeEntry', clean);
  }

  function onCodeChange(index: number, event: ChangeEvent<HTMLInputElement>) {
    const character = event.target.value
      .toUpperCase()
      .replace(/[^A-HJ-NP-Z2-9]/g, '')
      .slice(-1);
    const current = inputs.joinCodeEntry.toUpperCase().slice(0, 6).split('');
    if (character) current[index] = character;
    else current.splice(index, 1);
    updateCode(current.join(''));
    if (character && index < 5) codeRefs.current[index + 1]?.focus();
  }

  function onCodePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    updateCode(event.clipboardData.getData('text'));
    const nextIndex = Math.min(
      event.clipboardData.getData('text').replace(/[^A-HJ-NP-Z2-9]/gi, '')
        .length,
      5,
    );
    codeRefs.current[nextIndex]?.focus();
  }

  function onCodeKeyDown(
    index: number,
    event: KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === 'Backspace' && !event.currentTarget.value && index > 0) {
      codeRefs.current[index - 1]?.focus();
    } else if (event.key === 'ArrowLeft' && index > 0) {
      codeRefs.current[index - 1]?.focus();
    } else if (event.key === 'ArrowRight' && index < 5) {
      codeRefs.current[index + 1]?.focus();
    }
  }

  async function submitJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const shortCode = inputs.joinCodeEntry.trim().toUpperCase();
    const name = inputs.joinName.trim();
    const pin = inputs.joinPin;
    if (!inviteMode && !VALID_CODE.test(shortCode)) {
      setLocalError(copy.codeError);
      moveTo('join-code');
      return;
    }
    if (name.length < 2) {
      setLocalError(copy.nameError);
      moveTo('join-name');
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setLocalError(copy.pinError);
      return;
    }

    setLocalError('');
    try {
      if (recoveringSeat) {
        await onRecover({ shortCode, name, pin });
        clearJoinSecrets();
        onClearSensitiveValues();
        return;
      }
      await onJoin({ shortCode, name, pin });
      clearJoinSecrets();
      onClearSensitiveValues();
      moveTo('join-wait');
    } catch (error) {
      onInputChange('joinPin', '');
      setLocalError(
        error instanceof EntryActionError ? error.message : copy.errorFallback,
      );
    }
  }

  async function checkJoinName() {
    const name = inputs.joinName.trim();
    if (name.length < 2) {
      setLocalError(copy.nameError);
      return;
    }
    setLocalError('');
    try {
      const result = await onCheckJoinName({
        shortCode: inputs.joinCodeEntry.trim().toUpperCase(),
        name,
      });
      if (result === 'duplicate') {
        setDuplicateName(name);
        return;
      }
      setDuplicateName(null);
      if (result === 'reserved') {
        setLocalError(copy.reservedPracticeName);
        return;
      }
      setRecoveringSeat(false);
      onInputChange('joinPin', '');
      moveTo('join-pin');
    } catch (error) {
      setLocalError(
        error instanceof EntryActionError ? error.message : copy.errorFallback,
      );
    }
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const organiserName = inputs.organiserName.trim();
    if (!organiserName) {
      setLocalError(copy.nameError);
      return;
    }
    if (!/^\d{4}$/.test(inputs.organiserPin)) {
      setLocalError(copy.pinError);
      return;
    }
    const organiserPin = inputs.organiserPin;
    setLocalError('');
    try {
      await onCreate({
        gameName: inputs.createGameName.trim() || defaultGameName,
        playerCount: inputs.createPlayerCount,
        organiserName,
        organiserPin,
      });
      onInputChange('organiserPin', '');
      onClearSensitiveValues();
      moveTo('lobby');
    } catch {
      onInputChange('organiserPin', '');
      setLocalError(copy.errorFallback);
    }
  }

  async function submitRehearsal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = inputs.rehearsalName.trim();
    if (!name) {
      setLocalError(copy.nameError);
      return;
    }
    setLocalError('');
    try {
      await onRehearsal({
        playerCount: inputs.rehearsalPlayerCount,
        speed: inputs.rehearsalSpeed,
        name,
      });
    } catch {
      setLocalError(copy.errorFallback);
    }
  }

  const visibleError =
    (screen === 'lobby' ? errors.approve : undefined) ||
    errors[
      screen === 'join-wait' || screen.startsWith('join-')
        ? 'join'
        : screen.startsWith('create-')
          ? 'create'
          : screen === 'lobby'
            ? 'startGame'
            : screen === 'rehearsal-setup'
              ? 'rehearsal'
              : 'join'
    ] ||
    localError;
  const joinCodeCharacters = inputs.joinCodeEntry
    .toUpperCase()
    .slice(0, 6)
    .split('');
  while (joinCodeCharacters.length < 6) joinCodeCharacters.push('');
  const createPlayerCount = Math.max(5, Math.min(40, inputs.createPlayerCount));
  const pageTitle =
    screen === 'welcome'
      ? copy.brand
      : screen === 'join-code'
        ? copy.codeHeading
        : screen === 'join-name'
          ? copy.nameHeading
          : screen === 'join-pin'
            ? copy.pinHeading
            : screen === 'join-wait'
              ? copy.waitingHeading(organiserDisplayName)
              : screen === 'create-name'
                ? copy.createNameHeading
                : screen === 'create-count'
                  ? copy.createCountHeading
                  : screen === 'create-organiser'
                    ? copy.createOrganiserHeading
                    : screen === 'lobby'
                      ? copy.lobbyHeading
                      : copy.rehearsalHeading;

  return (
    <div
      className={`entry-experience${options.largeText ? ' entry-large-text' : ''}`}
    >
      <header className="entry-brand" aria-label={copy.brandDescriptor}>
        <span className="entry-wordmark" data-testid="text-entry-brand">
          <span>{copy.brand.slice(0, -copy.brandGoldSuffix.length)}</span>
          <span className="entry-gilt">{copy.brandGoldSuffix}</span>
        </span>
      </header>

      <main
        className={`entry-main entry-screen-${screen}`}
        id="entry-main"
        key={screen}
      >
        {screen === 'welcome' && (
          <section className="entry-welcome" aria-labelledby="entry-title">
            <div className="entry-welcome-copy">
              <h1 id="entry-title" className="entry-display">
                <span>{copy.brand.slice(0, -copy.brandGoldSuffix.length)}</span>
                <span className="entry-gilt">{copy.brandGoldSuffix}</span>
              </h1>
              <p className="entry-subtitle">{copy.subtitle}</p>
              <p className="entry-description">{copy.welcomeDescription}</p>
            </div>
            <nav className="entry-choice-list" aria-label={copy.brand}>
              <button
                className="entry-primary-action"
                data-testid="button-create-game"
                type="button"
                onClick={() => moveTo('create-name')}
              >
                {copy.createGame}
              </button>
              <button
                className="entry-secondary-action"
                data-testid="button-join-game"
                type="button"
                onClick={beginJoin}
              >
                {copy.joinGame}
              </button>
              <button
                className="entry-text-action"
                data-testid="button-practise-alone"
                type="button"
                onClick={() => moveTo('rehearsal-setup')}
              >
                {copy.practiseAlone}
              </button>
            </nav>
          </section>
        )}

        {screen.startsWith('join-') && screen !== 'join-wait' && (
          <section className="entry-panel enter" aria-labelledby="entry-title">
            <div className="entry-panel-top">
              <div className="entry-progress" aria-label={copy.joinProgress}>
                {[0, 1, 2].map((step) => {
                  const active =
                    screen === 'join-code'
                      ? step === 0
                      : screen === 'join-name'
                        ? step <= 1
                        : true;
                  return (
                    <span
                      key={step}
                      className={`entry-progress-dot${active ? ' is-active' : ''}`}
                      aria-label={copy.joinProgressStep(step + 1)}
                      aria-current={active ? 'step' : undefined}
                    />
                  );
                })}
              </div>
              <h1 id="entry-title" className="entry-heading">
                {pageTitle}
              </h1>
            </div>

            {screen === 'join-code' && (
              <form
                className="entry-form-area"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (
                    VALID_CODE.test(inputs.joinCodeEntry.trim().toUpperCase())
                  )
                    moveTo('join-name');
                }}
              >
                <p className="entry-help">{copy.codeHelp}</p>
                <div
                  className="entry-code-fields"
                  role="group"
                  aria-label={copy.codeHeading}
                >
                  {joinCodeCharacters.map((character, index) => (
                    <input
                      key={index}
                      ref={(element) => {
                        codeRefs.current[index] = element;
                      }}
                      className="entry-code-input"
                      data-testid={`input-join-code-${index + 1}`}
                      aria-label={copy.codeLabel(index + 1)}
                      autoComplete={index === 0 ? 'one-time-code' : 'off'}
                      inputMode="text"
                      maxLength={1}
                      value={character}
                      onChange={(event) => onCodeChange(index, event)}
                      onPaste={onCodePaste}
                      onKeyDown={(event) => onCodeKeyDown(index, event)}
                    />
                  ))}
                </div>
                <button
                  className="entry-primary-action"
                  data-testid="button-continue-code"
                  type="submit"
                  disabled={
                    !VALID_CODE.test(inputs.joinCodeEntry.trim().toUpperCase())
                  }
                >
                  {copy.continue}
                </button>
              </form>
            )}

            {screen === 'join-name' && (
              <div className="entry-form-area">
                <label className="entry-label" htmlFor="entry-join-name">
                  {copy.firstNameLabel}
                </label>
                <input
                  id="entry-join-name"
                  className="entry-field"
                  data-testid="input-join-name"
                  autoComplete="given-name"
                  minLength={2}
                  maxLength={20}
                  value={inputs.joinName}
                  placeholder={copy.firstNamePlaceholder}
                  onChange={(event) => {
                    onInputChange('joinName', event.target.value);
                    setDuplicateName(null);
                    setLocalError('');
                  }}
                />
                <button
                  className="entry-disclosure"
                  type="button"
                  data-testid="button-join-options"
                  aria-expanded={optionsOpen}
                  onClick={() => setOptionsOpen(!optionsOpen)}
                >
                  <span>{copy.optionsHeading}</span>
                  <span aria-hidden="true">{optionsOpen ? '−' : '+'}</span>
                </button>
                {optionsOpen && (
                  <fieldset className="entry-options">
                    <legend className="entry-sr-only">
                      {copy.optionsHeading}
                    </legend>
                    <label>
                      <input
                        type="checkbox"
                        data-testid="option-tap-to-reveal"
                        checked={options.tapToReveal}
                        onChange={(event) =>
                          onOptionChange('tapToReveal', event.target.checked)
                        }
                      />
                      {copy.tapToReveal}
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        data-testid="option-large-text"
                        checked={options.largeText}
                        onChange={(event) =>
                          onOptionChange('largeText', event.target.checked)
                        }
                      />
                      {copy.largeText}
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        data-testid="option-simple-language"
                        checked={options.simpleLanguage}
                        onChange={(event) =>
                          onOptionChange('simpleLanguage', event.target.checked)
                        }
                      />
                      {copy.simpleLanguage}
                    </label>
                  </fieldset>
                )}
                {duplicateName ? (
                  <div
                    className="entry-form-area"
                    role="group"
                    aria-label={copy.duplicateNamePrompt(duplicateName)}
                    data-testid="duplicate-name-choice"
                  >
                    <p>{copy.duplicateNamePrompt(duplicateName)}</p>
                    <button
                      className="entry-primary-action"
                      type="button"
                      onClick={() => {
                        setRecoveringSeat(true);
                        onInputChange('joinPin', '');
                        moveTo('join-pin');
                      }}
                    >
                      {copy.duplicateNameYes}
                    </button>
                    <button
                      className="entry-secondary-action"
                      type="button"
                      onClick={() => {
                        setDuplicateName(null);
                        setLocalError(copy.differentNameError(duplicateName));
                        document.getElementById('entry-join-name')?.focus();
                      }}
                    >
                      {copy.duplicateNameNo}
                    </button>
                  </div>
                ) : (
                  <button
                    className="entry-primary-action"
                    data-testid="button-continue-name"
                    type="button"
                    disabled={inputs.joinName.trim().length < 2}
                    onClick={() => void checkJoinName()}
                  >
                    {copy.continue}
                  </button>
                )}
              </div>
            )}

            {screen === 'join-pin' && (
              <form className="entry-form-area" onSubmit={submitJoin}>
                <label className="entry-label" htmlFor="entry-join-pin">
                  {copy.pinLabel}
                </label>
                <input
                  id="entry-join-pin"
                  className="entry-field entry-pin-field"
                  data-testid="input-join-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  pattern="[0-9]{4}"
                  minLength={4}
                  maxLength={4}
                  value={inputs.joinPin}
                  onChange={(event) =>
                    onInputChange(
                      'joinPin',
                      event.target.value.replace(/\D/g, '').slice(0, 4),
                    )
                  }
                />
                <p className="entry-help">{copy.pinHint}</p>
                <button
                  className="entry-primary-action"
                  data-testid="button-submit-join"
                  type="submit"
                  disabled={busy.join || !/^\d{4}$/.test(inputs.joinPin)}
                >
                  {busy.join ? copy.joinPending : copy.joinButton}
                </button>
              </form>
            )}

            {visibleError && (
              <p
                className="entry-error"
                data-testid="status-entry-error"
                role="alert"
              >
                {visibleError}
              </p>
            )}
            <button
              className="entry-back-action"
              data-testid="button-back-entry"
              type="button"
              onClick={() => {
                if (screen === 'join-code') abandonJoin();
                else if (screen === 'join-name') {
                  onInputChange('joinPin', '');
                  moveTo('join-code');
                } else {
                  setRecoveringSeat(false);
                  onInputChange('joinPin', '');
                  moveTo('join-name');
                }
              }}
            >
              {copy.back}
            </button>
          </section>
        )}

        {screen === 'join-wait' && (
          <section
            className="entry-panel entry-wait-panel enter"
            aria-labelledby="entry-title"
          >
            <div className="entry-wait-seal" aria-hidden="true">
              <span />
            </div>
            <h1 id="entry-title" className="entry-heading">
              {pageTitle}
            </h1>
            <p className="entry-help">{copy.waitingBody}</p>
            <p
              className="entry-live-status"
              data-testid="status-join-wait"
              role="status"
            >
              {pageTitle}
            </p>
            <button
              className="entry-primary-action"
              data-testid="button-check-join-status"
              type="button"
              disabled={busy.join}
              onClick={() => {
                setLocalError('');
                void Promise.resolve(onCheckJoinStatus()).catch(() =>
                  setLocalError(copy.errorFallback),
                );
              }}
            >
              {busy.join ? copy.joinPending : copy.joinRetry}
            </button>
            {visibleError && (
              <p
                className="entry-error"
                data-testid="status-entry-error"
                role="alert"
              >
                {visibleError}
              </p>
            )}
            <button
              className="entry-back-action"
              data-testid="button-leave-join-wait"
              type="button"
              onClick={abandonJoin}
            >
              {copy.back}
            </button>
          </section>
        )}

        {screen === 'create-name' && (
          <section className="entry-panel enter" aria-labelledby="entry-title">
            <h1 id="entry-title" className="entry-heading">
              {copy.createNameHeading}
            </h1>
            <form
              className="entry-form-area entry-create-form"
              onSubmit={(event) => {
                event.preventDefault();
                moveTo('create-count');
              }}
            >
              <label className="entry-label" htmlFor="entry-game-name">
                {copy.gameNameLabel}
              </label>
              <input
                id="entry-game-name"
                className="entry-field"
                data-testid="input-game-name"
                maxLength={50}
                value={inputs.createGameName}
                placeholder={defaultGameName || copy.gameNamePlaceholder}
                onChange={(event) =>
                  onInputChange('createGameName', event.target.value)
                }
              />
              <button
                className="entry-primary-action"
                data-testid="button-continue-create-name"
                type="submit"
              >
                {copy.continue}
              </button>
            </form>
            {visibleError && (
              <p
                className="entry-error"
                data-testid="status-entry-error"
                role="alert"
              >
                {visibleError}
              </p>
            )}
            <button
              className="entry-back-action"
              data-testid="button-back-entry"
              type="button"
              onClick={() => {
                moveTo('welcome');
              }}
            >
              {copy.back}
            </button>
          </section>
        )}

        {screen === 'create-count' && (
          <section className="entry-panel enter" aria-labelledby="entry-title">
            <h1 id="entry-title" className="entry-heading">
              {copy.createCountHeading}
            </h1>
            <div className="entry-form-area">
              <p className="entry-label">{copy.playerCountLabel}</p>
              <div
                className="entry-stepper"
                role="group"
                aria-label={copy.playerCountLabel}
              >
                <button
                  className="entry-stepper-action"
                  data-testid="button-player-count-decrease"
                  type="button"
                  aria-label={copy.decreasePlayers}
                  disabled={createPlayerCount <= 5}
                  onClick={() =>
                    onInputChange('createPlayerCount', createPlayerCount - 1)
                  }
                >
                  −
                </button>
                <output
                  className="entry-stepper-value"
                  data-testid="text-create-player-count"
                  aria-live="polite"
                >
                  {createPlayerCount}
                </output>
                <button
                  className="entry-stepper-action"
                  data-testid="button-player-count-increase"
                  type="button"
                  aria-label={copy.increasePlayers}
                  disabled={createPlayerCount >= 40}
                  onClick={() =>
                    onInputChange('createPlayerCount', createPlayerCount + 1)
                  }
                >
                  +
                </button>
              </div>
              <p className="entry-help" data-testid="text-recommended-traitors">
                {copy.recommendedTraitors(
                  recommended(createPlayerCount).traitors,
                )}
              </p>
              <button
                className="entry-primary-action"
                data-testid="button-continue-player-count"
                type="button"
                onClick={() => moveTo('create-organiser')}
              >
                {copy.continue}
              </button>
            </div>
            {visibleError && (
              <p
                className="entry-error"
                data-testid="status-entry-error"
                role="alert"
              >
                {visibleError}
              </p>
            )}
            <button
              className="entry-back-action"
              data-testid="button-back-entry"
              type="button"
              onClick={() => moveTo('create-name')}
            >
              {copy.back}
            </button>
          </section>
        )}

        {screen === 'create-organiser' && (
          <section className="entry-panel enter" aria-labelledby="entry-title">
            <h1 id="entry-title" className="entry-heading">
              {copy.createOrganiserHeading}
            </h1>
            <form
              className="entry-form-area entry-create-form"
              onSubmit={submitCreate}
            >
              <label className="entry-label" htmlFor="entry-organiser-name">
                {copy.organiserNameLabel}
              </label>
              <input
                id="entry-organiser-name"
                className="entry-field"
                data-testid="input-organiser-name"
                autoComplete="given-name"
                minLength={2}
                maxLength={20}
                value={inputs.organiserName}
                onChange={(event) =>
                  onInputChange('organiserName', event.target.value)
                }
              />
              <label className="entry-label" htmlFor="entry-organiser-pin">
                {copy.organiserPinLabel}
              </label>
              <p id="entry-organiser-pin-help" className="entry-help">
                {copy.pinHint}
              </p>
              <input
                id="entry-organiser-pin"
                aria-describedby="entry-organiser-pin-help"
                className="entry-field entry-pin-field"
                data-testid="input-organiser-pin"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                pattern="[0-9]{4}"
                maxLength={4}
                value={inputs.organiserPin}
                onChange={(event) =>
                  onInputChange(
                    'organiserPin',
                    event.target.value.replace(/\D/g, '').slice(0, 4),
                  )
                }
              />
              <button
                className="entry-primary-action"
                data-testid="button-create-submit"
                type="submit"
                disabled={
                  busy.create ||
                  !inputs.organiserName.trim() ||
                  !/^\d{4}$/.test(inputs.organiserPin)
                }
              >
                {busy.create ? copy.createPending : copy.createButton}
              </button>
            </form>
            {visibleError && (
              <p
                className="entry-error"
                data-testid="status-entry-error"
                role="alert"
              >
                {visibleError}
              </p>
            )}
            <button
              className="entry-back-action"
              data-testid="button-back-entry"
              type="button"
              onClick={() => {
                onInputChange('organiserPin', '');
                moveTo('create-count');
              }}
            >
              {copy.back}
            </button>
          </section>
        )}

        {screen === 'lobby' && coordinatorPanel}
        {screen === 'lobby' && (
          <section className="entry-lobby enter" aria-labelledby="entry-title">
            <h1 id="entry-title" className="entry-heading">
              {lateJoinMode ? copy.lateInviteHeading : copy.lobbyHeading}
            </h1>
            {lateJoinMode && (
              <>
                <p className="entry-help">{copy.lateInviteBody}</p>
                <button
                  className="entry-secondary-action"
                  type="button"
                  disabled={busy.share || !onCreateLateInvite}
                  onClick={() => {
                    setLocalError('');
                    void Promise.resolve(onCreateLateInvite?.()).catch(() =>
                      setLocalError(copy.errorFallback),
                    );
                  }}
                >
                  {busy.share
                    ? copy.createLateInvitePending
                    : copy.createLateInvite}
                </button>
              </>
            )}
            <div className="entry-lobby-logistics">
              {qrCode && (
                <div
                  className="entry-qr"
                  data-testid="img-lobby-qr"
                  role="img"
                  aria-label={copy.qrAlt}
                >
                  {qrCode}
                </div>
              )}
              <div className="entry-code-share">
                {!lateJoinMode && (
                  <>
                    <p className="entry-code-caption">{copy.codeCaption}</p>
                    <strong
                      className="entry-lobby-code"
                      data-testid="text-lobby-code"
                    >
                      {joinCode}
                    </strong>
                  </>
                )}
                <button
                  className="entry-secondary-action"
                  data-testid="button-share-game"
                  type="button"
                  disabled={busy.share || !shareUrl}
                  onClick={() => {
                    setLocalError('');
                    void Promise.resolve(onShare(shareUrl)).catch(() =>
                      setLocalError(copy.errorFallback),
                    );
                  }}
                >
                  {busy.share ? copy.sharePending : copy.share}
                </button>
                {!shareUrl && !lateJoinMode && (
                  <p
                    className="entry-help"
                    data-testid="status-share-unavailable"
                  >
                    {copy.shareUnavailable}
                  </p>
                )}
              </div>
            </div>

            <div className="entry-rosters">
              <p className="entry-help" data-testid="text-lobby-player-count">
                {lateJoinMode
                  ? copy.latePlayerCount(players.length)
                  : copy.lobbyPlayerCount(players.length, requiredPlayerCount)}
              </p>
              {!lateJoinMode && players.length < 5 && (
                <p className="entry-help">{copy.minimumPlayers(5)}</p>
              )}
              <section aria-labelledby="entry-roster-heading">
                <h2 id="entry-roster-heading" className="entry-section-heading">
                  {copy.rosterHeading}
                </h2>
                <ul
                  className="entry-player-list"
                  data-testid="list-lobby-players"
                >
                  {players.map((player) => (
                    <li
                      key={player.id}
                      data-testid={`player-lobby-${player.id}`}
                    >
                      {player.name}
                    </li>
                  ))}
                </ul>
              </section>
              <section aria-labelledby="entry-pending-heading">
                <h2
                  id="entry-pending-heading"
                  className="entry-section-heading"
                >
                  {copy.pendingHeading}
                </h2>
                {pendingJoiners.length === 0 ? (
                  <p
                    className="entry-help"
                    data-testid="text-no-pending-joiners"
                  >
                    {copy.noPendingJoiners}
                  </p>
                ) : (
                  <ul
                    className="entry-pending-list"
                    data-testid="list-pending-joiners"
                  >
                    {pendingJoiners.map((joiner) => (
                      <li
                        key={joiner.id}
                        data-testid={`row-pending-joiner-${joiner.id}`}
                      >
                        <span>{joiner.name}</span>
                        <button
                          className="entry-approve-action"
                          data-testid={`button-approve-${joiner.id}`}
                          type="button"
                          disabled={busy.approveJoinerIds.includes(joiner.id)}
                          onClick={() => {
                            setLocalError('');
                            void Promise.resolve(
                              onApproveJoiner(joiner.id),
                            ).catch(() => setLocalError(copy.errorFallback));
                          }}
                        >
                          {busy.approveJoinerIds.includes(joiner.id)
                            ? copy.approvePending
                            : copy.approve}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
            {visibleError && (
              <p
                className="entry-error"
                data-testid="status-entry-error"
                role="alert"
              >
                {visibleError}
              </p>
            )}
            <button
              className="entry-primary-action entry-start-game"
              data-testid="button-start-game"
              type="button"
              disabled={busy.startGame || (!lateJoinMode && players.length < 5)}
              onClick={() => {
                setLocalError('');
                void Promise.resolve(onStartGame()).catch(() =>
                  setLocalError(copy.errorFallback),
                );
              }}
            >
              {lateJoinMode
                ? copy.backToGame
                : busy.startGame
                  ? copy.startGamePending
                  : copy.startGame}
            </button>
          </section>
        )}

        {screen === 'rehearsal-setup' && (
          <section className="entry-panel enter" aria-labelledby="entry-title">
            <h1 id="entry-title" className="entry-heading">
              {copy.rehearsalHeading}
            </h1>
            <p className="entry-help entry-rehearsal-description">
              {copy.rehearsalDescription}
            </p>
            <form
              className="entry-form-area entry-rehearsal-form"
              onSubmit={submitRehearsal}
            >
              <div className="entry-range-heading">
                <label
                  className="entry-label"
                  htmlFor="entry-rehearsal-players"
                >
                  {copy.rehearsalPlayersLabel}
                </label>
                <output
                  className="entry-range-value"
                  data-testid="text-rehearsal-player-count"
                  htmlFor="entry-rehearsal-players"
                >
                  {inputs.rehearsalPlayerCount}
                </output>
              </div>
              <input
                id="entry-rehearsal-players"
                className="entry-range"
                data-testid="input-rehearsal-player-count"
                type="range"
                min={6}
                max={15}
                step={1}
                value={inputs.rehearsalPlayerCount}
                onChange={(event) =>
                  onInputChange(
                    'rehearsalPlayerCount',
                    Number(event.target.value),
                  )
                }
              />
              <p className="entry-help">{copy.rehearsalRange}</p>

              <fieldset className="entry-speed-options">
                <legend className="entry-label">
                  {copy.rehearsalSpeedLabel}
                </legend>
                <button
                  className="entry-speed-choice"
                  data-testid="button-speed-fast"
                  type="button"
                  aria-pressed={inputs.rehearsalSpeed === 'fast'}
                  onClick={() => onInputChange('rehearsalSpeed', 'fast')}
                >
                  {copy.fast}
                </button>
                <button
                  className="entry-speed-choice"
                  data-testid="button-speed-normal"
                  type="button"
                  aria-pressed={inputs.rehearsalSpeed === 'normal'}
                  onClick={() => onInputChange('rehearsalSpeed', 'normal')}
                >
                  {copy.normal}
                </button>
              </fieldset>
              <label className="entry-label" htmlFor="entry-rehearsal-name">
                {copy.rehearsalNameLabel}
              </label>
              <input
                id="entry-rehearsal-name"
                className="entry-field"
                data-testid="input-rehearsal-name"
                autoComplete="given-name"
                maxLength={20}
                value={inputs.rehearsalName}
                onChange={(event) =>
                  onInputChange('rehearsalName', event.target.value)
                }
              />
              <button
                className="entry-primary-action"
                data-testid="button-start-rehearsal"
                type="submit"
                disabled={busy.rehearsal || !inputs.rehearsalName.trim()}
              >
                {busy.rehearsal ? copy.rehearsalPending : copy.rehearsalButton}
              </button>
            </form>
            {visibleError && (
              <p
                className="entry-error"
                data-testid="status-entry-error"
                role="alert"
              >
                {visibleError}
              </p>
            )}
            <button
              className="entry-back-action"
              data-testid="button-back-entry"
              type="button"
              onClick={() => {
                onClearSensitiveValues();
                moveTo('welcome');
              }}
            >
              {copy.back}
            </button>
          </section>
        )}
      </main>

      <BrandFooter
        context="game"
        className="entry-footer"
        testId="brand-footer-entry"
      />
    </div>
  );
}

export default EntryExperience;
