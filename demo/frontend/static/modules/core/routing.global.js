(function attachDDPRouting(global) {
  const ROUTE_PREFIXES = Object.freeze({
    inferno: "inferno",
    purgatorio: "purgatorio",
    paradiso: "paradiso",
  });

  function parsePositiveInt(rawValue) {
    const value = Number(rawValue);
    if (!Number.isInteger(value) || value < 1) {
      return null;
    }
    return value;
  }

  function parseLocusValue(rawValue) {
    const normalized = String(rawValue || "").trim().toLowerCase();
    return normalized || null;
  }

  function parseSampleId(sampleId) {
    const match = String(sampleId || "").trim().toLowerCase().match(/^(inferno|purgatorio|paradiso)(\d{1,2})$/);
    if (!match) {
      return null;
    }
    return {
      sampleId: `${match[1]}${Number(match[2])}`,
      cantica: match[1],
      cantoNumber: Number(match[2]),
    };
  }

  function buildCanonicalPath(sampleId, lineNumber = null) {
    const parsedSample = parseSampleId(sampleId);
    if (!parsedSample) {
      return null;
    }
    const segments = ["", ROUTE_PREFIXES[parsedSample.cantica], String(parsedSample.cantoNumber)];
    const parsedLineNumber = parsePositiveInt(lineNumber);
    if (parsedLineNumber) {
      segments.push(String(parsedLineNumber));
    }
    return segments.join("/");
  }

  function parsePathRoute(pathname, manifestMap = null) {
    const segments = String(pathname || "")
      .split("/")
      .filter(Boolean)
      .map((segment) => segment.trim().toLowerCase());

    if (!(segments.length === 2 || segments.length === 3)) {
      return null;
    }
    if (!Object.prototype.hasOwnProperty.call(ROUTE_PREFIXES, segments[0])) {
      return null;
    }

    const cantoNumber = parsePositiveInt(segments[1]);
    const lineNumber = segments.length === 3 ? parsePositiveInt(segments[2]) : null;
    if (!cantoNumber) {
      return null;
    }
    if (segments.length === 3 && !lineNumber) {
      return null;
    }

    const sampleId = `${segments[0]}${cantoNumber}`;
    if (manifestMap && !manifestMap.has(sampleId)) {
      return null;
    }

    return {
      source: "path",
      sampleId,
      lineNumber,
      locusNormalized: parseLocusValue(new URLSearchParams(global.location.search || "").get("locus")),
      cantica: segments[0],
      cantoNumber,
    };
  }

  function parseQueryRoute(search, manifestMap = null) {
    const params = new URLSearchParams(search || "");
    const requestedSample = String(params.get("sample") || "").trim().toLowerCase();
    if (!requestedSample) {
      return null;
    }
    if (manifestMap && !manifestMap.has(requestedSample)) {
      return null;
    }
    const parsedSample = parseSampleId(requestedSample);
    if (!parsedSample) {
      return null;
    }
    return {
      source: "query",
      sampleId: parsedSample.sampleId,
      lineNumber: parsePositiveInt(params.get("line")),
      locusNormalized: parseLocusValue(params.get("locus")),
      cantica: parsedSample.cantica,
      cantoNumber: parsedSample.cantoNumber,
    };
  }

  function syncRouteMeta(url) {
    const documentRef = global.document;
    if (!documentRef) {
      return;
    }
    const absoluteHref = `${url.origin}${url.pathname}${url.search}`;
    const canonicalLink = documentRef.querySelector("link[rel='canonical']");
    const ogUrlMeta = documentRef.querySelector('meta[property="og:url"]');
    if (canonicalLink) {
      canonicalLink.setAttribute("href", absoluteHref);
    }
    if (ogUrlMeta) {
      ogUrlMeta.setAttribute("content", absoluteHref);
    }
  }

  function createShellRouting() {
    function resolveRequestedRoute(manifestMap = null) {
      const pathRoute = parsePathRoute(global.location.pathname, manifestMap);
      if (pathRoute) {
        return pathRoute;
      }
      return parseQueryRoute(global.location.search, manifestMap);
    }

    function buildCanonicalHref(sampleId, lineNumber = null, options = {}) {
      const { hash = null, locusNormalized = null } = options || {};
      const url = new URL(global.location.href);
      const canonicalPath = buildCanonicalPath(sampleId, lineNumber);
      if (canonicalPath) {
        url.pathname = canonicalPath;
        url.searchParams.delete("sample");
        url.searchParams.delete("line");
      } else {
        url.searchParams.set("sample", sampleId);
        const parsedLineNumber = parsePositiveInt(lineNumber);
        if (parsedLineNumber) {
          url.searchParams.set("line", String(parsedLineNumber));
        } else {
          url.searchParams.delete("line");
        }
      }
      const parsedLocus = parseLocusValue(locusNormalized);
      if (parsedLocus) {
        url.searchParams.set("locus", parsedLocus);
      } else {
        url.searchParams.delete("locus");
      }
      if (typeof hash === "string") {
        url.hash = hash;
      }
      return `${url.pathname}${url.search}${url.hash}`;
    }

    function updateSampleUrl(sampleId, lineNumber = null, options = {}) {
      const { hash, replace = true, locusNormalized = null } = options || {};
      const nextHref = buildCanonicalHref(sampleId, lineNumber, {
        locusNormalized,
        hash: typeof hash === "string" ? hash : global.location.hash,
      });
      const nextUrl = new URL(nextHref, global.location.origin);
      if (replace) {
        global.history.replaceState({}, "", nextUrl);
      } else {
        global.history.pushState({}, "", nextUrl);
      }
      syncRouteMeta(nextUrl);
    }

    function getRequestedSampleId(manifestMap = null) {
      return resolveRequestedRoute(manifestMap)?.sampleId || null;
    }

    function getRequestedLineNumber(currentSampleId = null, manifestMap = null) {
      const requested = resolveRequestedRoute(manifestMap);
      if (!requested) {
        return null;
      }
      if (currentSampleId && requested.sampleId !== currentSampleId) {
        return null;
      }
      return requested.lineNumber;
    }

    function getRequestedLocusNormalized(currentSampleId = null, manifestMap = null) {
      const requested = resolveRequestedRoute(manifestMap);
      if (!requested) {
        return null;
      }
      if (currentSampleId && requested.sampleId !== currentSampleId) {
        return null;
      }
      return parseLocusValue(requested.locusNormalized);
    }

    return Object.freeze({
      buildCanonicalHref,
      buildCanonicalPath,
      getRequestedLineNumber,
      getRequestedLocusNormalized,
      getRequestedSampleId,
      parsePathRoute,
      resolveRequestedRoute,
      updateSampleUrl,
    });
  }

  global.DDPRouting = Object.freeze({
    createShellRouting,
  });
})(window);
