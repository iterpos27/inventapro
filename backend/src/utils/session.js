export function sessionVersionMatches(tokenVersion, userVersion) {
  return Number(tokenVersion ?? 0) === Number(userVersion || 0);
}
