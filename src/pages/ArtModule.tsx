import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clock3, Square } from 'lucide-react'
import KonomiApp from '../features/art/App'
import artStyles from '../features/art/styles.css?raw'
import { useRework } from '../design/rework/useRework'
import reworkArtStyles from '../styles/rework-art.css?raw'
import { ensureLinkedActivity, readActiveActivityTimer, startActivityTimer, stopActivityTimer } from '../lib/activityTime'
import './ArtModule.css'

const embeddedOverrides = `
  :host{display:block;min-height:100%;font-family:var(--font-main,Manrope,system-ui,sans-serif);--paper:var(--bg-color,#f8f6f0);--surface:var(--bg-color,#f8f6f0);--surface-raised:var(--card-bg,#fff);--surface-subtle:color-mix(in srgb,var(--card-bg,#fff) 72%,var(--bg-color,#f8f6f0));--surface-overlay:var(--card-bg,#fff);--text:var(--text-dark,#24231f);--ink:var(--text-dark,#24231f);--text-muted:var(--text-muted,#706d65);--muted:var(--text-muted,#706d65);--line:var(--border-color,#dbd7cd);--dark:var(--text-dark,#24231f)}
  .app{position:relative;min-height:100%;background:var(--paper)}.main{margin-left:0;min-height:100vh}.sidebar{display:none!important}
  .art-category-tabs{position:sticky;top:0;z-index:19;padding:10px clamp(20px,4vw,62px);border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--paper) 94%,transparent);display:flex;gap:5px;overflow-x:auto;scroll-snap-type:x proximity;overscroll-behavior-x:contain}
  .art-category-tabs button{min-width:max-content;min-height:38px;padding:0 11px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--text-muted);display:flex;align-items:center;gap:7px;font-size:11px}
  .art-category-tabs button{scroll-snap-align:start}.art-category-tabs button:hover{background:var(--surface-subtle);color:var(--text)}.art-category-tabs button.is-active{border-color:color-mix(in srgb,var(--accent) 36%,var(--line));background:color-mix(in srgb,var(--accent) 10%,var(--paper));color:var(--text)}.art-category-tabs small{font-family:'DM Mono',monospace;opacity:.65}
  .art-time-button{min-height:42px;min-width:max-content;padding:0 14px;border:1px solid color-mix(in srgb,var(--accent) 55%,var(--line));border-radius:6px;background:color-mix(in srgb,var(--accent) 8%,var(--surface-raised));color:var(--text);display:inline-flex;align-items:center;justify-content:center;gap:8px;font-size:12px;font-weight:700;box-shadow:none}.art-time-button:hover:not(:disabled):not([aria-disabled='true']){border-color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,var(--surface-raised))}.art-time-button.is-active{border-color:var(--accent);background:var(--accent);color:var(--accent-text);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 16%,transparent)}.art-time-button svg{flex:0 0 auto}.art-time-button:disabled{opacity:.52}.art-time-button[aria-disabled='true']{opacity:.72;cursor:not-allowed}
  @media(max-width:760px){.topbar{height:auto;padding-top:18px;align-items:flex-start}.top-actions{flex-wrap:wrap}}
`

