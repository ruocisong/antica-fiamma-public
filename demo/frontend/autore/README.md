# Static Autore Pages

Generated static author and work pages for the authority layer.

These pages mirror the runtime authority data but are deployed as standalone HTML. They must be regenerated and published whenever author/work trees, author counts, static copy, or static page routing changes.

Deployment note: Pages builds must include `autore/**`; otherwise `authority.html` can link to pages that never reach live.
