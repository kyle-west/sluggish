const slugs = require('./lib/heroku-slugs')


const stamp = (selector, text, inner = 'innerHTML') => {
  const element = document.querySelector(selector)
  if (element) {
    element[inner] = text
    element.removeAttribute('untouched')
  }
  return element
}

const beenTouched = (selector) => document.querySelector(selector).getAttribute('untouched') === null

function changePage (page) {
  [...document.querySelectorAll('[is-page-level]')].forEach(p => p.classList.add('hidden'));
  document.querySelector(page).classList.remove('hidden')
}

async function renderDiff(app, first, second) {
  changePage('#hash-diff')
  stamp('#hash-diff', `Download complete. Computing diff...`)
  const diff = await slugs.diff(app, first, second)
  const lhsRoot = slugs.computeDiffFileRoot(app, first.hash)
  const rhsRoot = slugs.computeDiffFileRoot(app, second.hash)

  stamp('#hash-diff', `<pre>${diff.map(line => {
    if (line.startsWith('diff')) {
      return '<h2>' + line.replace(/diff\s+-r/, '').replace(/--exclude=\w+/g, '').replace(lhsRoot, first.version + '::') .replace(rhsRoot, second.version + '::').trim().replace(/\s+/, ' ... ') + '</h2>'
    } else if (/^\d+/.test(line)) {
      return `\n\n\n<h3 line-label>${line}</h3>`
    } else if (line.startsWith('---')) {
      return `<hr/>`
    } else {
      return line
    }
  }).join('\n')}</pre>`)
}

async function renderAppSlugs(app) {
  changePage('#slug-list')
  stamp('#slug-list', 'Loading...')
  try {
    const slugList = await slugs.getAll(app)
    stamp('#slug-list', `
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

      stamp('#slug-list', `
        Downloading ${app}: ${first.version} and ${second.version}. This may take several minutes...
      `);

      await Promise.all([firstDL, secondDL])
      
      console.log(`ready to compare ${first.version} and ${second.version}`)

      renderDiff(app, first, second)
    }
  } catch (err) {
    stamp('#slug-list', `<pre>${err.message}</pre>`)
  }
}

async function renderAppList () {
  const appListId = '#app-list'
  changePage(appListId)
  if (!beenTouched(appListId)) {
    const allApps = await slugs.fetchApps()
    stamp(appListId, allApps.map(app => {
      if (typeof app === 'string') {
        return `<li on-click-render-app">${app}</li>`
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