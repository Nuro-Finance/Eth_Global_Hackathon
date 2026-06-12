/**
 * Export Decision Journal entries to JSON for D3.js visualization
 *
 * Reads all decision entry .md files, parses YAML frontmatter,
 * and outputs a graph-ready JSON structure.
 *
 * Usage: node export-decisions.js > decisions.json
 */

const fs = require('fs');
const path = require('path');

const JOURNAL_DIR = __dirname;
const OUTPUT_FILE = path.join(__dirname, 'decisions.json');

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yaml = match[1];
  const data = {};
  let currentKey = null;
  let currentList = null;

  for (const line of yaml.split('\n')) {
    // List item
    if (line.match(/^\s+-\s+/)) {
      const value = line.replace(/^\s+-\s+/, '').replace(/^"|"$/g, '');
      if (currentList) currentList.push(value);
      continue;
    }

    // Key-value pair
    const kvMatch = line.match(/^(\w[\w_]*)\s*:\s*(.*)/);
    if (kvMatch) {
      const key = kvMatch[1];
      let value = kvMatch[2].trim();

      // Check if this starts a list
      if (value === '' || value === '[]') {
        currentList = [];
        data[key] = currentList;
        currentKey = key;
        continue;
      }

      // Remove quotes
      value = value.replace(/^"|"$/g, '').replace(/^'|'$/g, '');

      // Parse types
      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      else if (/^\d+\.\d+$/.test(value)) value = parseFloat(value);
      else if (/^\d+$/.test(value)) value = parseInt(value);

      // Handle inline arrays like [tag1, tag2]
      if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
      }

      data[key] = value;
      currentList = Array.isArray(data[key]) ? data[key] : null;
      currentKey = key;
    }
  }

  return data;
}

function buildGraphData(decisions) {
  // Collect all unique file nodes
  const nodeMap = new Map();

  for (const d of decisions) {
    const allFiles = [
      ...(d.files_read || []),
      ...(d.files_modified || []),
      ...(d.files_skipped || []),
    ];

    for (const file of allFiles) {
      if (!nodeMap.has(file)) {
        // Determine group from path
        let group = 'other';
        if (file.includes('Claude Memory')) group = 'memory';
        else if (file.includes('Session_Logs')) group = 'sessions';
        else if (file.includes('Decision Journal')) group = 'decisions';
        else if (file.includes('Schema')) group = 'schema';
        else if (file.includes('Cashly_Source_Code')) group = 'source';
        else if (file.includes('Deprecated')) group = 'deprecated';

        nodeMap.set(file, {
          id: file,
          label: file.split('/').pop(),
          group,
          readCount: 0,
          modifyCount: 0,
          skipCount: 0,
        });
      }

      const node = nodeMap.get(file);
      if ((d.files_read || []).includes(file)) node.readCount++;
      if ((d.files_modified || []).includes(file)) node.modifyCount++;
      if ((d.files_skipped || []).includes(file)) node.skipCount++;
    }
  }

  // Build decision activation sequences
  const activations = decisions.map(d => ({
    id: d._filename,
    session: d.session,
    date: d.date,
    time: d.time,
    query: d.query,
    decision_path: d.decision_path,
    confidence: d.confidence,
    outcome: d.outcome,
    duration_minutes: d.duration_minutes,
    steps: [
      ...(d.files_read || []).map((f, i) => ({ node: f, type: 'read', step: i + 1 })),
      ...(d.files_modified || []).map((f, i) => ({ node: f, type: 'modify', step: (d.files_read || []).length + i + 1 })),
    ],
  }));

  // Build links from co-access patterns
  const links = [];
  const linkMap = new Map();

  for (const d of decisions) {
    const files = [...(d.files_read || []), ...(d.files_modified || [])];
    for (let i = 0; i < files.length - 1; i++) {
      const key = [files[i], files[i + 1]].sort().join('|||');
      if (!linkMap.has(key)) {
        linkMap.set(key, { source: files[i], target: files[i + 1], weight: 0 });
      }
      linkMap.get(key).weight++;
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    links: Array.from(linkMap.values()),
    decisions: activations,
    meta: {
      totalDecisions: decisions.length,
      sessions: [...new Set(decisions.map(d => d.session))],
      exportedAt: new Date().toISOString(),
    },
  };
}

// Main
const files = fs.readdirSync(JOURNAL_DIR)
  .filter(f => f.endsWith('.md') && f !== 'INDEX.md')
  .sort();

const decisions = [];
for (const file of files) {
  const content = fs.readFileSync(path.join(JOURNAL_DIR, file), 'utf8');
  const data = parseFrontmatter(content);
  if (data && data.type === 'decision') {
    data._filename = file.replace('.md', '');
    decisions.push(data);
  }
}

const graphData = buildGraphData(decisions);
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(graphData, null, 2));
console.log(`Exported ${decisions.length} decisions → ${OUTPUT_FILE}`);
console.log(`  Nodes: ${graphData.nodes.length}`);
console.log(`  Links: ${graphData.links.length}`);
console.log(`  Sessions: ${graphData.meta.sessions.join(', ')}`);
