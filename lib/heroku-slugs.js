const { mkdirSync, existsSync, writeFile, readFileSync } = require('fs')
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
        code === 0 ? resolve() : reject()
      });
    }
  }))
}

const excludeList = [
  'build',
  'dist',
  '.cache',
  'protractor',
]

// diff -ur --exclude=... my-app-name-v107/app/ my-app-name-v108/app/
function diff (app, first, second) {
  const DLBaseFolder = resolve('.', 'slugs') // does NOT end in slash
  const diffCacheFolder = resolve('.', 'diffs') 
  const diffCacheFile = resolve(diffCacheFolder, `${app}__${second.hash}__${first.hash}.diff.html`)
  return new Promise(((resolve, reject) => {
    mkdirSync(diffCacheFolder, { recursive: true })
    if (existsSync(diffCacheFile)) {
      resolve(readFileSync(diffCacheFile).toString())
    } else {
      const args = ['-ur']
      excludeList.forEach(folder => args.push(`--exclude=${folder}`))
      args.push(`${DLBaseFolder}/${second.hash}/${app}/app/`)
      args.push(`${DLBaseFolder}/${first.hash}/${app}/app/`)
  
      console.log(`diff ${args.join(' ')}`)
  
      try {
        execSync(`diff ${args.join(' ')}`).toString()
        resolve('No changes')
      } catch ({ stdout }) { // diffs always have an exit code of 1 if there is a difference
        const diffHTML = parseDiff(stdout.toString(), first.version, second.version)
        writeFile(diffCacheFile, diffHTML, (err) => {
          if (err) reject()
          else resolve(diffHTML)
        })
      }
    }
  }))
}

module.exports = {
  fetchApps,
  getAll,
  downloadSlug,
  diff,
}