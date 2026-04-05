# Cypress Parallel – Reusable Test Workflow

A **GitHub Actions reusable workflow** that runs Cypress tests in parallel containers, then merges the per-container results into a single consolidated HTML report.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [How It Works](#how-it-works)
- [Getting Started – Using the Workflow in Your Repository](#getting-started--using-the-workflow-in-your-repository)
  - [Prerequisites](#prerequisites)
  - [Step-by-Step Setup](#step-by-step-setup)
- [Workflow Inputs](#workflow-inputs)
- [Repository Structure](#repository-structure)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                     YOUR REPOSITORY (Caller)                        │
│                                                                      │
│  .github/workflows/your-tests.yml                                    │
│      ↓  uses: praveenjp12/cypress-parallel/.github/workflows/        │
│                runtest.yml@main                                      │
└──────────────┬───────────────────────────────────────────────────────┘
               │  workflow_call (reusable workflow)
               ▼
┌──────────────────────────────────────────────────────────────────────┐
│             praveenjp12/cypress-parallel  (This Repo)                │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Job 1 – setup                                                 │  │
│  │  Generates a JSON array of container indices [0, 1, … N-1]    │  │
│  └────────────────────────┬───────────────────────────────────────┘  │
│                           │                                          │
│  ┌────────────────────────▼───────────────────────────────────────┐  │
│  │  Job 2 – cypress-run  (matrix: N parallel containers)          │  │
│  │                                                                │  │
│  │  For each container:                                           │  │
│  │   1. Checkout caller repo (your tests + config)                │  │
│  │   2. Checkout this repo → .workflow-repo/                      │  │
│  │   3. Cache & install npm dependencies                          │  │
│  │   4. Run index.js to split specs via round-robin               │  │
│  │   5. Run Cypress on the assigned spec files                    │  │
│  │   6. Upload per-container report artifacts                     │  │
│  └────────────────────────┬───────────────────────────────────────┘  │
│                           │  always()                                │
│  ┌────────────────────────▼───────────────────────────────────────┐  │
│  │  Job 3 – merge-and-report                                      │  │
│  │                                                                │  │
│  │   1. Download all per-container report artifacts                │  │
│  │   2. Merge JSON reports with unique filenames                  │  │
│  │   3. Merge screenshot maps from each container                 │  │
│  │   4. Generate consolidated HTML report                         │  │
│  │   5. Upload final report artifact (retained 14 days)           │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### Key Components

| File | Purpose |
|---|---|
| `.github/workflows/runtest.yml` | The reusable workflow – orchestrates parallel test runs, report merging, and artifact uploads. |
| `.github/workflows/test-runtest.yml` | Example caller workflow that invokes `runtest.yml` (also used for self-testing). |
| `index.js` | **Spec splitter** – scans a folder for spec files and distributes them across containers using round-robin allocation. |
| `cypress.config.js` | Cypress configuration with `cypress-json-html-reporter` for JSON + HTML report generation, screenshots, and video recording. |
| `package.json` | Declares `cypress` and `cypress-json-html-reporter` as dev dependencies. |

---

## How It Works

### 1. Spec Splitting (`index.js`)

The `index.js` script is the core of the parallelisation strategy. It takes three arguments:

```
node index.js <CONTAINER_INDEX> <TOTAL_CONTAINERS> <SPEC_FOLDER>
```

It recursively discovers every spec file in the given folder, sorts them alphabetically, then assigns files to containers using a **round-robin** algorithm:

```
Container 0 → specs[0], specs[3], specs[6], ...
Container 1 → specs[1], specs[4], specs[7], ...
Container 2 → specs[2], specs[5], specs[8], ...
```

This ensures an even distribution of spec files regardless of how many containers are used.

### 2. Parallel Execution

GitHub Actions' `matrix` strategy spins up N containers (default: 3). Each container:

1. Checks out **your** repository (so it has your tests, config, and `node_modules` cache key).
2. Checks out **this** repository into `.workflow-repo/` to access `index.js`.
3. Runs `index.js` to determine which spec files it owns.
4. Executes `npx cypress run` with only those spec files.
5. Uploads its `reports/` folder as an artifact.

### 3. Report Merging

After all containers finish (pass **or** fail), a final job:

1. Downloads every `report-container-*` artifact.
2. Copies all JSON files into a single `reports/` folder (de-duplicating with UUIDs).
3. Merges `.screenshot-map.json` files from each container.
4. Runs `cypress-json-html-reporter` to generate a single **consolidated HTML report**.
5. Uploads the final report as `consolidated-test-report` (retained for 14 days).

---

## Getting Started – Using the Workflow in Your Repository

### Prerequisites

- A repository with Cypress tests located in a folder (default: `cypress/e2e`).
- `cypress` and `cypress-json-html-reporter` listed as dev dependencies:
  ```json
  {
    "devDependencies": {
      "cypress": "^15.11.0",
      "cypress-json-html-reporter": "1.0.2"
    }
  }
  ```
- A `cypress.config.js` that enables the reporter:
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
      video: true,
      screenshotsFolder: "reports/screenshots",
      videosFolder: "reports/videos",
      setupNodeEvents(on, config) {
        setupJsonHtmlReporterEvents(on, config);
      },
    },
  });
  ```

### Step-by-Step Setup

**1. Create a workflow file** in your repository at `.github/workflows/run-tests.yml`:

```yaml
name: Run Cypress Tests

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:
    inputs:
      numberOfParallel:
        description: 'Number of parallel containers'
        required: false
        default: '3'
      browserName:
        description: 'Browser (chrome | firefox | edge)'
        required: false
        default: 'chrome'

jobs:
  test:
    uses: praveenjp12/cypress-parallel/.github/workflows/runtest.yml@main
    with:
      folderName: cypress/e2e
      reportFolderName: reports
      numberOfParallel: ${{ fromJson(github.event.inputs.numberOfParallel || '3') }}
      browserName: ${{ github.event.inputs.browserName || 'chrome' }}
```

**2. That's it!** Push this file to your repository. The workflow will:

- Run on every push to `main`, on every PR, and on manual dispatch.
- Split your Cypress specs across 3 parallel containers (configurable).
- Produce a consolidated HTML report available as a downloadable artifact.

### Minimal Example (fewest lines)

If you just want the defaults with no manual dispatch inputs:

```yaml
name: Cypress Tests

on: [push, pull_request]

jobs:
  test:
    uses: praveenjp12/cypress-parallel/.github/workflows/runtest.yml@main
```

This uses all default values: `cypress/e2e` spec folder, `reports` output, 3 containers, Chrome browser.

---

## Workflow Inputs

All inputs are **optional** with sensible defaults:

| Input | Type | Default | Description |
|---|---|---|---|
| `folderName` | `string` | `cypress/e2e` | Relative path to the folder containing spec files. |
| `reportFolderName` | `string` | `reports` | Relative path where test reports are written. |
| `numberOfParallel` | `number` | `3` | Number of parallel containers (1–10). |
| `environmentVariables` | `string` | `''` | Comma-separated `key=value` pairs passed to Cypress `--env`. |
| `browserName` | `string` | `chrome` | Browser to run tests in (`chrome`, `firefox`, or `edge`). |

---

## Repository Structure

```
.
├── .github/
│   └── workflows/
│       ├── runtest.yml          # Reusable workflow (the main product)
│       └── test-runtest.yml     # Self-test caller workflow
├── cypress/
│   ├── e2e/                     # Sample spec files
│   ├── fixtures/
│   ├── support/
│   └── videos/
├── cypress.config.js            # Cypress + reporter configuration
├── index.js                     # Spec file splitter (round-robin)
├── package.json                 # Dependencies
└── README.md
```
