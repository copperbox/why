// Story panel: a dumb renderer over the story payload (`why blame --json`,
// schemas/story.schema.json). Every semantic arrives precomputed — the hedge
// is baked into renderedRationale (displayed verbatim, never re-derived) and
// the expired-constraint blast radius arrives as `downstream` — so this file
// only lays cards out. Exported as a pure (document, story) → element
// function so the DOM smoke test can drive it without a browser.

/** Same vocabulary the engine precomputes into coverage spans; the contract
 * doc says stories derive theirs the same way from type + status. */
export function glyphFor(type, status) {
  if (type === "question") return "?";
  if (status === "expired" || status === "superseded") return "⚠";
  return "●";
}

export function formatTarget(target) {
  if (!target.lines) return target.path;
  const { start, end } = target.lines;
  return `${target.path}:${start}${end === start ? "" : `-${end}`}`;
}

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function isExpiredConstraint(block) {
  return block.type === "constraint" && block.status === "expired";
}

function badge(doc, className, text) {
  return el(doc, "span", `badge ${className}`, text);
}

const EDGE_LABELS = [
  ["becauseOf", "because of"],
  ["insteadOf", "instead of"],
  ["supersededBy", "superseded by"],
];

function renderCard(doc, block, isWarning) {
  const expired = isExpiredConstraint(block);
  const classes = ["card", `type-${block.type}`];
  if (expired) classes.push("expired");
  if (isWarning) classes.push("warning");
  const card = el(doc, "article", classes.join(" "));

  const head = el(doc, "header", "card-head");
  head.append(el(doc, "span", `glyph${expired ? " glyph-warn" : ""}`, glyphFor(block.type, block.status)));
  head.append(el(doc, "strong", "card-title", block.title));
  head.append(badge(doc, "type", block.type));
  if (expired) {
    head.append(badge(doc, "loud", `EXPIRED ${block.expired_on ?? "(date unknown)"}`));
  } else if (block.status !== undefined) {
    head.append(badge(doc, `status status-${block.status}`, block.status));
  }
  if (block.happened_on !== undefined) head.append(badge(doc, "date", block.happened_on));
  if (block.type !== "question" && block.confidence !== undefined) {
    head.append(badge(doc, `conf conf-${block.confidence}`, block.confidence));
  }
  card.append(head);

  // Display verbatim: the mandatory hedge prefix is already in the data.
  if (block.renderedRationale !== "") {
    card.append(el(doc, "p", `rationale${block.hedged ? " hedged" : ""}`, block.renderedRationale));
  }

  for (const [key, label] of EDGE_LABELS) {
    const edges = block.edges[key];
    if (edges.length === 0) continue;
    const row = el(doc, "div", "edges");
    row.append(el(doc, "span", "edge-label", label));
    const list = el(doc, "ul", "edge-list");
    for (const edge of edges) {
      const suffix = edge.type === undefined ? "" : ` (${edge.type}${edge.status === undefined ? "" : ` — ${edge.status}`})`;
      list.append(el(doc, "li", "edge", `${edge.title}${suffix}`));
    }
    row.append(list);
    card.append(row);
  }

  for (const decision of block.downstream) {
    card.append(el(doc, "p", "scar", `→ downstream decision "${decision.title}" may now be scar tissue.`));
  }

  if (block.citations.length > 0) {
    const list = el(doc, "ul", "citations");
    for (const citation of block.citations) {
      const item = el(doc, "li");
      const link = el(doc, "a", "citation", citation.label);
      link.href = citation.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      item.append(link);
      list.append(item);
    }
    card.append(list);
  }
  return card;
}

/** Render one story payload into a detached element the caller mounts. */
export function renderStoryPanel(doc, story) {
  const root = el(doc, "section", "story");
  root.append(el(doc, "h2", "story-target", story.span ?? formatTarget(story.target)));
  if (story.hits.length === 0) {
    root.append(el(doc, "p", "story-empty", `No concepts anchor ${formatTarget(story.target)}.`));
  }
  for (const hit of story.hits) root.append(renderCard(doc, hit, false));
  for (const warning of story.warnings) root.append(renderCard(doc, warning, true));
  if (story.hits.length === 0 && story.nearby.length > 0) {
    root.append(el(doc, "h3", "nearby-head", "Anchored concepts nearby (nearest first)"));
    const list = el(doc, "ul", "nearby");
    for (const near of story.nearby) {
      const anchor = near.anchor.lines === undefined ? near.anchor.path : `${near.anchor.path}:${near.anchor.lines}`;
      list.append(el(doc, "li", "nearby-item", `${glyphFor(near.type, near.status)} ${near.title} — ${near.type} · ${anchor}`));
    }
    root.append(list);
  }
  return root;
}
