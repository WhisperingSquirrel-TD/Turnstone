export function browserPlan(inCI) {
  return inCI
    ? { notice: null, projects: [] }
    : { notice: 'WebKit profiles run in CI', projects: ['Pixel', 'desktop'] };
}
