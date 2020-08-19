const { mkdirSync, existsSync } = require('fs')
const { resolve } = require('path')
const { execSync, spawn } = require('child_process')
const { autoTree, parseDiff } = require('./util')

const heroku = (cmd) => JSON.parse(execSync(`heroku ${cmd} --json`))

function fetchAssociatedApps (org) {
  let cmd = 'apps'
  if (org) {
    cmd += ` --org ${org}`
  }
  return heroku(cmd)
}

function fetchApps () {
  const personal = fetchAssociatedApps()
  const orgApps = []
  
  heroku('orgs').forEach(({ name }) => {
    fetchAssociatedApps(name).forEach((app) => orgApps.push(app))
  })

  const all = [...personal, ...orgApps].map(({ name, organization }) => name)

  return autoTree(all, (x) => !/-\d+$/.test(x))
}


function getAll (app) {
  const raw = execSync(`heroku slugs -a ${app}`).toString()
  return raw.split('\n').slice(1).map(line => line.split(/:\s+/)).map(([version, hash]) => ({version, hash}))
}

function downloadSlug(app, hash, onUpdate = () => {}) {
  const DLFolder = resolve('.', 'slugs', hash)
  return new Promise(((resolve, reject) => {
    if (existsSync(DLFolder)) {
      resolve()
    } else {
      mkdirSync(DLFolder, { recursive: true })
      const dl = spawn('heroku', ['slugs:download', hash, '-a', app], { cwd: DLFolder })
    
      dl.stdout.on('data', (data) => {
        onUpdate(`stdout: ${data}`);
      });
      
      dl.stderr.on('data', (data) => {
        onUpdate(`stderr: ${data}`);
      });
      
      dl.on('close', (code) => {
        console.log(`Download of ${hash} exited with code ${code}`);
        code === 0 ? resolve(dataLines) : reject()
      });
    }
  }))
}

const excludeList = [
  'build',
  'dist',
  'node_modules',
]

function diff (app, first, second) {
  // diff -r --exclude=build --exclude=dist --exclude=node_modules my-app-name-v107/app/ my-app-name-v108/app/
  
  const DLBaseFolder = resolve('.', 'slugs') // does NOT end in slash
  return new Promise(((resolve, reject) => {
    const args = ['-ur']
    excludeList.forEach(folder => args.push(`--exclude=${folder}`))
    args.push(`${DLBaseFolder}/${second.hash}/${app}/app/`)
    args.push(`${DLBaseFolder}/${first.hash}/${app}/app/`)

    console.log(`diff ${args.join(' ')}`)

    try {
      execSync(`diff ${args.join(' ')}`).toString()
      resolve('No changes')
    } catch ({ stdout }) {
      resolve(parseDiff(stdout.toString(), first.version, second.version)) // diffs always have an exit code of 1 if there is a difference
    }
  }))
}

module.exports = {
  fetchApps,
  getAll,
  downloadSlug,
  diff,
  computeDiffFileRoot: (app, hash) => resolve('.', 'slugs', hash, app, 'app')
}