const mobileArtOverrides = `
  /* Desktop default for mobile-only drawer helper */
  .m-drawer-QuickNav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px 0;
  }
  .m-drawer-stepper {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .m-drawer-stepper-label {
    font-size: 11px;
    font-weight: 700;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .m-drawer-hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
  }
  .drawer-web-search.is-duel {
    background: var(--accent) !important;
    color: var(--accent-text, #0b1116) !important;
    border-color: var(--accent) !important;
    font-weight: 700 !important;
  }

  @media (max-width: 860px) {
    :host,
    :host([data-theme^="yoridokoro-"]),
    .art-native-root,
    .app,
    .app.rw-art,
    .app.is-mobile-art,
    .main,
    .rw-art .main {
      height: auto !important;
      min-height: 0 !important;
      overflow-x: hidden !important;
      padding-bottom: 32px !important;
      display: flex !important;
      flex-direction: column !important;
    }

    /* 1. Single-row horizontal swipeable Category Strip (NEVER wraps into multiple rows!) */
    :host .art-category-tabs,
    :host([data-theme^="yoridokoro-"]) .art-category-tabs,
    :host([data-theme^="yoridokoro-"]) .rw-art .art-category-tabs {
      order: -3 !important;
      position: sticky !important;
      top: 0 !important;
      z-index: 30 !important;
      margin: 0 !important;
      padding: 8px 12px !important;
      display: flex !important;
      flex-direction: row !important;
      flex-wrap: nowrap !important;
      overflow-x: auto !important;
      overflow-y: hidden !important;
      gap: 6px !important;
      background: color-mix(in srgb, var(--paper) 95%, transparent) !important;
      backdrop-filter: blur(12px) !important;
      border-bottom: 1px solid var(--line) !important;
      scrollbar-width: none !important;
      -webkit-overflow-scrolling: touch !important;
    }
    :host .art-category-tabs::-webkit-scrollbar,
    :host([data-theme^="yoridokoro-"]) .rw-art .art-category-tabs::-webkit-scrollbar {
      display: none !important;
    }
    :host .art-category-tabs button,
    :host([data-theme^="yoridokoro-"]) .art-category-tabs button,
    :host([data-theme^="yoridokoro-"]) .rw-art .art-category-tabs button {
      flex: 0 0 auto !important;
      min-width: max-content !important;
      min-height: 34px !important;
      height: 34px !important;
      padding: 0 11px !important;
      border-radius: 999px !important;
      font-size: 12px !important;
      font-weight: 650 !important;
      gap: 6px !important;
      white-space: nowrap !important;
      border: 1px solid var(--line) !important;
      background: var(--surface-raised) !important;
      color: var(--muted) !important;
    }
    :host .art-category-tabs button.is-active,
    :host([data-theme^="yoridokoro-"]) .art-category-tabs button.is-active,
    :host([data-theme^="yoridokoro-"]) .rw-art .art-category-tabs button.is-active {
      background: var(--accent) !important;
      border-color: var(--accent) !important;
      color: var(--accent-text, #091015) !important;
      font-weight: 750 !important;
    }

    /* 2. Compact Mobile Topbar */
    :host .topbar,
    :host([data-theme^="yoridokoro-"]) .topbar,
    :host([data-theme^="yoridokoro-"]) .rw-art .topbar {
      order: -2 !important;
      min-height: 0 !important;
      height: auto !important;
      padding: 10px 12px 8px !important;
      margin: 0 !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: stretch !important;
      gap: 8px !important;
      border-bottom: 0 !important;
    }
    :host([data-theme^="yoridokoro-"]) .rw-art .topbar > div.m-art-title-block {
      display: flex !important;
      align-items: baseline !important;
      justify-content: space-between !important;
      gap: 8px !important;
    }
    :host .topbar .eyebrow,
    :host([data-theme^="yoridokoro-"]) .topbar .eyebrow {
      font-size: 9px !important;
      margin: 0 !important;
      order: 2 !important;
    }
    :host .topbar h1,
    :host([data-theme^="yoridokoro-"]) .topbar h1,
    :host([data-theme^="yoridokoro-"]) .rw-art .topbar h1 {
      font-size: 20px !important;
      line-height: 1.15 !important;
      margin: 0 !important;
      order: 1 !important;
    }
    :host .top-actions,
    :host([data-theme^="yoridokoro-"]) .top-actions,
    :host([data-theme^="yoridokoro-"]) .rw-art .top-actions {
      width: 100% !important;
      margin: 0 !important;
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 6px !important;
    }
    :host .top-actions button,
    :host([data-theme^="yoridokoro-"]) .top-actions button,
    :host .art-time-button {
      min-height: 36px !important;
      height: 36px !important;
      padding: 0 10px !important;
      font-size: 11.5px !important;
      justify-content: center !important;
      width: 100% !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
    }
    :host .top-actions kbd,
    :host .toolbar kbd,
    :host .duel-key,
    :host .duel-footer kbd {
      display: none !important;
    }

    /* 3. Ultra-compact Overview Stats Strip */
    :host .overview,
    :host([data-theme^="yoridokoro-"]) .overview,
    :host([data-theme^="yoridokoro-"]) .rw-art .overview {
      order: -1 !important;
      padding: 4px 12px 8px !important;
      margin: 0 !important;
      display: grid !important;
      grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
      gap: 6px !important;
    }
    :host .overview .stat--leader,
    :host([data-theme^="yoridokoro-"]) .rw-art .overview .stat--leader {
      display: none !important;
    }
    :host .overview .stat,
    :host([data-theme^="yoridokoro-"]) .overview .stat,
    :host([data-theme^="yoridokoro-"]) .rw-art .overview .stat {
      padding: 6px 8px !important;
      border: 1px solid var(--line) !important;
      border-radius: 8px !important;
      background: var(--surface-raised) !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: flex-start !important;
      gap: 2px !important;
    }
    :host .overview .stat-icon {
      display: none !important;
    }
    :host .overview .stat small {
      font-size: 9.5px !important;
      line-height: 1.1 !important;
    }
    :host .overview .stat strong,
    :host([data-theme^="yoridokoro-"]) .rw-art .overview .stat strong {
      font-size: 15px !important;
      line-height: 1.15 !important;
    }
    :host .overview .stat span {
      display: none !important;
    }

    /* 4. Collection Section & Toolbar */
    :host .collection,
    :host([data-theme^="yoridokoro-"]) .collection,
    :host([data-theme^="yoridokoro-"]) .rw-art .collection {
      padding: 6px 12px 32px !important;
    }
    :host .section-head {
      display: none !important;
    }
    :host .toolbar,
    :host([data-theme^="yoridokoro-"]) .rw-art .toolbar {
      display: flex !important;
      flex-wrap: wrap !important;
      gap: 6px !important;
      margin-bottom: 10px !important;
    }
    :host .toolbar .search-box,
    :host([data-theme^="yoridokoro-"]) .rw-art .toolbar .search-box {
      flex: 1 1 100% !important;
      width: 100% !important;
      min-height: 38px !important;
      height: 38px !important;
      padding: 0 10px !important;
      order: 1 !important;
    }
    :host .toolbar .search-box input {
      min-height: 36px !important;
      font-size: 13px !important;
    }
    :host .toolbar .shelf-toggle {
      order: 2 !important;
      flex: 1 1 auto !important;
      display: flex !important;
      min-height: 34px !important;
    }
    :host .toolbar .shelf-toggle button {
      flex: 1 1 50% !important;
      font-size: 11.5px !important;
      padding: 0 8px !important;
      min-height: 28px !important;
    }
    :host .toolbar .filter-button {
      order: 3 !important;
      min-height: 34px !important;
      height: 34px !important;
      padding: 0 10px !important;
      font-size: 11.5px !important;
    }
    :host .toolbar .copy-list-button {
      display: none !important;
    }
    :host .toolbar .view-toggle {
      order: 4 !important;
      min-height: 34px !important;
    }
    :host .toolbar .view-toggle button {
      min-height: 28px !important;
      width: 32px !important;
      padding: 0 !important;
    }

    /* 5. Clean 2-Column Mobile Filter Panel (No squished selects!) */
    :host .filter-panel,
    :host([data-theme^="yoridokoro-"]) .filter-panel {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 8px !important;
      padding: 12px !important;
      margin-bottom: 12px !important;
      border-radius: 12px !important;
    }
    :host .filter-panel > label:nth-child(1),
    :host .filter-panel > label:nth-child(2) {
      grid-column: 1 / -1 !important;
    }
    :host .filter-panel > label {
      display: flex !important;
      flex-direction: column !important;
      gap: 4px !important;
      min-width: 0 !important;
    }
    :host .filter-panel > label span {
      font-size: 11px !important;
    }
    :host .filter-panel select,
    :host .filter-panel input {
      width: 100% !important;
      min-width: 0 !important;
      min-height: 38px !important;
      height: 38px !important;
      padding: 6px 10px !important;
      font-size: 13px !important;
    }
    :host .filter-panel > .text-button {
      grid-column: 1 / -1 !important;
      min-height: 34px !important;
      justify-self: stretch !important;
      text-align: center !important;
      border: 1px solid var(--line) !important;
      border-radius: 8px !important;
    }

    /* 6. LETTERBOXD 4-COLUMN POSTER WALL (4 items per row across 4 columns!) */
    :host .cover-rank-groups,
    :host .cover-rank-groups--mobile {
      display: block !important;
    }
    :host .cover-grid,
    :host .cover-grid--letterboxd,
    :host([data-theme^="yoridokoro-"]) .rw-art .cover-grid,
    :host([data-theme^="yoridokoro-"]) .rw-art .cover-grid--letterboxd {
      display: grid !important;
      grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
      gap: 6px !important;
      padding: 0 !important;
      margin: 0 !important;
      list-style: none !important;
    }
    :host .cover-card,
    :host .cover-card--letterboxd,
    :host([data-theme^="yoridokoro-"]) .rw-art .cover-card {
      position: relative !important;
      border-radius: 6px !important;
      overflow: hidden !important;
      border: 1px solid rgba(255, 255, 255, 0.14) !important;
      background: var(--surface-raised) !important;
      aspect-ratio: 2 / 3 !important;
      min-height: 0 !important;
      padding: 0 !important;
      margin: 0 !important;
    }
    :host .cover-card--albums,
    :host .cover-card--songs,
    :host([data-theme^="yoridokoro-"]) .rw-art .cover-card--albums,
    :host([data-theme^="yoridokoro-"]) .rw-art .cover-card--songs {
      aspect-ratio: 1 / 1 !important;
    }
    :host .cover-card-open,
    :host([data-theme^="yoridokoro-"]) .rw-art .cover-card-open {
      width: 100% !important;
      height: 100% !important;
      padding: 0 !important;
      margin: 0 !important;
      border: 0 !important;
      display: block !important;
      position: relative !important;
    }
    :host .cover-card-art,
    :host([data-theme^="yoridokoro-"]) .rw-art .cover-card-art {
      width: 100% !important;
      height: 100% !important;
      display: block !important;
      position: relative !important;
      border-radius: 0 !important;
    }
    :host .cover-card-art .artwork,
    :host .cover-card-art .artwork img {
      width: 100% !important;
      height: 100% !important;
      object-fit: cover !important;
      border-radius: 0 !important;
      display: block !important;
    }
    :host .m-letterboxd-rank {
      position: absolute !important;
      top: 4px !important;
      left: 4px !important;
      z-index: 3 !important;
      padding: 1px 5px !important;
      border-radius: 4px !important;
      font-size: 9.5px !important;
      font-weight: 800 !important;
      line-height: 1.3 !important;
      font-variant-numeric: tabular-nums !important;
      background: rgba(8, 12, 18, 0.84) !important;
      color: rgba(255, 255, 255, 0.92) !important;
      border: 1px solid rgba(255, 255, 255, 0.16) !important;
      backdrop-filter: blur(4px) !important;
    }
    :host .m-letterboxd-rank.is-top {
      background: var(--accent) !important;
      color: var(--accent-text, #091015) !important;
      border-color: var(--accent) !important;
    }
    :host .m-letterboxd-fallback-title {
      position: absolute !important;
      inset: auto 0 0 0 !important;
      padding: 16px 5px 5px !important;
      background: linear-gradient(to top, rgba(6, 10, 15, 0.95) 20%, transparent) !important;
      color: #fff !important;
      font-size: 9.5px !important;
      font-weight: 700 !important;
      line-height: 1.2 !important;
      text-align: left !important;
      display: -webkit-box !important;
      -webkit-line-clamp: 3 !important;
      -webkit-box-orient: vertical !important;
      overflow: hidden !important;
    }

    /* 7. Mobile Ladder (List View) */
    :host .table-head {
      display: none !important;
    }
    :host .ladder-row {
      padding: 0 8px !important;
    }
    :host .ladder-open,
    :host([data-theme^="yoridokoro-"]) .rw-art .ladder-open {
      padding: 6px 4px !important;
      display: grid !important;
      grid-template-columns: 26px minmax(0, 1fr) auto !important;
      align-items: center !important;
      gap: 8px !important;
    }
    :host .details-cell,
    :host .country-cell,
    :host .record-cell,
    :host .rating-gap {
      display: none !important;
    }
    :host .work-copy strong {
      font-size: 13.5px !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
    }
    :host .work-copy small {
      font-size: 11px !important;
    }

    /* 8. Period Highlights Strip on Mobile */
    :host .period-highlights {
      margin-top: 18px !important;
      padding: 12px !important;
    }
    :host .period-card {
      flex: 0 0 230px !important;
    }

    /* 9. Mobile Item Dossier Sheet (ItemDrawer) & Modals */
    :host .overlay,
    :host .overlay--drawer,
    :host .settings-overlay,
    :host([data-theme^="yoridokoro-"]) .overlay,
    :host([data-theme^="yoridokoro-"]) .overlay--drawer {
      position: fixed !important;
      top: 56px !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 62px !important;
      height: auto !important;
      z-index: 900 !important;
      padding: 0 !important;
      display: flex !important;
      align-items: flex-end !important;
      justify-content: center !important;
      background: rgba(4, 8, 12, 0.78) !important;
      backdrop-filter: blur(6px) !important;
    }
    :host .drawer,
    :host .drawer--notebook,
    :host([data-theme^="yoridokoro-"]) .drawer,
    :host([data-theme^="yoridokoro-"]) .drawer--notebook {
      width: 100% !important;
      max-width: 100vw !important;
      height: 100% !important;
      max-height: 100% !important;
      border-radius: 16px 16px 0 0 !important;
      border: 0 !important;
      border-top: 1px solid var(--line) !important;
      display: flex !important;
      flex-direction: column !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      padding: 0 0 20px !important;
    }
    :host .m-drawer-QuickNav {
      position: sticky !important;
      top: 0 !important;
      z-index: 10 !important;
      padding: 10px 12px !important;
      background: color-mix(in srgb, var(--surface-raised) 94%, transparent) !important;
      backdrop-filter: blur(10px) !important;
      border-bottom: 1px solid var(--line) !important;
    }
    :host .drawer > .drawer-close {
      display: none !important;
    }
    :host .drawer > .artwork {
      width: 112px !important;
      height: 168px !important;
      min-height: 0 !important;
      max-height: 168px !important;
      margin: 12px auto 4px !important;
      border-radius: 8px !important;
      overflow: hidden !important;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45) !important;
      flex-shrink: 0 !important;
    }
    :host .drawer-body,
    :host([data-theme^="yoridokoro-"]) .drawer-body {
      display: flex !important;
      flex-direction: column !important;
      padding: 12px 14px !important;
      gap: 14px !important;
    }
    :host .drawer-details-column,
    :host .drawer-content-column {
      padding: 0 !important;
      border: 0 !important;
      width: 100% !important;
    }
    :host .drawer h2#item-title {
      font-size: 20px !important;
      line-height: 1.2 !important;
      margin: 4px 0 !important;
    }
    :host .metadata {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 8px 12px !important;
      margin-top: 12px !important;
      padding: 10px 12px !important;
      border-radius: 10px !important;
      background: var(--surface) !important;
      border: 1px solid var(--line) !important;
    }
    :host .item-quote {
      padding: 12px !important;
      border-radius: 10px !important;
    }
    :host .item-quote::before {
      display: none !important;
    }
    :host .item-quote blockquote {
      font-size: 14px !important;
      line-height: 1.45 !important;
      margin: 0 !important;
    }
    :host .drawer-management {
      padding: 12px 0 0 !important;
      border-top: 1px solid var(--line) !important;
    }
    :host .drawer-management h3 {
      display: none !important;
    }
    :host .drawer-management-actions {
      display: flex !important;
      flex-wrap: wrap !important;
      gap: 8px !important;
      align-items: center !important;
    }
    :host .drawer-management-main {
      display: flex !important;
      flex-wrap: wrap !important;
      gap: 6px !important;
      flex: 1 1 auto !important;
    }
    :host .drawer-management-button {
      min-height: 36px !important;
      padding: 0 11px !important;
      font-size: 12px !important;
      flex: 1 1 auto !important;
      justify-content: center !important;
    }

    /* Add / Edit / Completion Modals */
    :host .modal,
    :host .add-modal,
    :host .edit-modal,
    :host .completion-modal,
    :host([data-theme^="yoridokoro-"]) .modal {
      width: 100% !important;
      max-width: 100vw !important;
      height: 100% !important;
      max-height: 100% !important;
      margin: 0 !important;
      padding: 14px !important;
      border-radius: 16px 16px 0 0 !important;
      overflow-y: auto !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 12px !important;
    }
    :host .modal-head h2 {
      font-size: 18px !important;
    }
    :host .art-form-essentials,
    :host .field-grid {
      display: flex !important;
      flex-direction: column !important;
      gap: 10px !important;
    }
    :host .cover-picker {
      display: flex !important;
      flex-direction: row !important;
      align-items: center !important;
      gap: 12px !important;
      padding: 10px !important;
    }
    :host .cover-preview {
      width: 56px !important;
      height: 80px !important;
      flex: 0 0 56px !important;
    }

    /* 10. Mobile Duel View (Side-by-side compact cards on 1 screen!) */
    :host .duel-view,
    :host([data-theme^="yoridokoro-"]) .duel-view {
      padding: 12px !important;
      min-height: 0 !important;
    }
    :host .duel-toolbar {
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
      gap: 8px !important;
      margin-bottom: 8px !important;
    }
    :host .duel-heading h1 {
      font-size: 18px !important;
      margin: 4px 0 12px !important;
      text-align: center !important;
    }
    :host .duel-grid {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 10px !important;
      position: relative !important;
      align-items: stretch !important;
    }
    :host .duel-card {
      padding: 8px !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 8px !important;
    }
    :host .duel-card .artwork {
      aspect-ratio: 2 / 3 !important;
      width: 100% !important;
      height: auto !important;
      min-height: 0 !important;
      border-radius: 8px !important;
    }
    :host .duel-copy strong {
      font-size: 14px !important;
      line-height: 1.25 !important;
    }
    :host .duel-copy span,
    :host .duel-copy small {
      font-size: 11px !important;
    }
    :host .versus {
      display: none !important;
    }

    /* 11. Mobile Statistics View */
    :host .statistics-page,
    :host([data-theme^="yoridokoro-"]) .statistics-page {
      padding: 12px !important;
    }
    :host .statistics-summary,
    :host .statistics-grid,
    :host .statistics-primary-grid,
    :host .statistics-secondary-grid {
      display: flex !important;
      flex-direction: column !important;
      gap: 10px !important;
    }
  }
`

