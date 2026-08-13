export function orderedContacts(contacts = []) {
  return [...contacts].sort(
    (a, b) => (a.contactOrder ?? Number.MAX_SAFE_INTEGER) - (b.contactOrder ?? Number.MAX_SAFE_INTEGER),
  );
}

/**
 * Selects exactly one guardian contact for the given escalation round — never
 * "all guardians at once". Once every contact has been tried, hands off to the
 * institution instead of broadcasting.
 */
export function selectEscalationTarget({ contacts = [], escalationRound = 0 }) {
  const ordered = orderedContacts(contacts);
  if (escalationRound < ordered.length) {
    return {
      recipientType: "GUARDIAN",
      contact: ordered[escalationRound],
      nextEscalationRound: escalationRound + 1,
      exhausted: false,
    };
  }
  return {
    recipientType: "INSTITUTION",
    contact: null,
    nextEscalationRound: escalationRound,
    exhausted: true,
  };
}
