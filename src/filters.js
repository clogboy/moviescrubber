// Domain-specific filters for search and link checking
// Each domain can have blacklist (excluded patterns) and whitelist (required patterns)

export const DOMAIN_FILTERS = {
  'netflix.com': {
    blacklist: [
//      'tudum',           // Newsletter site
//      'newsletter',          // Newsletter pages
//      '/browse',             // Browse pages
//      '/latest',             // Latest pages
//      '/help',               // Help pages
//      '/account'             // Account pages
    ],
    whitelist: [
      '/nl/title/',          // Netherlands region pages
      '/nl-en/title/'              // NL English pages
    ],
    description: 'Netflix: only title and NL region pages'
  },

  'hbomax.com': {
    blacklist: [
//      '/subscribe',          // Subscribe pages
//      '/help',               // Help pages
//      '/account'             // Account pages
    ],
    whitelist: [
//      '/series/',            // Series pages
        'com/movies/',            // Movie pages
//      '/feature/'            // Feature pages
    ],
    description: 'HBO Max: only content pages'
  }

  // Add more domains here as needed
};

// Check if a URL passes filters for its domain
export function shouldCheckLink(url, domain) {
  const filters = DOMAIN_FILTERS[domain];

  // No filters defined = allow everything
  if (!filters) {
    return true;
  }

  // Check blacklist first (if any pattern matches, reject)
  if (filters.blacklist && filters.blacklist.length > 0) {
    for (const pattern of filters.blacklist) {
      if (url.includes(pattern)) {
        console.log(`❌ Blacklist: ${url} (matches: ${pattern})`);
        return false;
      }
    }
  }

  // Check whitelist (if defined, at least one pattern must match)
  if (filters.whitelist && filters.whitelist.length > 0) {
    let matchesWhitelist = false;

    for (const pattern of filters.whitelist) {
      if (url.includes(pattern)) {
        matchesWhitelist = true;
        break;
      }
    }

    if (!matchesWhitelist) {
      console.log(`❌ Whitelist: ${url} (no match in whitelist)`);
      return false;
    }
  }

  // Passed all filters
  return true;
}

// Get filter info for logging/debugging
export function getFilterInfo(domain) {
  const filters = DOMAIN_FILTERS[domain];
  if (!filters) {
    return `No filters defined for ${domain}`;
  }

  let info = filters.description + '\n';

  if (filters.blacklist && filters.blacklist.length > 0) {
    info += `  Blacklist: ${filters.blacklist.join(', ')}\n`;
  }

  if (filters.whitelist && filters.whitelist.length > 0) {
    info += `  Whitelist: ${filters.whitelist.join(', ')}\n`;
  }

  return info;
}

// Get all configured domains
export function getFilteredDomains() {
  return Object.keys(DOMAIN_FILTERS);
}

// Validate if a domain should use filters
export function hasFilters(domain) {
  return DOMAIN_FILTERS.hasOwnProperty(domain);
}

// Build Google search query with filters
export function buildFilteredSearchQuery(title, domains) {
  const siteParts = [];

  for (const domain of domains) {
    const filters = DOMAIN_FILTERS[domain];

    if (filters && filters.whitelist && filters.whitelist.length > 0) {
      // For domains with whitelist: search specific paths
      const paths = filters.whitelist.map(path =>
        `site:${domain}${path}`
      ).join(' OR ');
      siteParts.push(`(${paths})`);
    } else {
      // For domains without filters: search entire domain
      siteParts.push(`site:${domain}`);
    }
  }

  const sitePart = siteParts.join(' OR ');

  // Add blacklist terms globally
  const blacklistTerms = [];
  for (const domain of domains) {
    const filters = DOMAIN_FILTERS[domain];
    if (filters && filters.blacklist) {
      blacklistTerms.push(...filters.blacklist);
    }
  }

  // Remove duplicates
  const uniqueBlacklist = [...new Set(blacklistTerms)];
  const blacklistPart = uniqueBlacklist.length > 0
    ? ' ' + uniqueBlacklist.map(term => `-"${term}"`).join(' ')
    : '';

  return `"${title}" (${sitePart})${blacklistPart}`;
}
