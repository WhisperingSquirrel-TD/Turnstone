function date(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  )
    throw new Error('Invalid change-freeze date');
  return value;
}

export function canPromote(ranges, commitMessage, today) {
  date(today);
  if (!Array.isArray(ranges) || typeof commitMessage !== 'string')
    throw new Error('Invalid change-freeze configuration');
  for (const range of ranges) {
    if (
      !range ||
      typeof range !== 'object' ||
      date(range.start) > date(range.end)
    )
      throw new Error('Invalid change-freeze range');
  }
  return (
    commitMessage.includes('[security]') ||
    !ranges.some((range) => range.start <= today && today <= range.end)
  );
}
