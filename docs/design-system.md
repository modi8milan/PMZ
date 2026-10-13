# Design system and brand provenance

Reference inspected on 13 October 2026: [ZENOVEL website](https://zenovel.com/). The `www` alias was inaccessible through the browsing tool; the canonical non-www site and published assets were retrieved successfully.

Observed source: [website global stylesheet](https://zenovel.com/wp-content/uploads/elementor/css/post-5.css). Its Elementor globals define accent `#F59221`, secondary `#2F2F2B`, text `#474747`, warm surface `#FEF9F4`, neutral `#FAFAFA` and primary `#6EC1E4`. These are website-observed values, not a claim of a formal corporate brand manual. The orange/charcoal/warm-neutral application palette uses those exact values. Application borders, muted text and semantic green/amber/red are provisional accessible utility tokens centralized in `apps/web/app/globals.css`.

The unmodified official [footer logo SVG](https://zenovel.com/wp-content/uploads/2024/03/footer-logo-4.svg) is stored as `apps/web/public/brand/zenovel-logo.svg`, displayed on a charcoal surface. No invented emblem is used. The website references Celias and Queen fonts; those font files are not redistributed without an established licensing basis. The local Arial/Helvetica fallback is provisional; replace centrally with licensed approved company typography later.

Reusable components: Button, Card, Badge, Feedback, EmptyState, Field and Table. CSS provides a consistent 8-pixel spacing base, hierarchy, focus styles, labels, scrollable tables, keyboard skip link, live-region status, reduced-motion behavior and desktop/tablet/mobile breakpoints. Colour is paired with explicit state text. Loading, connection errors, refresh feedback and empty state are represented without fake business data.

The status screen checks actual health/readiness and never shows PostgreSQL success without a successful dependency response. The example form is explicitly a design preview and is not persisted. Owner visual acceptance remains necessary; component presence does not prove accessibility conformance.
