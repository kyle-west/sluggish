const diff2html = require('diff2html');

function autoTree (list, filter = x => x) {
  const tree = {}

  list.forEach(leaf => {
    if (filter(leaf)) {
      const branches = leaf.split('-')
      const trunc = branches.slice(0, branches.length - 1).join('-')
      tree[trunc] = tree[trunc] || []
      tree[trunc].push(leaf)
    }
  })

  return Object.entries(tree).map(([group, apps]) => apps.length > 1 ? { group, apps } : apps[0])
}

function parseDiff (raw, rhs, lhs) {
  const diffJson = diff2html.parse(raw);
  const diffHtml = diff2html.html(diffJson, {
    drawFileList: false,
    matching: 'lines',
    outputFormat: 'side-by-side'
  });
  return diffHtml
}

module.exports = {
  autoTree,
  parseDiff
}