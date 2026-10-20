# Rework — editorial atelier

All 25 Yoridokoro themes now use the Rework workspace composition. Appearance selects a palette, including the original Yoridokoro palette and Rework's ivory/cobalt palette. Existing application data and actions are retained. Canonical palette tokens in `applyYoridokoroTheme` drive the shared composition, component contracts and embedded Art UI; primary controls use each palette's accent text, and fields use its boundary color.

## Foundation

- Rework palette: paper #f3f1ea, raised paper #fffdf8, ink #182629, muted ink #5d6765, cobalt #284fe5, field boundary #7b827b. Other palettes supply their own equivalent tokens.
- Two text families across main routes and Art: Manrope for headings, interface text and metadata; DM Mono for keyboard hints and code. The shared application stylesheet also imports Newsreader for other themes.
- Page headings use a compact 32–48px scale without decorative subtitles or numbers. Navigation, breadcrumbs and page headings share `pageTitles.ts`. Section headings stay smaller.
- Hairlines divide sections. Surfaces use 8px corners; controls use 6px; dialogs use 12px. Avoid layers of decorative boxes.
- Compact persistent navigation, readable hover/focus labels and Ctrl/Cmd+K page search. Preserve session exit guards.

## Composition inventory

| Workspace | Composition and subordinate surfaces |
| --- | --- |
| Today | Asymmetric action/culture spread, journal/work columns, task priority tabs, focus sprint, continuity and upcoming actions |
| Study | Library heading, grouped subject board by default, list and split views, review queue, subject editor and quick start |
| Subject detail | Display title, open sections, chapter cards and subject metadata |
| Plan | Editorial heading, resume and start actions, selection cards, allocation, wizard, inline pickers and menus |
| History | Journal by default with optional calendar, periods, activities, manual entry, exercise toggle, resources and editing |
| Session | Ink timer column, preparation/work/break surfaces, checklists, technique and chapter selection, five minute choices, finish, evidence and feedback |
| Learning | Horizontal numbered chapter navigation, lessons, locked/completed states, quizzes and review |
| Analytics | Two column observation spread, coverage, distributions and disclosures |
| Reflection / logs | Step navigation, all reflection panels, mentions, prompts, journal records and details |
| Objectives | Display heading, goal cards, all grid arrangements, creation, counters, steps, memories, timers and detail page |
| Art | Gallery by default, independent list preference, category navigation, filters, periods, duels, statistics, centered artwork/notes dossier, add/edit, completion and nested menus |
| Relations | Display heading, contact index, profile, interactions, notes, archive and creation dialogs |
| Settings | Horizontal category navigation; all seven panels, theme preview, forms, toggles, source credentials, audio, export and destructive dialogs |
| Developer | Shared controls, diagnostic sections and forms |

`rework.css` owns composition. `rework-components.css` defines the cross-module control and surface contracts, including portal content. `rework-art.css` defines the same system inside the isolated Art shadow root. React structural variants live in `src/design/rework` and the relevant pages. Theme preview subscriptions share one MutationObserver, released when unused. Study and Art view preferences are stored separately per design.

Theme migration validation covers all 25 palettes in Settings and Art, with all four Art header actions on one row at desktop width. Eleven main routes are checked under Rework, Dracula and Rosé Pine Dawn, plus compact Art. Art dossiers use up to 1600px of width and the available viewport height with 24px margins; cover height responds to viewport height. Period headers and rows have an inset accent tab on hover/focus. Gallery hover/focus adds a one-pixel outer ring without resizing the cards.

## Motion and accessibility

Use short opacity/transform entrances and brief color transitions. No perpetual animation, large backdrop blur, animation library, additional font request or new runtime dependency. Static orbit geometry is an SVG. Page modules remain lazy loaded. Reduced motion removes transitions and animation, including within Art. Keep visible focus, semantic labels, existing dialog focus management and keyboard navigation.

## Validation

TypeScript, production build, 394 automated tests (including navigation search, live preview, contrast and Art dialog focus inside its shadow root). An isolated Electron profile exercises every route and 55 Rework states plus the original theme, including forms and nested Art menus. A further Art audit exercises 33 states at desktop and compact widths; its findings and remaining design work are documented in `art-rework-review.md`. Check compact widths, overflow and styled control coverage; visually inspect the resulting captures. These checks establish implementation coverage, not an Awwwards rating or a measured frame-rate guarantee.

Completed tasks are hidden on load. A newly completed task remains visible for ten seconds so it can be reopened; reopening cancels its removal. Completion remains persisted in the database. Rework task rows explicitly use paper and ink surfaces to avoid inherited quadrant colors. Zero-duration categories are omitted from the time legend.

Text fields use an eight-pixel radius, paper surface and consistent inset. Composed searches own their border and focus indicator; their input stays borderless even while focused. The same contract applies inside Art. The planner shows its Enter shortcut on the launch action. Objective hover actions use transparent 32-pixel hit areas with 16-pixel icons; their information strip has 10-pixel vertical and 12-pixel horizontal padding. Art rank headings and rows share a 20-pixel inset. Relations uses spaced, rounded contact cards and padded secondary actions. Page headings have no decorative numbering.

The quote footer uses a cobalt quotation mark, upright Manrope text, wrapping content and a discrete edit action. Rework quotes rotate every twenty seconds. Relations detail uses twelve-pixel outer corners, ten-pixel card corners, twenty-pixel profile padding and sixteen-pixel form/content padding. Timeline and note lists have no nested rounded frame; empty history does not stretch to match the adjacent forms.

Art list rows use an 82-pixel virtualized height with 16-pixel vertical padding around thumbnails. The virtualizer and CSS share the row-height contract so adjacent rows and the final border do not overlap. The original design retains its 70-pixel rows.
