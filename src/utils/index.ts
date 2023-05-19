export function getPeriodName(index: i32): string {
  const periods = ["evidence", "commit", "vote", "appeal", "execution"];
  return periods.at(index) || "None";
}

export function getPhaseName(index: i32): string {
  const phases = ["staking", "generating", "drawing"];
  return phases.at(index) || "None";
}
