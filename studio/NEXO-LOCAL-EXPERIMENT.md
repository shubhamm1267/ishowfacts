# Nexo Pinterest footage adapter

Pinterest search from Nexo 1.8.0 is vendored under studio/vendor/nexo with its MIT license. Axios is installed by npm ci. No external temporary package directory is required. NEXO_PACKAGE_DIR remains an optional development override.

Search runs before Instagram and stock fallback. Results are checked against the scene brief, with bounded alternate queries, cached searches, and reservations for selected clips. 360p or larger short-edge footage is accepted; HD remains preferred. HLS byte ranges are downloaded correctly and excerpts are remuxed without an extra encode. Existing local frame checks still run.

Metadata matching is not semantic object/action verification. Access can fail. Creator rights are marked unverified; downloading does not grant reuse permission. Provider provenance is retained in credits.
