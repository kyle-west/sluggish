const slugs = require('./lib/heroku-slugs')
const { resolve } = require('path')

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

async function renderDiff(app, first, second) {
  await changePage('#hash-diff', `Comparing: ${app} ${second.version} to ${first.version}`, () => renderAppSlugs(app))
  await stamp('#hash-diff', `<div class="spinner"></div> Download complete. Computing diff...`)
  const diff = await slugs.diff(app, first, second)
  const rootPath = resolve('.', 'slugs')
  await stamp('#hash-diff', diff
    .replace(new RegExp(`${rootPath}/{${second.hash} → ${first.hash}}/${app}/app/`, 'g'), `{${second.version} → ${first.version}} :: `)
    .replace(new RegExp('<span class="d2h-tag d2h-moved d2h-moved-tag">RENAMED</span>', 'g'), '')
  )
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
    await stamp(appListId, allApps.map(app => {
      if (typeof app === 'string') {
        return `<li on-click-render-app>${app}</li>`
      } else {
        const { group, apps } = app
        return `<li><details><summary>${group}</summary><ul>${
          apps.map(a => `<li on-click-render-app>${a}</li>`).join('')
        }</ul></details></li>`
      }
    }).join(''));
    [...document.querySelectorAll('[on-click-render-app]')].forEach(element => {
      element.onclick = () => renderAppSlugs(element.innerText)
    })
  }
}

// Initial Page Load
window.addEventListener('DOMContentLoaded', async () => {
  renderAppList()
})