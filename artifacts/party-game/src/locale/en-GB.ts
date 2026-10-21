const independenceStatement =
  'Oathstone is an independent game made by Stackstone Consulting. It is not affiliated with, or endorsed by, any TV programme or its producers.';

type PublicRole = 'traitor' | 'faithful';

const publicBanishmentResult = (name: string, role?: PublicRole | null) =>
  role
    ? `${name} has been banished. They were ${role === 'traitor' ? 'Traitor' : 'Faithful'}.`
    : `${name} has been banished.`;

const publicGameResult = (winner: PublicRole) =>
  `The ${winner === 'traitor' ? 'Traitors' : 'Faithful'} won.`;

export const en = {
  skip: 'Skip to main content',
  nav: { label: 'Main', home: 'Home', play: 'Play', menu: 'Menu' },
  app: {
    securityUnavailable:
      'The secure connection could not be established. Check your connection, then try again.',
    tryAgain: 'Try again',
    securityPreparing:
      'The security check is still preparing. Try again in a moment.',
    connectionStatus: 'Connection status',
    online: 'Online',
    reconnecting: 'Reconnecting...',
    connecting: 'Connecting...',
    display: 'Display',
    alwaysDark: 'Always dark',
    nightFalls: 'Night falls',
    morning: 'Morning',
    back: 'Back',
    refresh: 'Refresh',
    brandName: 'Stackstone Consulting',
    brandLink: 'Visit Stackstone Consulting',
  },
  coordinator: {
    heading: 'Game controls',
    loading: 'Loading game controls…',
    currentStep: 'Current step',
    paused: 'Paused',
    timeLeft: 'Time left',
    privateProgress: 'Private progress',
    progress: (done: number, total: number) => `${done} of ${total} done`,
    coCoordinatorHeading: 'Co-coordinator takeover',
    coCoordinatorCountLabel: 'Co-coordinator seats',
    coCoordinatorDecrease: 'Decrease co-coordinator seats',
    coCoordinatorIncrease: 'Increase co-coordinator seats',
    coCoordinatorSetupHelp:
      'Choose up to three players who can take over logistics if your phone is unavailable. They never see private game information.',
    coCoordinatorDescription:
      'Choose living players who can take over logistics if your phone is unavailable. They will not see private roles, votes or choices.',
    coCoordinatorLimit: (limit: number) =>
      `Choose up to ${limit} ${limit === 1 ? 'co-coordinator' : 'co-coordinators'}.`,
    coCoordinatorMajority:
      'No co-coordinator is configured. If your phone is unavailable when action is needed, a majority of living players can approve a logistics-only takeover.',
    coCoordinatorSave: 'Save co-coordinators',
    coCoordinatorSaved: 'Co-coordinators saved.',
    coCoordinatorError:
      'Co-coordinators could not be saved. Check the connection and try again.',
    takeoverHeading: 'Coordinator takeover',
    takeoverPrompt:
      'The organiser has been unavailable for at least two minutes. You can take over game logistics, but you will not see private roles, votes or choices.',
    takeoverRequestHelp:
      'The organiser has been unavailable for at least two minutes. A majority of living players must approve a logistics-only takeover.',
    takeoverRequest: 'Request a logistics takeover',
    takeoverRequested: 'Request sent. Waiting for the living players.',
    takeoverApprovalPrompt: (name: string) =>
      `${name} has requested a coordinator takeover.`,
    takeoverVotes: (yes: number, no: number, required: number) =>
      `${yes} approve, ${no} decline; ${required} approvals are needed.`,
    takeoverApproved:
      'The takeover is approved. The requester can now claim coordinator controls.',
    takeoverApprove: 'Approve',
    takeoverDecline: 'Decline',
    takeoverClaim: 'Take over game logistics',
    takeoverPending: 'Submitting…',
    takeoverError:
      'Coordinator takeover could not be checked or completed. Try again; if it continues, ask the organiser to reconnect.',
    pinLockoutsHeading: 'PIN lockouts',
    seatPinLocked: (name: string, time: string) =>
      `${name} is locked out after too many PIN attempts, until ${time}.`,
    manageSeats: 'Manage seats',
    markDeparted: 'Mark as departed',
    confirmDeparted: (name: string) =>
      `Mark ${name} as departed? They will no longer take part.`,
    seatStatus: (status: 'alive' | 'banished' | 'murdered' | 'departed') => {
      if (status === 'alive') return 'Playing';
      if (status === 'murdered') return 'Taken';
      return status === 'banished' ? 'Banished' : 'Departed';
    },
    noSeats: 'No seats are available.',
    presenterHeading: 'Presenter screen (optional)',
    presenterDescription:
      'Use a shared display for public updates. This one-time pairing code is not the six-character game code.',
    createPresenterPairing: 'Create presenter pairing code',
    presenterPairingCode: 'One-time presenter pairing code',
    openPresenterScreen: 'Open presenter screen',
    presenterPairingPending: 'Creating code…',
    presenterPairingError:
      'Could not create a presenter code. Check that this game was created with the presenter option enabled.',
    noTimer: 'No timer',
    movingOn: 'Moving on...',
    pause: 'Pause game',
    resume: 'Resume game',
    extend: 'Extend time',
    addMinute: 'Add 1 minute',
    addMinutes: (minutes: 5 | 15) => `Add ${minutes} minutes`,
    endEarly: 'End game early',
    moveConfirmation: (unfinished: number) =>
      unfinished === 1
        ? "1 player hasn't finished. Move everyone on anyway?"
        : `${unfinished} players haven't finished. Move everyone on anyway?`,
    moveAnyway: 'Move everyone on anyway',
    undoLastAction: 'Undo last action',
    endConfirmation: 'End this game early? Everyone will see the final result.',
    endNow: 'End game now',
    cancel: 'Cancel',
    keepPlaying: 'Keep playing',
    error: 'The change could not be saved. Check the connection and try again.',
  },
  presenter: {
    pairHeading: 'Connect a presenter screen',
    pairDescription:
      'Enter the one-time pairing code from the organiser. It is not the six-character game code.',
    pairCodeLabel: 'Presenter pairing code',
    pairButton: 'Pair this screen',
    pairPending: 'Connecting…',
    pairError:
      'That presenter code could not be used. Ask the organiser to create a new one.',
    securityPending: 'The security check is still loading. Please try again.',
    loading: 'Connecting to the game…',
    qrLabel: 'Scan this code to join the game.',
    notFound:
      'This game could not be found. Check the link with the organiser.',
    waiting: 'The presenter screen is ready once the organiser pairs it.',
    currentStep: 'Current step',
    nightCommentary: (night: number) =>
      `Night ${night}. Night choices are private. Everyone is choosing now.`,
    dayCommentary: (day: number, players: number) =>
      `Day ${day}. ${players} players remain.`,
    voteProgress: (done: number, total: number) =>
      `${done} of ${total} have voted.`,
    finalVoteProgress: (done: number, total: number) =>
      `${done} of ${total} have chosen whether to end the game.`,
    endgameCommentary: (players: number, unanimous: boolean) =>
      `${players} players remain. Decide together: end the game now, or banish one more? ${
        unanimous
          ? 'Everyone must agree to end.'
          : 'A majority must agree to end.'
      }`,
    banishedResult: publicBanishmentResult,
    gameResult: publicGameResult,
    paused: 'Paused',
    lobbyCode: 'Game code',
    joinPrompt: 'Scan to join, or enter this code:',
    playersJoined: (count: number) =>
      `${count} ${count === 1 ? 'player has' : 'players have'} joined`,
    latestUpdates: 'Latest updates',
    noUpdates: 'No public updates yet.',
    prizePot: (amount: number, unit: string) => `Prize pot: ${amount} ${unit}`,
    results: 'Results',
    gameComplete: 'The game has finished.',
  },
  home: {
    eyebrow: 'A game for everyone',
    heading: 'A game of traitors and faithful.',
    intro: 'Everyone plays. Even the host.',
    body: 'A free browser game for 5 to 40 players, played on everyone’s own phone.',
    cta: 'Start playing',
  },
  publicSite: {
    answer: (name: string) =>
      `${name} is a free game of traitors and faithful for 5 to 40 players, played on everyone’s own phone, where the host plays too.`,
    howItWorksHeading: 'How it works',
    howItWorks: [
      {
        heading: 'Start a game together',
        body: 'The organiser joins as a player and shares a short code or link.',
      },
      {
        heading: 'Get a private role',
        body: 'Each player opens the game in a phone or tablet browser. Nothing to download.',
      },
      {
        heading: 'Play the whole group',
        body: 'Complete missions, build the prize pot, discuss suspicions and vote together.',
      },
      {
        heading: 'Find the hidden traitors',
        body: 'Traitors choose who to murder. The group banishes players, then decides when the game ends.',
      },
    ],
    formatsHeading: 'Choose your format',
    formats: [
      {
        name: 'Quick',
        duration: 'About one hour',
        description:
          'A fast game for one gathering, with short discussions and simple missions.',
      },
      {
        name: 'Day',
        duration: 'Across a day',
        description:
          'Pause around meals and planned events, then bring everyone back for each reveal.',
      },
      {
        name: 'Multi-day',
        duration: 'Two to fourteen days',
        description:
          'Play remotely with scheduled private moments and time to discuss between steps.',
      },
    ],
    aboutHeading: 'About Oathstone',
    aboutDescription:
      'Oathstone is an independent party game made by Stackstone Consulting.',
    howToPlayHeading: 'How to play',
    howToPlayDescription:
      'A quick guide to joining and playing Oathstone together.',
    comingSoonPageTitle: 'Oathstone is coming soon',
    comingSoonDescription:
      'Oathstone is a free hidden-traitor party game for 5 to 40 people, played on phones in the same room or over a video call. It is coming soon.',
    comingSoonBody:
      'Oathstone is a free hidden-traitor party game for 5 to 40 people, played on phones in the same room or over a video call. It is coming soon.',
    comingSoonByline: 'A Stackstone game.',
    independenceStatement,
    faqHeading: 'Frequently asked questions',
    faqDescription:
      'Answers about group size, playing on phones, privacy and how to join.',
    faq: [
      {
        question: 'How do we play a traitor game at home with 15 people?',
        answer:
          'The organiser starts a game, joins as a player and shares the six-character code. Each person joins in a phone or tablet browser and receives a private role. Players complete missions, build the prize pot, discuss suspicions and vote together.',
      },
      {
        question: 'Is there a traitor game where nobody has to host?',
        answer:
          'Yes. The organiser handles timing and approvals but also receives a secret role and plays like everyone else.',
      },
      {
        question: 'What is a good game for a big family gathering?',
        answer:
          'A group can play together using their own phones or tablets, with family-friendly wording and paired seats for anyone sharing a device.',
      },
      {
        question:
          'Is there a party game where everyone gets a secret role on their phone?',
        answer:
          'Yes. Players reveal their role privately on their own browser screen, while public announcements are shared with the whole group.',
      },
      {
        question:
          'Is there a team-building game like this for 30 or 40 people?',
        answer:
          'The game supports groups from 5 to 40 players and can be scheduled for a quick session, a day or a multi-day event.',
      },
      {
        question:
          'Is there a free alternative to boxed traitor games that takes more players?',
        answer:
          'This browser game is free to play and supports 5 to 40 players. Players use a phone or tablet browser; there is nothing to download.',
      },
      {
        question: 'Can children and grandparents play?',
        answer:
          'Yes. Family-friendly wording, larger text, simpler language, tap-to-reveal and paired seats help different ages play together.',
      },
      {
        question: 'How long does a game take?',
        answer:
          'A quick game takes about one hour. A day format can span a gathering, and a multi-day game can run for two to fourteen days.',
      },
      {
        question:
          'Is there a free alternative to chat-based hidden-traitor games?',
        answer:
          'Yes. Many versions of this kind of game play out as group-chat messages over a week, charge per player and limit numbers. Oathstone is different: it is free for everyone, with no per-player tickets; it takes up to 40 players, and families with children can play together; you play face to face in one room, with phones used only for secrets; there are no phone numbers or group chats, just a code and a first name; secrets stay secret with hold-to-reveal and identical screens for every role; and it works anywhere, for an hour or a fortnight.',
      },
      {
        question: 'Is Oathstone affiliated with a television programme?',
        answer: `No. ${independenceStatement}`,
      },
      {
        question: 'Do I need WhatsApp or an app?',
        answer:
          'No. Oathstone runs in any modern phone or tablet browser. You can add it to your Home Screen if you like, but you never have to.',
      },
    ],
    joinGame: 'Join a game',
    practiseAlone: 'Practise alone first',
    seeAllQuestions: 'See all questions',
    compareHeading: 'Compare game formats',
    compareDescription:
      'Compare group game formats and see how Oathstone lets the organiser play too.',
    compareIntro:
      'Different games suit different groups. Oathstone is a free game of traitors and faithful for 5 to 40 players, where the organiser plays too.',
    comparisonCategories: [
      {
        name: 'Boxed games',
        description:
          'A small boxed game can suit a table-sized group, but a large gathering may need several copies or a separate organiser.',
      },
      {
        name: 'Week-long chat games',
        description:
          'Many versions of this kind of game play out as group-chat messages over a week, charge per player and limit numbers.',
      },
      {
        name: 'Single-player apps',
        description:
          'These are designed for one person at a time rather than a whole gathering playing together.',
      },
      {
        name: 'Werewolf apps with a moderator',
        description:
          'A moderator runs the game and may need to sit out instead of taking a secret role.',
      },
      {
        name: 'Do-it-yourself games',
        description:
          'The group creates its own materials and someone has to manage the game instead of playing.',
      },
      {
        name: 'Oathstone',
        description:
          'Five to 40 people play together, including the organiser. Phones are used for private secrets, and there is nothing to download.',
      },
    ],
    factsHeading: 'At a glance',
    factLabels: {
      players: 'Players',
      duration: 'Duration',
      devices: 'Devices',
      price: 'Price',
      privacy: 'Privacy',
      builder: 'Built by',
    },
    factValues: {
      players: '5 to 40 players',
      duration: 'One hour to two weeks',
      devices: 'Any modern phone or tablet browser',
      price: 'Free',
      privacy: 'Privacy shield designed for private reveals',
    },
    play: 'Start a new game',
    learnMore: 'Learn how to play',
    demoHeading: 'Hold to see your role',
    demoDescription:
      'Hold the gold seal to reveal a sample role. Release to hide it.',
    demoPrompt: 'Hold to reveal',
    demoLink: 'Try the full game',
    factsIntro: 'The essentials, in one place.',
  },
  entry: {
    brandDescriptor: 'Oathstone',
    loadingSetup: 'Loading game setup…',
    headlineFirst: 'Oathstone',
    headlineSecond: '',
    subtitle: 'A game of traitors and faithful.',
    welcomeDescription: 'Everyone plays. Even the host.',
    createGame: 'Start a new game',
    joinGame: 'Join a game',
    practiseAlone: 'Practise alone first',
    joinProgress: 'Join progress',
    joinProgressStep: (step: number) => `Step ${step} of 3`,
    codeHeading: 'What’s the game code?',
    codeHelp:
      'Enter the code your organiser shared. This shared code has six letters or numbers. It is not your PIN.',
    codeLabel: (digit: number) => `Game code character ${digit}`,
    continue: 'Continue',
    back: 'Back',
    nameHeading: 'What should we call you?',
    firstNameLabel: 'Your first name',
    firstNamePlaceholder: 'First name',
    duplicateNamePrompt: (name: string) =>
      `Someone called ${name} is already playing. Is that you on a new phone?`,
    duplicateNameYes: "Yes, that's me",
    duplicateNameNo: "No, I'm someone else",
    differentNameError: (name: string) =>
      `Please choose a different name, for example ${name} B.`,
    reservedPracticeName:
      'That name is reserved for practice players. Please choose a different name.',
    optionsHeading: 'Options',
    tapToReveal: 'Tap instead of hold',
    largeText: 'Use larger text',
    simpleLanguage: 'Use simpler words',
    pinHeading: 'Choose a 4-digit PIN',
    pinLabel: '4-digit PIN',
    pinHint:
      'This is your private 4-digit PIN, not the game code. You’ll only need it if you change phones.',
    joinButton: 'Join',
    joinPending: 'Sending request…',
    waitingHeading: (organiser: string) =>
      `Waiting for ${organiser} to let you in`,
    waitingBody:
      'Your organiser will approve your seat. You can check again here.',
    joinRetry: 'Check again',
    statusError:
      'We couldn’t check your seat yet. Check your connection, then try again.',
    joinRejected:
      'Your organiser could not approve this seat. Ask them for help.',
    busy: 'The service is busy right now. Try again in a few minutes.',
    qrPreparing: 'Preparing the game QR code',
    defaultOrganiser: 'your organiser',
    lobbyPlayerCount: (joined: number, total: number) =>
      `${joined} of ${total} player seats are ready.`,
    minimumPlayers: (count: number) =>
      `Waiting for at least ${count} players before starting.`,
    createNameHeading: 'Name your game',
    gameNameLabel: 'Game name (optional)',
    gameNamePlaceholder: 'Game name',
    createCountHeading: 'How many players?',
    playerCountLabel: 'Player seats',
    decreasePlayers: 'Fewer players',
    increasePlayers: 'More players',
    recommendedTraitors: (count: number) => `Recommended Traitors: ${count}`,
    createOrganiserHeading: 'Your name and PIN',
    organiserNameLabel: 'Your first name',
    organiserPinLabel: 'Choose a 4-digit PIN',
    votingStyleLabel: 'How should votes be revealed?',
    speakerCircleLabel: 'In-room voting circle (recommended)',
    speakerCircleDescription:
      'Each player says who they voted for and why, in a random order.',
    automaticRevealLabel: 'Automatic reveal',
    automaticRevealDescription: 'Use this for video-call or multi-day games.',
    presenterToggleLabel: 'Use an optional TV presenter screen',
    presenterToggleDescription:
      'Shows public updates on a shared display. Everyone can still use their own phone.',
    createButton: 'Create game',
    createPending: 'Creating game…',
    lobbyHeading: 'Your game lobby',
    lateInviteHeading: 'Invite a late player',
    lateInviteBody:
      'Create a fresh link or QR code, then approve their seat here. Late players join as Faithful. The old game code stays closed.',
    createLateInvite: 'Create a fresh invitation',
    createLateInvitePending: 'Creating invitation…',
    lateInviteUnavailable:
      'Late joining is closed or all seats are taken. You can return to the game.',
    organiserOnly: 'Only the organiser can use these controls on this device.',
    backToGame: 'Back to game',
    organiserControls: 'Organiser controls',
    latePlayerCount: (count: number) => `${count} players are seated.`,
    qrAlt: 'QR code for the game invitation',
    codeCaption: 'Game code',
    share: 'Share invitation',
    sharePending: 'Opening share options…',
    shareUnavailable:
      'Sharing is unavailable. Ask the organiser to copy the game code.',
    rosterHeading: 'Players',
    pendingHeading: 'Waiting for approval',
    noPendingJoiners: 'No one is waiting to join.',
    approve: 'Approve',
    approvePending: 'Approving…',
    startGame: 'Start the game',
    startGamePending: 'Starting…',
    rehearsalHeading: 'Practise alone first',
    rehearsalDescription:
      'Play a complete rehearsal on this phone with practice players filling the other seats.',
    rehearsalPlayersLabel: 'Players',
    rehearsalRange: 'Practice games use 6 to 15 players.',
    rehearsalSpeedLabel: 'Game speed',
    fast: 'Fast',
    normal: 'Normal',
    rehearsalNameLabel: 'Your first name',
    rehearsalButton: 'Rehearse a full game',
    rehearsalPending: 'Starting rehearsal…',
    errorFallback:
      'We couldn’t complete that step. Check your connection, then try again.',
    codeError: 'Check the six-character game code and try again.',
    nameError: 'Enter at least two letters for your first name.',
    pinError: 'Enter the four-digit PIN you chose.',
  },
  play: {
    heading: 'Join a game',
    intro:
      'Enter the code your organiser shared. Your organiser will approve your seat.',
    codeLabel: 'Six-character game code',
    nameLabel: 'Display name',
    pinLabel: 'Seat PIN',
    joinButton: 'Join game',
    joinPending: 'Sending request…',
    joinError: 'We could not join that game. Check the code and try again.',
    joinSent: (requestId: string) =>
      `Request sent. Waiting for the organiser to admit you. Reference ${requestId}.`,
    rejoinHeading: 'Rejoin an existing seat',
    rejoinBody:
      'On a new device, enter the same game code, display name and seat PIN used before.',
    rejoinRequired:
      'Enter the game code, display name and seat PIN above first.',
    rejoinButton: 'Rejoin this seat',
    rejoinPending: 'Rejoining…',
    rejoinError:
      'Recovery could not be completed. Check the game code, name and PIN.',
    rehearsalHeading: 'Or rehearse the whole game',
    rehearsalBody:
      'Practise with practice players filling the other seats, real game state and shortened rounds.',
    rehearsalInstructions:
      'Choose a player count and speed, then enter your first name.',
    rehearsalButton: 'Rehearse a full game',
    rehearsalPending: 'Starting practice…',
    rehearsalError:
      'Rehearsal could not be started. Choose a name and try again.',
    rehearsalOpenError: 'Rehearsal could not be opened. Please try again.',
    openPractice: 'Open your practice game',
    installPrompt: 'Install as app',
    installTitle: 'Add this site to your Home Screen',
    installIos:
      'On iPhone or iPad, open the Share or browser menu in Safari, Chrome or Edge, then choose Add to Home Screen. If you already joined, open Rejoin an existing seat and use your game code, display name and PIN.',
    installGeneric:
      'On Android or desktop, use Install as app when your browser offers it.',
    installInstructions: 'Home Screen instructions',
    installUnavailable: 'This browser did not offer an install prompt.',
    installFailed: 'The install prompt could not be opened.',
    installAccepted: 'This site was added to your Home Screen.',
    installFallback:
      'You can still add this website to your Home Screen from the browser menu.',
  },
  game: {
    phases: {
      DRAFT: 'Preparing the game',
      LOBBY: 'Gathering players',
      DEAL: 'Private roles',
      MISSION: 'The mission',
      DEBATE: 'The conversation',
      VOTE: 'Make your vote',
      VERDICT: 'The verdict',
      SHADOW: 'A choice in the dark',
      DAWN: 'A new day',
      ENDGAME: 'The final decision',
      FINAL_VOTE: 'End or continue',
      FINAL_BANISH: 'Final banishment',
      FINISHED: 'Game complete',
      ARCHIVED: 'Game archived',
    },
    defaultPhase: 'The game',
    loading: 'Loading your game',
    loadingLabel: 'Loading game',
    unavailableHeading: 'The game view is unavailable',
    unavailableBody: 'Your private details have not been opened.',
    tryAgain: 'Try again',
    visitorJoin:
      'Enter the code your organiser shared to ask to join this game.',
    joinButton: 'Join a game',
    dawnNoOneTaken: 'No one was taken.',
    dawnTaken: (name: string) => `${name} was taken in the night.`,
    banished: (name: string) => `${name} was banished.`,
    banishedResult: publicBanishmentResult,
    banishedRole: (role: 'traitor' | 'faithful') =>
      `Their role was ${role === 'traitor' ? 'Traitor' : 'Faithful'}.`,
    noVotesAnnouncement: 'No votes were cast. Nobody is banished.',
    voteResults: 'Votes revealed',
    voteTally: (count: number, target: string) =>
      `${count} ${count === 1 ? 'vote' : 'votes'} for ${target}.`,
    voteCircleHeading: 'The voting circle',
    voteCircleInstruction:
      'Expand the card below to full screen and show it to the group when it is your turn.',
    voteCircleCardLabel: 'You voted for',
    voteCircleFullScreen: 'Show your vote card full screen',
    voteCircleCloseCard: 'Close vote card',
    voteCircleOrientationHint: 'Turn your phone sideways to show the group',
    voteCircleYourTurn:
      'It’s your turn. Say who you voted for and why, then reveal your card.',
    voteCircleWaitingFor: (name: string) =>
      `${name} is speaking now. Listen to their reason.`,
    voteCircleEveryoneDone: 'Everyone has shared their vote.',
    voteCircleRevealButton: 'I’ve said who I voted for and why',
    voteCircleTally: 'Tally so far',
    voteCircleNoVotesYet: 'No votes have been revealed yet.',
    conversationPromptsTitle: 'Conversation prompts',
    voteRevealFailed:
      'Your vote could not be revealed. Check your connection and try again.',
    voteReveal: (voter: string, target: string) =>
      `${voter} voted to banish ${target}.`,
    resultTraitors: 'The Traitors win.',
    resultFaithful: 'The Faithful win.',
    privateScreen:
      'Your private screen stays hidden until you confirm you are shielded.',
    paused: 'The game is paused. Keep this screen private.',
    votesProgress: (done: number, total: number) =>
      `${done} of ${total} have voted`,
    readyProgress: (done: number, total: number) =>
      `${done} of ${total} are ready`,
    readyFailed: 'We could not mark you as ready. Tap Done to try again.',
    playerOutcome: (
      winner: 'traitor' | 'faithful',
      role: 'traitor' | 'faithful',
    ) => {
      const roleLabel =
        role === 'traitor' ? 'a Traitor' : 'one of the Faithful';
      if (winner === role) return `You won as ${roleLabel}.`;
      const winningTeam = winner === 'traitor' ? 'Traitors' : 'Faithful';
      return `The ${winningTeam} won. You were ${roleLabel}.`;
    },
    secondsRemaining: (seconds: number) => `${seconds} seconds remaining`,
    timeLeft: 'Time left',
    potSummary: (players: number, unit: string, pot: number) =>
      `${players} players in this game · ${unit} at stake: ${pot}`,
    prizePotLabel: 'Prize pot',
    prizePot: (pot: number, unit: string) => `${pot} ${unit}`,
    playersHeading: 'Players',
    playerPlaying: 'Playing',
    playerOut: 'Out',
    playerOutRole: (role: 'traitor' | 'faithful') =>
      `Out, ${role === 'traitor' ? 'Traitor' : 'Faithful'}`,
    personalTakenFate:
      "You were taken in the night. You're out, but you can keep watching.",
    personalOutFate: "You're out. You can watch, but you can't vote or choose.",
    awayResyncHeading: 'Getting back in sync',
    awayResyncing:
      'Checking the latest game state. Your previous screen is hidden until it is current.',
    awayResyncFailed:
      'We could not reconnect to the latest game state. Your previous screen is still hidden.',
    awayCardHeading: 'While you were away',
    awayCardNoUpdates: 'No public updates were recorded while you were away.',
    awayCardReturn: 'Back to the game',
    latestUpdates: 'Latest updates',
    publicLogDeviceRecovered: (name: string) => `${name} moved to a new device`,
    publicLogPinReset: (name: string) => `${name}’s PIN was reset`,
    publicLogDawn: (victims: string[]) =>
      victims.length
        ? victims.map((name) => `${name} was taken in the night.`).join(' ')
        : 'No one was taken.',
    publicLogBanishment: (name: string) => `${name} was banished.`,
    publicLogSeatDeparted: (name: string) => `${name} was marked as departed.`,
    publicLogScheduleShift: (minutes: number) =>
      `The schedule has been shifted by ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`,
    publicLogCoordinatorUndo: 'The coordinator reversed the last action.',
    publicLogFinished: publicGameResult,
    rehearseAgain: 'Practise again',
    backToStart: 'Back to start',
    noPublicUpdates: 'No public updates yet.',
    notesButton: 'Notes',
    notesHeading: 'Notes',
    notesPrivateIntro: 'Only you can see your notes.',
    notesTeamEmpty: 'No team messages yet.',
    notesLabel: 'Write a note',
    notesPlaceholder: 'Add a private note',
    notesSave: 'Save note',
    notesSend: 'Send note',
    notesSaved: 'Saved on this device.',
    notesSent: 'Sent to your team.',
    notesFailed: 'That note could not be saved. Try again.',
    notesDone: 'Done',
    roomNote:
      'The organiser will move the game forward. Keep your phone close and your screen private.',
    organiserControls: 'Organiser controls',
    organiserMoveOn: 'Move everyone on',
    organiserConfirmMoveOn: (count: number) =>
      `${count} ${count === 1 ? "player hasn't" : "players haven't"} finished. Move everyone on anyway?`,
    organiserConfirm: 'Move everyone on',
    organiserKeepWaiting: 'Keep waiting',
    rehearsalControls: 'Rehearsal',
    nextRehearsalStep: 'Next step',
    rehearsalWatch: {
      DEBATE: 'The remaining players are talking it over now.',
      VOTE: 'The remaining players are voting now.',
      VERDICT: 'The remaining players are seeing the result now.',
      SHADOW:
        'The remaining players are making their private night choices now.',
      DAWN: 'The remaining players are seeing who was taken in the night.',
      ENDGAME:
        'The remaining players are deciding whether to end the game now.',
      FINAL_VOTE:
        'The remaining players are deciding whether to end the game now.',
      FINAL_BANISH: 'The remaining players are voting now.',
      FINISHED: "The game is complete. Everyone's roles are revealed.",
    },
    guideTitle: 'How this step works',
    guideTitles: {
      start: 'Your practice game',
      role: 'Your role',
      conversation: 'The conversation',
      mission: 'The mission',
      vote: 'The vote',
      verdict: 'The verdict',
      night: 'Night',
      dawn: 'Dawn',
      notes: 'Notes',
      endgame: 'Endgame',
      finalVote: 'End or continue',
      finalBanish: 'The final vote',
      complete: 'Game complete',
    },
    coachingTips: {
      start: 'You control the pace of this practice game.',
      role: 'Keep your role secret.',
      conversation: 'In a real game, people argue their case out loud now.',
      mission: 'In a real game, everyone works together.',
      vote: 'In a real game, explain the evidence behind your choice.',
      verdict:
        "Real players would be watching each other's faces as names are read out.",
      night: 'Keep your phone shielded while you choose.',
      dawn: 'In a real game, the group reacts to the news together.',
      notes: 'Write down anything you want to remember before the next step.',
      endgame: 'In a real game, discuss the risk before choosing.',
      finalVote: 'In a real game, discuss the risk before choosing.',
      finalBanish: 'One more banishment could change the outcome.',
      complete: 'You can practise again whenever you like.',
    },
    commentary: {
      noBanishment: 'Nobody has been banished yet.',
      conversation: (day: number, alive: number, last: string) =>
        `Day ${day}. ${alive} players remain. ${last}`,
      lastBanished: (name: string) => `${name} was banished last.`,
      taken: (names: string[]) =>
        names.length
          ? `${names.join(' and ')} ${names.length === 1 ? 'was' : 'were'} taken in the night.`
          : 'Nobody was taken in the night.',
      morning: (names: string[]) =>
        names.length
          ? `Morning. ${names.join(' and ')} ${names.length === 1 ? 'was' : 'were'} taken in the night.`
          : 'Morning. Nobody was taken in the night.',
      vote: 'Vote for the player you think is a Traitor.',
      night: (night: number) =>
        `Night ${night}. Everyone answers privately at the same moment, so nobody can tell who is choosing.`,
      banished: (name: string, role?: 'traitor' | 'faithful') =>
        `${name} has been banished.${role ? ` They were ${role === 'faithful' ? 'one of the Faithful' : 'a Traitor'}.` : ''}`,
      afterVerdict: (alive: number) =>
        `${alive} players remain. Night falls next.`,
      result: (winner: 'traitor' | 'faithful') =>
        `The ${winner === 'traitor' ? 'Traitors' : 'Faithful'} win.`,
      complete: 'Game complete.',
      mission: 'Work together on the mission.',
    },
    guideGotIt: 'Got it',
    whatsThis: "What's this?",
    rehearsalGuide: {
      start:
        "This is a practice game. Computer players fill the other seats, and nothing here is real. Each step explains itself; tap Next step when you're ready.",
      role: 'Everyone is secretly dealt a role: Traitor or Faithful. Shield your screen, then hold the seal to see yours. Let go and it hides.',
      conversation:
        'Everyone talks it over. Who is acting suspiciously, and why? In a real game this lasts as long as the organiser sets.',
      mission:
        'Work together to complete the mission. Your organiser records the result and any prize earned.',
      vote: 'Everyone secretly votes for the player they think is a Traitor. Votes are revealed one by one once everyone has voted.',
      verdict:
        'The player with the most votes is banished, and their role is revealed to everyone.',
      night:
        'Night falls. The Traitors secretly choose someone to take. Everyone sees a private screen at the same moment, so nobody can tell who is choosing.',
      dawn: 'Morning. Everyone finds out who was taken in the night, then a new day begins.',
      notes: 'Use this space to jot down thoughts, reminders, or theories.',
      endgame:
        'Choose whether to end the game or banish again. The final result depends on who remains.',
      finalVote:
        'Everyone secretly decides whether to end the game or continue playing.',
      finalBanish:
        'The remaining players vote to banish someone before the final result.',
      complete:
        'The Faithful win by banishing every Traitor. The Traitors win if any of them make it to the end. Every role is now revealed.',
    },
    rehearsalGuideCards: {
      start:
        'A practice game with computer players. Try each step at your own pace.',
      role: 'Keep your screen covered while you reveal your role.',
      conversation: 'Share what you have noticed before the vote.',
      mission: 'Work as a group on the challenge.',
      vote: 'Choose your suspect privately.',
      verdict: 'Watch the votes and result appear for everyone.',
      night: 'Make your choice while the screen is shielded.',
      dawn: 'The day resumes after the night announcement.',
      notes: 'Jot down thoughts or reminders to revisit later.',
      endgame: 'Discuss whether the group is ready to finish.',
      finalVote: 'Read the stakes, then make your choice.',
      finalBanish: 'Review the remaining players before choosing.',
      complete: 'See how the game ended.',
    },
    moveOnFailed: 'This step cannot move on yet. Try again in a moment.',
    shieldHeading: 'Shield your screen',
    shieldDetail: 'Turn away and cover your phone.',
    countdown: (seconds: number) => `Ready in ${seconds}`,
    shieldReady: 'You can continue when you are ready.',
    shieldConfirming: 'Confirming…',
    shieldConfirm: 'I’m shielded',
    shieldRetry: 'We could not confirm your privacy yet. Try again.',
    holdHeading: 'Hold to reveal',
    holdPending: 'Keep holding to see your private screen.',
    holdRelease: 'Release at any time to hide your private screen.',
    holdLabel: 'Hold the seal to see your role',
    releaseLabel: 'Release to hide your private screen',
    holdKeep: 'Keep holding',
    holdText: 'Hold',
    holdInstructions: 'Hold to reveal. Let go to hide.',
    privateUnavailable: 'Private details are not available yet.',
    privateLoading: 'Opening your private screen…',
    privateRestore: 'Tap to see your private screen again',
    privateError:
      'The private view could not be opened. Release and try again.',
    privateRole: 'Your private role',
    roleTraitor: 'Traitor',
    roleFaithful: 'Faithful',
    roleUnknown: 'Your role',
    choosePlayer: 'Choose a player',
    votePrompt: 'Who do you vote to banish?',
    tieRevotePrompt: (names: string[]) => {
      const tiedNames =
        names.length === 2
          ? `${names[0]} and ${names[1]}`
          : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
      return `It's a tie between ${tiedNames}. Vote again, choosing between them.`;
    },
    shadowTraitorPrompt: 'Who will the Traitors take tonight?',
    shadowFaithfulPrompt: 'Who do you think the Traitors will take tonight?',
    firstChoice: 'First choice',
    secondChoice: 'Second choice',
    shadowFaithfulStatus: 'Your answer stays private',
    shadowWaiting: 'The Traitors are choosing.',
    shadowPick: (name: string, target: string) => `${name} picked: ${target}`,
    murderSlotStatus: (slot: 1 | 2, status: string) =>
      `${slot === 1 ? 'First choice' : 'Second choice'}: ${status}`,
    murderSlotTitle: (cycle: number, slot: 1 | 2) =>
      `Night ${cycle} · ${slot === 1 ? 'First choice' : 'Second choice'}`,
    murderSlotOutcome: (
      outcome:
        'murdered' | 'protected' | 'no-target' | 'cancelled' | 'game-ended',
      target: string | null,
    ) => {
      if (outcome === 'murdered' && target) return `${target} was taken.`;
      if (outcome === 'protected' && target) return `${target} was protected.`;
      if (outcome === 'cancelled') return 'This murder was cancelled.';
      if (outcome === 'game-ended') return 'The game ended before this murder.';
      return 'No target was chosen.';
    },
    doubleMurderReason:
      'Tonight the Traitors take two players, so everyone answers two questions.',
    unanimousNoDecision: 'No decision yet. One more round of choosing tonight.',
    finalDecisionUnanimous: (count: number) =>
      `${count} players remain. If everyone chooses End the game, it ends now: the Faithful win if no Traitor is left, otherwise the Traitors win. If anyone chooses Continue, you vote to banish one more.`,
    finalDecisionMajority: (count: number) =>
      `${count} players remain. If a majority chooses End the game, it ends now: the Faithful win if no Traitor is left, otherwise the Traitors win. Otherwise, you vote to banish one more.`,
    finalContinue:
      'Not everyone chose to end the game, so one more player will be banished. Vote now.',
    murderSlotPick: (picker: string, target: string, round: number) =>
      `${picker} · ${round === 1 ? 'First pick' : 'Final pick'}: ${target}`,
    waitingForEveryone: 'Thanks. Waiting for everyone.',
    everyoneVotedRehearsal:
      'Everyone has voted. Tap Next step to see the result.',
    everyoneVotedOrganiser:
      "Everyone has voted. Tap Move everyone on when you're ready.",
    everyoneVotedPlayer: 'Everyone has voted. The result is coming.',
    voteVoted: 'Voted',
    voteWaiting: 'Waiting',
    voteProgressLabel: 'Vote progress',
    movingOn: 'Moving on...',
    chooseOption: 'Choose an option',
    finalDecision: 'Make the final decision',
    reviewChoice: 'Review this choice',
    yourPick: (name: string) => `Your pick: ${name}`,
    confirmChoice: 'Confirm this choice?',
    recording: 'Recording…',
    confirm: 'Confirm',
    chooseAgain: 'Choose again',
    recorded: 'Your choice has been recorded.',
    chooseSomeoneElse: 'Please choose someone else.',
    voteNotRecorded:
      'Your vote was not recorded. The game may have moved on; please try again.',
    choiceNotRecorded:
      'Your choice was not recorded. The game may have moved on; please try again.',
    endGame: 'End the game',
    continueGame: 'Continue playing',
    installButton: 'Install as app',
    installInstructions: 'Add this site to your Home Screen',
    fullscreen: 'Full screen',
    fullscreenUnavailable:
      'Full screen could not be enabled. Use your browser settings instead.',
    wakeLockFallback:
      'Your screen may lock during play. Tap it to keep the game visible.',
  },
  notFound: {
    heading: 'Page not found',
    body: 'We could not find that page. It may have moved, or the address may be mistyped.',
    back: 'Go to the home page',
  },
} as const;