const shadowArtStyles=artStyles
  .replaceAll(":root[data-color-scheme='dark']",":host([data-color-scheme='dark'])")
  .replaceAll(":root:not([data-theme='keystone'])",":host(:not([data-theme='keystone']))")
  .replaceAll(":root[data-theme='keystone']",":host([data-theme='keystone'])")
  .replaceAll(':root',':host')

export default function ArtModule() {
  const rework = useRework()
  const hostRef=useRef<HTMLDivElement>(null)
  const [artMount,setArtMount]=useState<HTMLDivElement|null>(null)
  const [activityId,setActivityId]=useState(''),[timing,setTiming]=useState(false)

  useEffect(()=>{
    const host=hostRef.current
    if(!host)return
    const shadow=host.shadowRoot||host.attachShadow({mode:'open'}),style=document.createElement('style'),mount=document.createElement('div')
    // Konomi's standalone stylesheet targets :root. Inside Yoridokoro's shadow
    // boundary the equivalent root is :host, so keep every palette override active.
    style.textContent=shadowArtStyles+embeddedOverrides+reworkArtStyles+mobileArtOverrides;mount.className='art-native-root';shadow.append(style,mount)
    setArtMount(mount)
    return()=>{setArtMount(null);shadow.replaceChildren()}
  },[])

  useEffect(() => {
    const syncTheme = () => {
      if (!hostRef.current) return
      hostRef.current.dataset.theme = document.documentElement.dataset.theme
      hostRef.current.dataset.colorScheme = document.documentElement.dataset.colorScheme
      if (document.documentElement.dataset.argoImmersion) {
        hostRef.current.dataset.argoImmersion = document.documentElement.dataset.argoImmersion
      } else {
        delete hostRef.current.dataset.argoImmersion
      }
    }
    syncTheme()
    const observer = new MutationObserver(syncTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-color-scheme', 'data-argo-immersion'] })
    return () => observer.disconnect()
  }, [])

  useEffect(()=>{void ensureLinkedActivity('art','collection',{name:'Collection Art',kind:'art',color:'#b45b68'}).then(id=>{setActivityId(id);setTiming(readActiveActivityTimer()?.activityId===id)})},[])
  async function toggleTimer(){if(timing){await stopActivityTimer('Exploration de la collection Art');setTiming(false)}else if(activityId&&!readActiveActivityTimer()){startActivityTimer(activityId);setTiming(true)}}
  const timerBlocked=Boolean(readActiveActivityTimer()&&!timing)
  const timerAction=<button type="button" className={`art-time-button${timing?' is-active':''}`} onClick={toggleTimer} disabled={!activityId} aria-disabled={timerBlocked||undefined} aria-pressed={timing} title={timerBlocked?'Un autre chronomètre est déjà actif':undefined}>{timing?<Square size={15} fill="currentColor" aria-hidden="true"/>:<Clock3 size={16} aria-hidden="true"/>}<span>{timing?'Arrêter chrono':'Chrono Art'}</span></button>

  return <section className="art-module" aria-label="Art — collections et classements">
    <div ref={hostRef} className="art-native-host" />
    {artMount&&createPortal(<KonomiApp headerAction={timerAction} design={rework ? 'rework' : undefined}/>,artMount)}
  </section>
}
