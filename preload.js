const slugs = require('./lib/heroku-slugs')
const { resolve } = require('path')

function testSearch({ target: { value } }) {
  const searchable = [...document.querySelectorAll('[searchable]')]
  searchable.forEach(element => {
    if (value && element.innerText.indexOf(value) === -1) {
      element.classList.add('hidden')
    } else {
      element.classList.remove('hidden')
    }
  })
}

const delay = (time) => new Promise(r => setTimeout(() => r(), time))

const stamp = async (selector, text = '', inner = 'innerHTML') => {
  const element = document.querySelector(selector)
  if (element) {
    element[inner] = text
    element.removeAttribute('untouched')
  }
  await delay(100) // delay returning because I ran into a blocking race condition
  return element
}

const beenTouched = (selector) => document.querySelector(selector).getAttribute('untouched') === null

async function changePage (page, title, onBackClick) {
  [...document.querySelectorAll('[is-page-level]')].forEach(p => p.classList.add('hidden'));
  document.querySelector(page).classList.remove('hidden')

  if (title) {
    stamp('#instructions', title)
  } 
  if (onBackClick) {
    const btn = document.createElement('button');
    btn.onclick = onBackClick;
    btn.innerHTML = '⬅ Back';
    (await stamp('#back-button-wrapper')).appendChild(btn)
  } else {
    stamp('#back-button-wrapper')
  } 
}

function idify(str) {
  return str.replace(/\W/g, '_')
}

function buildFileTree (paths) {
  const root = {}
  paths.forEach(path => {
    let node = root
    path.split('/').forEach((part) => {
      node[part] = node[part] || {}
      node = node[part]
    })
  })
  return root
}

function buildFileTreeDOM (tree = {}, path = '') {
  const entries = Object.entries(tree)
  if (entries.length === 0) {
    return ''
  }
  return entries.map(([key, node]) => Object.keys(node).length ? (`
    <details ${path === '' ? 'open' : ''}>
      <summary>${key}</summary>
      ${buildFileTreeDOM(node, path + '/' + key)}
    </details>
  `): (`
    <a href="#${idify(path + '/' + key)}">${key}</a>
  `)).join('')
}

async function renderDiff(app, first, second) {
  await changePage('#hash-diff', `Comparing: ${app} ${second.version} to ${first.version}`, () => renderAppSlugs(app))
  await stamp('#hash-diff', `<div class="spinner"></div> Download complete. Computing diff...`)
  const diff = await slugs.diff(app, first, second)
  const rootPath = resolve('.', 'slugs')
  await stamp('#hash-diff', 
    '<div id="file-tree"></div>' + 
    diff
    .replace(new RegExp(`${rootPath}/{${second.hash} → ${first.hash}}/${app}/app/`, 'g'), `{${second.version} → ${first.version}} :: `)
    .replace(new RegExp('<span class="d2h-tag d2h-moved d2h-moved-tag">RENAMED</span>', 'g'), '')
  )
  
  const filenames = [...document.querySelectorAll('.d2h-file-name')]
  filenames.forEach(filename => filename.setAttribute('id', idify('/' + filename.innerText.replace(new RegExp(`{${second.version} → ${first.version}} :: `, 'g'), ''))))
  const fileTree = buildFileTree(filenames.map(x => x.innerText.replace(new RegExp(`{${second.version} → ${first.version}} :: `, 'g'), '')))
  window.fileTree = fileTree
  console.log(fileTree)
  
  await stamp('#file-tree', 'Files changed:<br/>' + buildFileTreeDOM(fileTree) + '<br/><hr/><br/>');

}

async function renderAppSlugs(app, pullFromCache = true) {
  await changePage('#slug-list', `Pick two slugs to compare in ${app}`, () => renderAppList())
  await stamp('#slug-list', `<div class="spinner"></div> Loading slugs for ${app}...`)
  try {
    const slugList = await slugs.getAll(app, pullFromCache)
    await stamp('#slug-list', `
      <button select-diff-slugs>Ready to compare</button>
      <button refresh-slug-list>Refresh List</button>
      <table class="slug-table">
        <tr><th>Select 2</th><th>Version</th><th>Hash</th></tr>
        ${slugList.map(({version, hash}) => `
          <tr><td><input type="checkbox" value="${hash}" data-version="${version}"/></td><td>${version}</td><td>${hash}</td></tr>
        `).join('')}
      </table>
    `);
    document.querySelector('[select-diff-slugs]').onclick = async () => {
      const [first, second] = [...document.querySelectorAll('input[type=checkbox]')].filter(x => x.checked).map(x => ({ hash: x.value, version: x.getAttribute('data-version') }))
      const firstDL = slugs.downloadSlug(app, first.hash, (...args) => console.log('first', ...args))
      const secondDL = slugs.downloadSlug(app, second.hash, (...args) => console.log('second', ...args))

      await stamp('#slug-list', `
        <div class="spinner"></div> Downloading ${app}: ${first.version} and ${second.version}. This may take several minutes...
      `);

      await Promise.all([firstDL, secondDL])
      
      console.log(`ready to compare ${first.version} and ${second.version}`)

      renderDiff(app, first, second)
    }
    document.querySelector('[refresh-slug-list]').onclick = async () => renderAppSlugs(app, false)
  } catch (err) {
    await stamp('#slug-list', `<pre>${err.message}</pre>`)
  }
}

async function renderAppList () {
  const appListId = '#app-list'
  await changePage(appListId, 'Click on an app to inspect')
  if (!beenTouched(appListId)) {
    const allApps = await slugs.fetchApps()
    await stamp(appListId, 
      '<label for="search">Search</label> <input id="search" name="search" type="text"/><br/><hr/><br/>'+
      allApps.map(app => {
        if (typeof app === 'string') {
          return `<li searchable on-click-render-app>${app}</li>`
        } else {
          const { group, apps } = app
          return `<li searchable><details><summary>${group}</summary><ul>${
            apps.map(a => `<li on-click-render-app>${a}</li>`).join('')
          }</ul></details></li>`
        }}).join(''));
    [...document.querySelectorAll('[on-click-render-app]')].forEach(element => {
      element.onclick = () => renderAppSlugs(element.innerText)
    });
    const search = document.getElementById('search')
    search.oninput = testSearch
    search.focus()
  }
}

// Initial Page Load
window.addEventListener('DOMContentLoaded', async () => {
  renderAppList()
})