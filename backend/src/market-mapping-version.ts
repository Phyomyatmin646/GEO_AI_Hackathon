// Bump this value only with an additive migration. PostgreSQL reads are scoped
// to the active version so corrected commodity mappings never serve legacy
// misclassified rows as current prices.
export const MARKET_MAPPING_VERSION = 'market-map-v2';
