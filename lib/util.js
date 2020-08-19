const { diff } = require('./heroku-slugs')

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

function parseDiff (raw, lhs, rhs) {
  const replacedLines = []
  raw.split('\n').forEach(line => {
    let replacedLine = line;
    replacedLine = replacedLine.replace(/^</, lhs)
    replacedLine = replacedLine.replace(/^>/, rhs)
    replacedLine = replacedLine.replace(/</g, '&lt;')
    replacedLine = replacedLine.replace(/>/g, '&gt;')
    replacedLines.push(replacedLine)
  })
  return replacedLines
}

module.exports = {
  autoTree,
  parseDiff
}