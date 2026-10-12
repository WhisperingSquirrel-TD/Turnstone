module.exports = {
  ci: {
    collect: { url: ['http://localhost:80/', 'http://localhost:80/play'], numberOfRuns: 1 },
    assert: { assertions: { 'categories:accessibility': ['error', { minScore: 1 }] } },
    upload: { target: 'filesystem', outputDir: 'generated-artifacts/lighthouse' },
  },
};
