const slugs = require('./lib/heroku-slugs')


const stamp = async (selector, text = '', inner = 'innerHTML') => {
  const element = document.querySelector(selector)
  if (element) {
    element[inner] = text
    element.removeAttribute('untouched')
  }
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
  await stamp('#hash-diff', `Download complete. Computing diff...`)
  const diff = await slugs.diff(app, first, second)
  await stamp('#hash-diff', diff)
}

async function renderAppSlugs(app) {
  await changePage('#slug-list', `Pick two slugs to compare in ${app}`, () => renderAppList())
  await stamp('#slug-list', 'Loading...')
  try {
    const slugList = await slugs.getAll(app)
    await stamp('#slug-list', `
      <button select-diff-slugs>Ready to compare</button>
      <table>
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
        Downloading ${app}: ${first.version} and ${second.version}. This may take several minutes...
      `);

      await Promise.all([firstDL, secondDL])
      
      console.log(`ready to compare ${first.version} and ${second.version}`)

      renderDiff(app, first, second)
    }
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