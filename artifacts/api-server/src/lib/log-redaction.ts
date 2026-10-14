export const loggerRedactionPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  "req.headers['x-csrf-token']",
  'req.body.pin',
  'req.body.newPin',
  'req.body.shortCode',
  'req.body.inviteToken',
  'req.body.code',
  "res.headers['set-cookie']",
] as const;
