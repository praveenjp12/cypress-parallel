# cypress-json-html-reporter – Reusable CI Workflow

A reusable GitHub Actions workflow that runs Cypress tests **in parallel**, collects per-container JSON reports, and merges them into a single interactive HTML report.

---

## Repository structure

```
├── index.js                          # Spec-splitter: round-robin assigns spec files to containers
├── package.json                      # npm dependencies & local scripts
├── cypress.config.js                 # Cypress configuration (reporter, screenshots, videos)
├── cypress/
│   └── e2e/                          # Your spec files go here
│       └── test-spec.cy.js
└── .github/
    └── workflows/
        ├── runtest.yml               # ← REUSABLE workflow (call this from any repo)
        └── test-runtest.yml          # ← CALLER workflow (manual trigger in this repo)
```

---

## How it works

```
workflow_dispatch / external caller
          │
          ▼
  ┌───────────────┐
  │  setup job    │  Builds a dynamic matrix [0, 1, 2, ...] from numberOfParallel
  └──────┬────────┘
         │ (matrix)
   ┌─────┴──────────────────────┐
   │   cypress-run (parallel)   │  Each container:
   │  container 0 | 1 | 2 ...  │  1. Calls index.js to get its share of spec files
   └──────────────┬─────────────┘  2. Runs npx cypress run
                  │               3. Uploads report-container-N artifact
                  ▼
  ┌───────────────────────────────┐
  │     merge-and-report job      │  1. Downloads all report-container-* artifacts
  │    (runs even on failure)     │  2. Merges JSON files + screenshot maps
  └───────────────────────────────┘  3. Generates consolidated-report.html
                                     4. Uploads consolidated-test-report artifact
```

---

## Calling the workflow from another repository

Create a file in your repo, e.g. `.github/workflows/run-cypress.yml`:

```yaml
name: Run Cypress Tests

on:
  workflow_dispatch:

jobs:
  run-tests:
    uses: <your-org>/<this-repo>/.github/workflows/runtest.yml@main
    with:
      folderName: cypress/e2e
      reportFolderName: reports
      numberOfParallel: 3
      environmentVariables: 'BASE_URL=https://staging.example.com,ENV=staging'
      browserName: chrome
```

> Replace `<your-org>/<this-repo>` with the GitHub org/repo name where this project lives.

---

## Workflow inputs reference

| Input | Type | Default | Description |
|---|---|---|---|
| `folderName` | string | `cypress/e2e` | Relative path to the folder containing spec files |
| `reportFolderName` | string | `reports` | Folder where Cypress writes JSON reports |
| `numberOfParallel` | number | `3` | Number of parallel containers (1–10) |
| `environmentVariables` | string | *(empty)* | Comma-separated `KEY=VALUE` pairs forwarded to `--env` |
| `browserName` | string | `chrome` | Browser: `chrome`, `firefox`, or `edge` |

---

## How spec files are split (`index.js`)

`index.js` uses a **round-robin** strategy:

- All spec files in `folderName` are sorted alphabetically.
- Container `i` receives every file where `file_index % numberOfParallel === i`.

Example with 3 containers and 6 spec files:

| Spec file | Container |
|---|---|
| spec-a.cy.js | 0 |
| spec-b.cy.js | 1 |
| spec-c.cy.js | 2 |
| spec-d.cy.js | 0 |
| spec-e.cy.js | 1 |
| spec-f.cy.js | 2 |

---

## Artifacts produced

| Artifact name | Retention | Contents |
|---|---|---|
| `report-container-N` | 7 days | Raw JSON + screenshots for one container |
| `consolidated-test-report` | 14 days | All JSON files + `consolidated-report.html` |

Download `consolidated-test-report` from the **Actions → run → Artifacts** panel and open `consolidated-report.html` in a browser.

---

## Running locally

```bash
# Install dependencies
npm install

# Run Cypress tests
npx cypress run

# Generate HTML report from existing JSON reports
npm run report
```

---

## Prerequisites in the calling repository

- `package.json` must list `cypress` and `cypress-json-html-reporter` as dev dependencies.
- `cypress.config.js` must configure the reporter:

```js
const { defineConfig } = require("cypress");
const { setupJsonHtmlReporterEvents } = require("cypress-json-html-reporter/plugin");

module.exports = defineConfig({
  e2e: {
    reporter: "cypress-json-html-reporter",
    reporterOptions: {
      outputFile: "reports/test-report.json",
      screenshotOption: "always"
    },
    screenshotsFolder: "reports/screenshots",
    videosFolder: "reports/videos",
    setupNodeEvents(on, config) {
      setupJsonHtmlReporterEvents(on, config);
    },
  },
});
```

- `index.js` (the spec splitter) must be present at the **root** of the repository.
