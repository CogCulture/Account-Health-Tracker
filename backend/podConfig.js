/**
 * podConfig.js
 * Static recipient configuration for the daily pending-jobs digest email.
 * Each team is now named after the POD it represents (see ALLOWED_TEAM_NAMES
 * in server.js), and that name is used here to look up who should receive
 * the digest for that team's clients.
 */

export const ALLOWED_TEAM_NAMES = ['POD1', 'POD2', 'PANASONIC', 'B2B', 'POD4', 'SRHU'];

// Always CC'd on every pod digest email.
const ALWAYS_CC = ['vaibhav@cogculture.agency', 'ashok@cogculture.agency', 'shourya@cogculture.agency', 'pallave@cogculture.agency', 'apoorv@cogculture.agency'];

/**
 * Scoped digest configurations for recipients who should only receive
 * reports from specific pods (and not the full company/all-team report).
 */
export const SCOPED_DIGEST_CONFIG = [
  {
    to: ['deepakshi@cogculture.agency', 'shourya@cogculture.agency', 'tanushree@cogculture.agency'],
    allowedPods: ['POD1', 'POD2', 'POD4'],
    podName: 'POD 1, POD 2 & POD 4 Summary',
  },
  {
    to: ['khushi@cogculture.agency', 'shourya@cogculture.agency', 'tanushree@cogculture.agency'],
    allowedPods: ['PANASONIC'],
    podName: 'Panasonic Summary',
  },
];

export const POD_RECIPIENTS = {
  POD1: {
    to: ['nandy@cogculture.agency', 'naveen@cogculture.agency', 'deepakshi@cogculture.agency'],
    cc: ALWAYS_CC,
  },
  POD2: {
    to: ['vishal@cogculture.agency', 'deepakshi@cogculture.agency'],
    cc: ALWAYS_CC,
  },
  PANASONIC: {
    to: ['dixitsethi@cogculture.agency', 'gitika@cogculture.agency'],
    cc: ALWAYS_CC,
  },
  B2B: {
    to: ['sunny@cogculture.agency', 'khushi@cogculture.agency'],
    cc: ALWAYS_CC,
  },
  POD4: {
    to: ['vishakh@cogculture.agency', 'vishal@cogculture.agency', 'deepakshi@cogculture.agency'],
    cc: ALWAYS_CC,
  },
  SRHU: {
    to: [],
    cc: ALWAYS_CC,
  },
};

