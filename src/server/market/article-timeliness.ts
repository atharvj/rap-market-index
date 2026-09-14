/** Publication today does not make an old release a new market event. */
export function isHistoricalRetrospective(title: string) {
  const text = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (/\b(?:in (?:hip hop|rap|music) history|on this day|this day in|throwback thursday|flashback)\b/.test(text)) return true;
  const retrospective = /\b(?:\d+ years ago|turns \d+|anniversary|looking back|revisiting|oral history)\b/.test(text);
  const currentAction = /\b(?:announces?|launches?)\b.*\b(?:tour|concert|show|reissue|remaster|edition)\b|\b(?:releases?|drops?|unveils?)\b.*\b(?:new|expanded|deluxe|remastered|reissue|edition)\b|\b(?:returns? to|re enters?|surges? on)\b.*\bcharts?\b/.test(text);
  return retrospective && !currentAction;
}
