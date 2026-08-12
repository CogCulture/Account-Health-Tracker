/**
 * Brand classification helper: Projects vs Retainers
 *
 * PROJECTS:
 * - 4S (4S Developers)
 * - EXOTICA
 * - KELVINATOR
 * - SD (Signature Global)
 * - SANTUR
 * - HODGES
 * - KARYAN
 * - RSP
 * - PARAS
 *
 * REST: Retainers
 */

const PROJECT_KEYWORDS = [
  '4s',
  'exotica',
  'kelvinator',
  'kalvinator',
  'sd',
  'signature',
  'santur',
  'hodges',
  'karyan',
  'rsp',
  'paras'
];

export function isProjectBrand(label) {
  if (!label) return false;
  const l = String(label).toLowerCase().trim();
  return PROJECT_KEYWORDS.some(k => l === k || l.startsWith(k) || l.includes(k));
}
