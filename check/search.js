/* SponsorScope public company check.
   Matches a typed name against the Home Office register already served
   at WORKER_URL/sponsors (the same feed jobs.html uses). */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SponsorCheck = api;
})(typeof window !== 'undefined' ? window : null, function () {
  var LEGAL = {
    limited: 1, ltd: 1, plc: 1, llp: 1, lp: 1, inc: 1, incorporated: 1,
    uk: 1, the: 1, co: 1, company: 1
  };

  function words(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean);
  }

  function letterOf(rating) {
    var s = String(rating || '').toLowerCase();
    if (s.indexOf('b rating') !== -1) return 'B';
    if (s.indexOf('provisional') !== -1) return 'Provisional';
    if (s.indexOf('a rating') !== -1 || s.indexOf('a (premium)') !== -1 || s.indexOf('a (sme') !== -1) return 'A';
    return 'Other';
  }

  function summaryOf(routes) {
    var hasA = false;
    var hasB = false;
    var hasProvisional = false;
    for (var i = 0; i < routes.length; i++) {
      if (routes[i].letter === 'A') hasA = true;
      else if (routes[i].letter === 'B') hasB = true;
      else if (routes[i].letter === 'Provisional') hasProvisional = true;
    }
    if (hasB && hasA) return 'mixed';
    if (hasB) return 'B';
    if (hasA) return 'A';
    if (hasProvisional) return 'provisional';
    return 'other';
  }

  function topValue(counts) {
    var best = '';
    var bestN = 0;
    counts.forEach(function (n, value) {
      if (!value) return;
      if (n > bestN) {
        best = value;
        bestN = n;
      }
    });
    return best;
  }

  function buildIndex(rows) {
    var map = new Map();
    (rows || []).forEach(function (row) {
      var name = String(row && row.n || '').trim();
      if (!name) return;
      var company = map.get(name);
      if (!company) {
        company = { name: name, towns: new Map(), counties: new Map(), routes: new Map() };
        map.set(name, company);
      }
      var town = String(row.t || '').trim();
      var county = String(row.c || '').trim();
      if (town) company.towns.set(town, (company.towns.get(town) || 0) + 1);
      if (county) company.counties.set(county, (company.counties.get(county) || 0) + 1);
      var route = String(row.v || '').trim();
      var rating = String(row.r || '').trim();
      if (!route && !rating) return;
      var key = route + '\0' + rating;
      if (!company.routes.has(key)) {
        company.routes.set(key, {
          name: route || 'Route not listed',
          rating: rating,
          letter: letterOf(rating)
        });
      }
    });

    var companies = [];
    map.forEach(function (company) {
      var routes = Array.from(company.routes.values());
      routes.sort(function (a, b) {
        return a.name.localeCompare(b.name) || a.rating.localeCompare(b.rating);
      });
      companies.push({
        name: company.name,
        town: topValue(company.towns),
        county: topValue(company.counties),
        routes: routes,
        summary: summaryOf(routes)
      });
    });
    return companies;
  }

  function coreWords(list) {
    return list.filter(function (word) { return !LEGAL[word]; });
  }

  function scoreName(name, query) {
    var nw = words(name);
    var qw = words(query);
    if (!qw.length) return 0;
    var qRaw = qw.join(' ');
    if (qRaw.length < 2) return 0;
    var n = nw.join(' ');
    var nc = coreWords(nw).join(' ');
    var qcWords = coreWords(qw);
    var qc = qcWords.join(' ');
    if (n === qRaw || (qc && nc === qc)) return 100;
    if (qc && nc.indexOf(qc + ' ') === 0) return 90;
    if (n.indexOf(qRaw + ' ') === 0) return 90;
    if (qc && qcWords.every(function (word) { return nw.indexOf(word) !== -1; })) {
      return nw[0] === qcWords[0] ? 80 : 60;
    }
    if (qw.every(function (word) { return nw.indexOf(word) !== -1; })) {
      return nw[0] === qw[0] ? 80 : 60;
    }
    return 0;
  }

  function extraWords(name, query) {
    var nw = coreWords(words(name));
    var qset = {};
    coreWords(words(query)).forEach(function (word) { qset[word] = 1; });
    var extra = 0;
    nw.forEach(function (word) { if (!qset[word]) extra++; });
    return extra;
  }

  function searchCompanies(companies, query, limit) {
    var cap = limit || 8;
    var scored = [];
    (companies || []).forEach(function (company) {
      var score = scoreName(company.name, query);
      if (score > 0) scored.push({ company: company, score: score });
    });
    scored.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      var extra = extraWords(a.company.name, query) - extraWords(b.company.name, query);
      if (extra) return extra;
      if (a.company.name.length !== b.company.name.length) return a.company.name.length - b.company.name.length;
      return a.company.name.localeCompare(b.company.name);
    });
    return { total: scored.length, matches: scored.slice(0, cap) };
  }

  return {
    letterOf: letterOf,
    buildIndex: buildIndex,
    scoreName: scoreName,
    searchCompanies: searchCompanies
  };
});
