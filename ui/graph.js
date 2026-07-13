// Graph tab: the bundle graph payload (schemas/graph.schema.json) drawn with
// a hand-rolled canvas force simulation — the okf-mcp `graph html` approach
// (embedded, zero dependencies), reimplemented here against the contract's
// nodes/edges shape. Type-colored nodes, relation-labeled edges, drag to pin.

export const TYPE_COLORS = {
  decision: "#5b9cf5",
  constraint: "#e2a336",
  attempt: "#8d97a5",
  incident: "#e05d5d",
  question: "#b57edc",
};

const RADIUS = 9;

function initNodes(graph, width, height) {
  // Deterministic ring seeding — stable layouts across reloads beat jitter.
  return graph.nodes.map((node, i) => {
    const angle = (2 * Math.PI * i) / graph.nodes.length;
    const ring = Math.min(width, height) / 4;
    return {
      ...node,
      x: width / 2 + ring * Math.cos(angle),
      y: height / 2 + ring * Math.sin(angle),
      vx: 0,
      vy: 0,
      pinned: false,
    };
  });
}

function tick(nodes, edges, width, height) {
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    // Pairwise repulsion.
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d2 = Math.max(dx * dx + dy * dy, 25);
      const force = 2600 / d2;
      const d = Math.sqrt(d2);
      a.vx += (dx / d) * force;
      a.vy += (dy / d) * force;
      b.vx -= (dx / d) * force;
      b.vy -= (dy / d) * force;
    }
    // Gravity toward the center.
    a.vx += (width / 2 - a.x) * 0.005;
    a.vy += (height / 2 - a.y) * 0.005;
  }
  // Edge springs.
  for (const edge of edges) {
    const dx = edge.to.x - edge.from.x;
    const dy = edge.to.y - edge.from.y;
    const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
    const force = (d - 130) * 0.02;
    edge.from.vx += (dx / d) * force;
    edge.from.vy += (dy / d) * force;
    edge.to.vx -= (dx / d) * force;
    edge.to.vy -= (dy / d) * force;
  }
  for (const node of nodes) {
    if (node.pinned) {
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    node.vx *= 0.85;
    node.vy *= 0.85;
    node.x = Math.min(Math.max(node.x + node.vx, RADIUS * 2), width - RADIUS * 2);
    node.y = Math.min(Math.max(node.y + node.vy, RADIUS * 2), height - RADIUS * 2);
  }
}

function draw(ctx, nodes, edges, width, height) {
  ctx.clearRect(0, 0, width, height);
  ctx.font = "11px system-ui, sans-serif";
  for (const edge of edges) {
    ctx.strokeStyle = "#5a6472";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(edge.from.x, edge.from.y);
    ctx.lineTo(edge.to.x, edge.to.y);
    ctx.stroke();
    // Arrowhead toward the target.
    const dx = edge.to.x - edge.from.x;
    const dy = edge.to.y - edge.from.y;
    const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
    const tipX = edge.to.x - (dx / d) * (RADIUS + 3);
    const tipY = edge.to.y - (dy / d) * (RADIUS + 3);
    ctx.fillStyle = "#5a6472";
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - (dx / d) * 7 - (dy / d) * 3.5, tipY - (dy / d) * 7 + (dx / d) * 3.5);
    ctx.lineTo(tipX - (dx / d) * 7 + (dy / d) * 3.5, tipY - (dy / d) * 7 - (dx / d) * 3.5);
    ctx.fill();
    // Relation label at the midpoint.
    ctx.fillStyle = "#8b95a5";
    ctx.textAlign = "center";
    ctx.fillText(edge.relation, (edge.from.x + edge.to.x) / 2, (edge.from.y + edge.to.y) / 2 - 4);
  }
  for (const node of nodes) {
    ctx.beginPath();
    ctx.arc(node.x, node.y, RADIUS, 0, 2 * Math.PI);
    ctx.fillStyle = TYPE_COLORS[node.type] ?? "#8d97a5";
    ctx.fill();
    if (node.status === "expired" || node.status === "superseded") {
      ctx.strokeStyle = "#ff6b6b";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    ctx.fillStyle = "#dde3ec";
    ctx.textAlign = "center";
    ctx.fillText(node.title, node.x, node.y + RADIUS + 13);
  }
}

/** Run the simulation on `canvas`; returns a stop() for teardown. */
export function renderGraph(canvas, graph) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const nodes = initNodes(graph, width, height);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges = graph.edges.map((edge) => ({
    from: byId.get(edge.from),
    to: byId.get(edge.to),
    relation: edge.relation,
  }));

  let dragging = null;
  const pos = (event) => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  canvas.onmousedown = (event) => {
    const { x, y } = pos(event);
    dragging = nodes.find((n) => (n.x - x) ** 2 + (n.y - y) ** 2 <= (RADIUS + 4) ** 2) ?? null;
    if (dragging) dragging.pinned = true;
  };
  canvas.onmousemove = (event) => {
    if (!dragging) return;
    const { x, y } = pos(event);
    dragging.x = x;
    dragging.y = y;
  };
  canvas.onmouseup = () => {
    if (dragging) dragging.pinned = false;
    dragging = null;
  };

  let running = true;
  const frame = () => {
    if (!running) return;
    tick(nodes, edges, width, height);
    draw(ctx, nodes, edges, width, height);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return () => {
    running = false;
  };
}
